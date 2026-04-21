import { NextRequest, NextResponse } from 'next/server'
import { sendBill, destroyBill, resendBill } from '@/lib/payssam'
import { supabase } from '@/lib/supabase'
import { isBusinessHourKst } from '@/lib/schedule'

// Vercel Cron 전용. CRON_SECRET으로 보호.
// 평일 11:00 KST (02:00 UTC) 실행 — 큐에 쌓인 예약 청구서를 일괄 발송.
// 영업시간 외에 실수로 호출되는 것 방지용 isBusinessHourKst 게이트도 함께 체크.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isBusinessHourKst()) {
    return NextResponse.json({ ok: true, skipped: 'outside_business_hours', at: new Date().toISOString() })
  }

  const now = new Date()
  const { data: pending, error } = await supabase
    .from('tuition_bill_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error('[cron/send-queued] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const summary = { checked: 0, sent: 0, failed: 0, skipped_duplicate: 0 }

  for (const row of pending ?? []) {
    summary.checked++
    try {
      // 정규 수업료 중복 발송 방지 (예약 후 사이에 수동 발송된 케이스 대비)
      if (row.is_regular_tuition) {
        const { data: existing } = await supabase
          .from('tuition_bill_history')
          .select('bill_id, status, is_regular_tuition')
          .eq('student_id', row.student_id)
          .eq('billing_month', row.billing_month)
          .in('status', ['sent', 'paid'])

        const regularBills = (existing ?? []).filter(b => b.is_regular_tuition !== false)
        if (regularBills.length > 0 && row.send_type === 'single') {
          await supabase
            .from('tuition_bill_queue')
            .update({ status: 'cancelled', error_msg: '이미 발송/결제된 정규 청구서 존재', sent_at: now.toISOString() })
            .eq('id', row.id)
          summary.skipped_duplicate++
          continue
        }
      }

      if (row.send_type === 'single') {
        const { amount, productName, message } = row.payload as { amount: number; productName: string; message: string }
        const result = await sendBill({
          studentName: row.student_name,
          phone: row.phone,
          amount,
          productName,
          message,
        })

        if (result.code === '0000') {
          const billId = result.bill_id as string
          const shortUrl = (result as { shortURL?: string }).shortURL ?? null
          await supabase.from('tuition_bill_history').insert({
            student_id: row.student_id,
            bill_id: billId,
            amount,
            billing_month: row.billing_month,
            phone: row.phone,
            status: 'sent',
            short_url: shortUrl,
            sent_at: now.toISOString(),
            is_regular_tuition: row.is_regular_tuition,
            bill_note: row.bill_note,
          })
          await supabase
            .from('tuition_bill_queue')
            .update({ status: 'sent', bill_id: billId, sent_at: now.toISOString() })
            .eq('id', row.id)
          summary.sent++
        } else {
          await supabase
            .from('tuition_bill_queue')
            .update({ status: 'failed', error_msg: result.msg || '발송 실패', sent_at: now.toISOString() })
            .eq('id', row.id)
          summary.failed++
        }
      } else if (row.send_type === 'reissue') {
        const { amount, productName, message, oldBillId } = row.payload as { amount: number; productName: string; message: string; oldBillId: string }

        // 기존 청구서 아직 sent면 파기
        const { data: oldBill } = await supabase
          .from('tuition_bill_history')
          .select('status')
          .eq('bill_id', oldBillId)
          .single()

        if (oldBill?.status === 'sent') {
          const destroyResult = await destroyBill(oldBillId, amount)
          if (destroyResult.code === '0000') {
            await supabase
              .from('tuition_bill_history')
              .update({ status: 'destroyed', bill_note: '수동 재발송 (예약)으로 파기', updated_at: now.toISOString() })
              .eq('bill_id', oldBillId)
          }
        }

        const sendResult = await sendBill({
          studentName: row.student_name,
          phone: row.phone,
          amount,
          productName,
          message,
        })
        if (sendResult.code === '0000') {
          const newBillId = sendResult.bill_id as string
          const shortUrl = (sendResult as { shortURL?: string }).shortURL ?? null
          await supabase.from('tuition_bill_history').insert({
            student_id: row.student_id,
            bill_id: newBillId,
            amount,
            billing_month: row.billing_month,
            phone: row.phone,
            status: 'sent',
            short_url: shortUrl,
            sent_at: now.toISOString(),
            is_regular_tuition: row.is_regular_tuition,
            bill_note: '수동 재발송 (예약)',
          })
          await supabase
            .from('tuition_bill_queue')
            .update({ status: 'sent', bill_id: newBillId, sent_at: now.toISOString() })
            .eq('id', row.id)
          summary.sent++
        } else {
          await supabase
            .from('tuition_bill_queue')
            .update({ status: 'failed', error_msg: sendResult.msg || '재발송 실패', sent_at: now.toISOString() })
            .eq('id', row.id)
          summary.failed++
        }
      } else if (row.send_type === 'resend') {
        const { billId } = row.payload as { billId: string }

        const { data: bill } = await supabase
          .from('tuition_bill_history')
          .select('status, resend_count')
          .eq('bill_id', billId)
          .single()

        if (!bill || bill.status !== 'sent') {
          await supabase
            .from('tuition_bill_queue')
            .update({ status: 'cancelled', error_msg: '대상 청구서 상태 변동', sent_at: now.toISOString() })
            .eq('id', row.id)
          summary.skipped_duplicate++
          continue
        }

        const result = await resendBill(billId)
        if (result.code === '0000') {
          await supabase
            .from('tuition_bill_history')
            .update({
              resend_count: (bill.resend_count ?? 0) + 1,
              last_resend_at: now.toISOString(),
              updated_at: now.toISOString(),
            })
            .eq('bill_id', billId)
          await supabase
            .from('tuition_bill_queue')
            .update({ status: 'sent', bill_id: billId, sent_at: now.toISOString() })
            .eq('id', row.id)
          summary.sent++
        } else {
          await supabase
            .from('tuition_bill_queue')
            .update({ status: 'failed', error_msg: result.msg || '재발송 실패', sent_at: now.toISOString() })
            .eq('id', row.id)
          summary.failed++
        }
      } else if (row.send_type === 'split') {
        const { amounts, persist } = row.payload as { amounts: number[]; persist: boolean }
        const parts = amounts.length

        // 기존 정규 sent 파기
        const { data: existing } = await supabase
          .from('tuition_bill_history')
          .select('bill_id, amount, is_regular_tuition')
          .eq('student_id', row.student_id)
          .eq('billing_month', row.billing_month)
          .eq('status', 'sent')

        const activeRegular = (existing ?? []).filter(b => b.is_regular_tuition !== false)
        for (const bill of activeRegular) {
          try {
            const destroyResult = await destroyBill(bill.bill_id, bill.amount)
            if (destroyResult.code === '0000') {
              await supabase
                .from('tuition_bill_history')
                .update({ status: 'destroyed', updated_at: now.toISOString() })
                .eq('bill_id', bill.bill_id)
            }
          } catch (e) {
            console.error('[cron/send-queued] destroy error:', e)
          }
        }

        const successResults: { bill_id: string; amount: number }[] = []
        const failResults: { amount: number; error: string }[] = []

        for (let i = 0; i < parts; i++) {
          const amount = amounts[i]
          const label = `분할 ${i + 1}/${parts}`
          const [y, m] = row.billing_month.split('-')
          const productName = `${y}년 ${parseInt(m)}월 수업료 (${label})`
          const message = `${row.student_name} ${productName}`
          try {
            const result = await sendBill({
              studentName: row.student_name,
              phone: row.phone,
              amount,
              productName,
              message,
            })
            if (result.code === '0000') {
              const billId = result.bill_id as string
              const shortUrl = (result as { shortURL?: string }).shortURL ?? null
              await supabase.from('tuition_bill_history').insert({
                student_id: row.student_id,
                bill_id: billId,
                amount,
                billing_month: row.billing_month,
                phone: row.phone,
                status: 'sent',
                short_url: shortUrl,
                sent_at: now.toISOString(),
                is_regular_tuition: true,
                bill_note: label,
              })
              successResults.push({ bill_id: billId, amount })
            } else {
              failResults.push({ amount, error: result.msg || '발송 실패' })
            }
          } catch (e) {
            console.error('[cron/send-queued] split send error:', e)
            failResults.push({ amount, error: '네트워크 오류' })
          }
        }

        if (persist && successResults.length === parts) {
          await supabase
            .from('tuition_students')
            .update({
              split_billing_parts: parts,
              split_billing_amounts: amounts,
            })
            .eq('id', row.student_id)
        }

        if (failResults.length === 0) {
          await supabase
            .from('tuition_bill_queue')
            .update({ status: 'sent', sent_at: now.toISOString() })
            .eq('id', row.id)
          summary.sent++
        } else {
          await supabase
            .from('tuition_bill_queue')
            .update({
              status: 'failed',
              error_msg: `${successResults.length}/${parts}건 성공, ${failResults.length}건 실패`,
              sent_at: now.toISOString(),
            })
            .eq('id', row.id)
          summary.failed++
        }
      }
    } catch (e) {
      console.error('[cron/send-queued] row error:', row.id, e)
      await supabase
        .from('tuition_bill_queue')
        .update({ status: 'failed', error_msg: (e as Error).message, sent_at: now.toISOString() })
        .eq('id', row.id)
      summary.failed++
    }
  }

  return NextResponse.json({ ok: true, ...summary, at: now.toISOString() })
}
