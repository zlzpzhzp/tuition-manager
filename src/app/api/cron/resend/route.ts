import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { resendBill, readBill } from '@/lib/payssam'

// Vercel Cron 전용 엔드포인트. CRON_SECRET으로 보호.
// 매일 15:00 KST(06:00 UTC) 실행 — 미결제 PaySsam 청구서를 5일 간격으로 최대 3회 재발송.
// 주말(토/일) 실행 시 스킵 → 실질 발송은 월~금 15:00 KST.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // 주말 스킵 (KST 기준 요일 판정). Sat=6, Sun=0
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const kstDay = kstNow.getUTCDay()
  if (kstDay === 0 || kstDay === 6) {
    return NextResponse.json({ ok: true, skipped: 'weekend', kst_day: kstDay, at: now.toISOString() })
  }

  const fiveDaysAgoISO = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()

  // sent 상태 + (재발송 없음 | 마지막 재발송 5일 이상 경과) + resend_count < 3
  const { data: candidates, error } = await supabase
    .from('tuition_bill_history')
    .select('bill_id, amount, student_id, billing_month, resend_count, last_resend_at, sent_at')
    .eq('status', 'sent')
    .eq('is_regular_tuition', true)
    .lt('resend_count', 3)

  if (error) {
    console.error('[cron/resend] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const summary = { checked: 0, resent: 0, synced_paid: 0, skipped: 0, failed: 0 }

  for (const bill of candidates || []) {
    summary.checked++
    const lastActionAt = bill.last_resend_at || bill.sent_at
    if (lastActionAt && new Date(lastActionAt) > new Date(fiveDaysAgoISO)) {
      summary.skipped++
      continue
    }

    try {
      // 안전장치 1: 이미 다른 수단으로 결제된 경우 → 재발송 금지 (#77 흐름의 누수 보완)
      const { data: existingPayment } = await supabase
        .from('tuition_payments')
        .select('id, method')
        .eq('student_id', bill.student_id)
        .eq('billing_month', bill.billing_month)
        .maybeSingle()
      if (existingPayment) {
        summary.skipped++
        continue
      }

      // 안전장치 2: 실제 결제 상태 조회. 이미 결제완료면 DB 동기화만 하고 재발송 스킵.
      const readResult = await readBill(bill.bill_id) as { code?: string; appr_state?: string }
      if (readResult.code === '0000' && readResult.appr_state === 'F') {
        await supabase
          .from('tuition_bill_history')
          .update({ status: 'paid', updated_at: new Date().toISOString() })
          .eq('bill_id', bill.bill_id)

        const { data: existing } = await supabase
          .from('tuition_payments')
          .select('id')
          .eq('student_id', bill.student_id)
          .eq('billing_month', bill.billing_month)
          .eq('method', 'payssam')
          .maybeSingle()

        if (!existing) {
          await supabase.from('tuition_payments').insert({
            student_id: bill.student_id,
            amount: bill.amount,
            method: 'payssam',
            payment_date: new Date().toISOString().slice(0, 10),
            billing_month: bill.billing_month,
            memo: '결제선생 자동수납 (재발송 확인 시 동기화)',
          })
        }
        summary.synced_paid++
        continue
      }

      const resendResult = await resendBill(bill.bill_id) as { code?: string }
      if (resendResult.code === '0000') {
        await supabase
          .from('tuition_bill_history')
          .update({
            resend_count: (bill.resend_count || 0) + 1,
            last_resend_at: now.toISOString(),
            bill_note: `자동 재발송 ${(bill.resend_count || 0) + 1}회차`,
            updated_at: now.toISOString(),
          })
          .eq('bill_id', bill.bill_id)
        summary.resent++
      } else {
        summary.failed++
      }
    } catch (e) {
      console.error('[cron/resend] bill error:', bill.bill_id, e)
      summary.failed++
    }
  }

  return NextResponse.json({ ok: true, ...summary, at: now.toISOString() })
}
