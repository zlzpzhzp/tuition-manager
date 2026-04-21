import { NextRequest, NextResponse } from 'next/server'
import { resendBill } from '@/lib/payssam'
import { supabase } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/auth'
import { isBusinessHourKst, nextBusinessSlot, formatKst } from '@/lib/schedule'

// 기존 청구서 bill_id 그대로 유지하면서 카톡 알림만 다시 푸시.
// /if/bill/resend 호출 → 새 bill 발급 없음, 기존 결제 링크 그대로.
export async function POST(request: NextRequest) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  try {
    const { billId, amount } = await request.json()
    if (!billId) {
      return NextResponse.json({ error: 'billId 누락' }, { status: 400 })
    }

    const { data: bill } = await supabase
      .from('tuition_bill_history')
      .select('student_id, billing_month, phone, is_regular_tuition, status, resend_count')
      .eq('bill_id', billId)
      .single()

    if (!bill) {
      return NextResponse.json({ error: '청구서를 찾을 수 없습니다' }, { status: 404 })
    }
    if (bill.status !== 'sent') {
      return NextResponse.json({ error: '발송 상태가 아닌 청구서는 재발송할 수 없습니다' }, { status: 400 })
    }

    const { data: existingPayment } = await supabase
      .from('tuition_payments')
      .select('id')
      .eq('student_id', bill.student_id)
      .eq('billing_month', bill.billing_month)
      .maybeSingle()
    if (existingPayment) {
      return NextResponse.json({ error: '이미 결제된 건입니다', code: 'ALREADY_PAID' }, { status: 409 })
    }

    // 영업시간 외 → 재발송 큐 등록 (send_type='resend')
    if (!isBusinessHourKst()) {
      const { data: student } = await supabase
        .from('tuition_students')
        .select('name')
        .eq('id', bill.student_id)
        .single()
      const scheduledAt = nextBusinessSlot()
      const { error: queueError } = await supabase.from('tuition_bill_queue').insert({
        student_id: bill.student_id,
        student_name: student?.name ?? '',
        phone: bill.phone,
        billing_month: bill.billing_month,
        is_regular_tuition: bill.is_regular_tuition,
        bill_note: '수동 재발송 예약 (카톡 알림)',
        send_type: 'resend',
        payload: { billId },
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending',
      })
      if (queueError) {
        console.error('[PaySsam resend] 큐 등록 실패:', queueError)
        return NextResponse.json({ error: '예약 등록 실패' }, { status: 500 })
      }
      return NextResponse.json({
        code: 'SCHEDULED',
        msg: `영업시간 외 요청 → ${formatKst(scheduledAt)} KST 에 자동 재발송됩니다`,
        scheduled_at: scheduledAt.toISOString(),
        scheduled_at_kst: formatKst(scheduledAt),
      })
    }

    const result = await resendBill(billId)
    if (result.code !== '0000') {
      return NextResponse.json({ error: '재발송 실패', code: result.code, msg: result.msg }, { status: 500 })
    }

    await supabase
      .from('tuition_bill_history')
      .update({
        resend_count: (bill.resend_count ?? 0) + 1,
        last_resend_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('bill_id', billId)

    void amount
    return NextResponse.json({ code: '0000', msg: '재발송 완료' })
  } catch (error) {
    console.error('[PaySsam] 재발송 실패:', error)
    return NextResponse.json({ error: '재발송 중 오류가 발생했습니다' }, { status: 500 })
  }
}
