import { NextRequest, NextResponse } from 'next/server'
import { sendBill, destroyBill } from '@/lib/payssam'
import { supabase } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/auth'
import { isBusinessHourKst, nextBusinessSlot, formatKst } from '@/lib/schedule'

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  try {
    const { studentId, studentName, phone, billingMonth, amounts, persist } = await request.json()

    if (!studentId || !phone || !Array.isArray(amounts) || !billingMonth) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다' }, { status: 400 })
    }
    if (amounts.length < 2 || amounts.length > 4) {
      return NextResponse.json({ error: '분할 개수는 2~4개만 가능합니다' }, { status: 400 })
    }
    const sanitized = amounts.map(a => Number(a)).filter(n => Number.isFinite(n) && n > 0)
    if (sanitized.length !== amounts.length) {
      return NextResponse.json({ error: '모든 분할 금액은 0원보다 커야 합니다' }, { status: 400 })
    }

    const cleanPhone = phone.replace(/-/g, '')
    if (!/^01[016789]\d{7,8}$/.test(cleanPhone)) {
      return NextResponse.json({ error: '유효하지 않은 전화번호입니다' }, { status: 400 })
    }

    // 영업시간 외 요청 → 큐에 예약 (분할도 단일 큐 엔트리로, cron이 처리 시 분할 발송)
    if (!isBusinessHourKst()) {
      const scheduledAt = nextBusinessSlot()
      const { error: queueError } = await supabase.from('tuition_bill_queue').insert({
        student_id: studentId,
        student_name: studentName,
        phone: cleanPhone,
        billing_month: billingMonth,
        is_regular_tuition: true,
        send_type: 'split',
        payload: { amounts: sanitized, persist: persist !== false },
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending',
      })

      if (queueError) {
        console.error('[PaySsam] 분할 큐 등록 실패:', queueError)
        return NextResponse.json({ error: '예약 등록 실패' }, { status: 500 })
      }

      return NextResponse.json({
        code: 'SCHEDULED',
        msg: `영업시간 외 요청 → ${formatKst(scheduledAt)} KST 에 자동 발송됩니다`,
        scheduled_at: scheduledAt.toISOString(),
        scheduled_at_kst: formatKst(scheduledAt),
      })
    }

    // 1) 기존 sent 정규 청구서 파기
    const { data: existing } = await supabase
      .from('tuition_bill_history')
      .select('bill_id, amount, is_regular_tuition')
      .eq('student_id', studentId)
      .eq('billing_month', billingMonth)
      .eq('status', 'sent')

    const activeRegular = (existing ?? []).filter(b => b.is_regular_tuition !== false)
    for (const bill of activeRegular) {
      try {
        const destroyResult = await destroyBill(bill.bill_id, bill.amount)
        if (destroyResult.code === '0000') {
          await supabase
            .from('tuition_bill_history')
            .update({ status: 'destroyed', updated_at: new Date().toISOString() })
            .eq('bill_id', bill.bill_id)
        } else {
          return NextResponse.json({ error: `기존 청구서 파기 실패: ${destroyResult.msg}`, code: destroyResult.code }, { status: 502 })
        }
      } catch (e) {
        console.error('[PaySsam split-send] 기존 청구서 파기 오류:', e)
        return NextResponse.json({ error: '기존 청구서 파기 중 오류' }, { status: 500 })
      }
    }

    // 2) N개 청구서 순차 발송
    const parts = sanitized.length
    const results: { idx: number; bill_id: string; short_url: string | null; amount: number }[] = []
    const failures: { idx: number; amount: number; error: string }[] = []

    for (let i = 0; i < parts; i++) {
      const amount = sanitized[i]
      const label = `분할 ${i + 1}/${parts}`
      const [y, m] = billingMonth.split('-')
      const productName = `${y}년 ${parseInt(m)}월 수업료 (${label})`
      const message = `${studentName} ${productName}`
      try {
        const result = await sendBill({
          studentName,
          phone: cleanPhone,
          amount,
          productName,
          message,
        })
        if (result.code === '0000') {
          const billId = result.bill_id as string
          const shortUrl = (result as { shortURL?: string }).shortURL ?? null
          await supabase.from('tuition_bill_history').insert({
            student_id: studentId,
            bill_id: billId,
            amount,
            billing_month: billingMonth,
            phone: cleanPhone,
            status: 'sent',
            short_url: shortUrl,
            sent_at: new Date().toISOString(),
            is_regular_tuition: true,
            bill_note: label,
          })
          results.push({ idx: i + 1, bill_id: billId, short_url: shortUrl, amount })
        } else {
          failures.push({ idx: i + 1, amount, error: result.msg || '발송 실패' })
        }
      } catch (e) {
        console.error('[PaySsam split-send] 분할 발송 오류:', e)
        failures.push({ idx: i + 1, amount, error: '네트워크 오류' })
      }
    }

    // 3) 학생 레코드에 분할 설정 저장 (다음달 자동 분할용)
    if (persist !== false && results.length === parts) {
      await supabase
        .from('tuition_students')
        .update({
          split_billing_parts: parts,
          split_billing_amounts: sanitized,
        })
        .eq('id', studentId)
    }

    if (failures.length > 0) {
      return NextResponse.json({
        code: 'PARTIAL',
        msg: `${results.length}/${parts}건 발송 성공, ${failures.length}건 실패`,
        results,
        failures,
      }, { status: 207 })
    }

    return NextResponse.json({
      code: '0000',
      msg: `${parts}건 분할 청구서 발송 완료`,
      results,
    })
  } catch (error) {
    console.error('[PaySsam] 분할 발송 실패:', error)
    return NextResponse.json({ error: '분할 발송 중 오류가 발생했습니다' }, { status: 500 })
  }
}
