import { NextRequest, NextResponse } from 'next/server'
import { sendBill } from '@/lib/payssam'
import { supabase } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/auth'
import { isBusinessHourKst, nextBusinessSlot, formatKst } from '@/lib/schedule'

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  try {
    const { studentId, studentName, phone, amount, productName, message, billingMonth, isRegularTuition, billNote } = await request.json()

    if (!studentId || !phone || !amount || !billingMonth) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다' }, { status: 400 })
    }

    if (amount <= 0) {
      return NextResponse.json({ error: '금액은 0원보다 커야 합니다' }, { status: 400 })
    }

    const cleanPhone = phone.replace(/-/g, '')
    if (!/^01[016789]\d{7,8}$/.test(cleanPhone)) {
      return NextResponse.json({ error: '유효하지 않은 전화번호입니다' }, { status: 400 })
    }

    const isRegular = isRegularTuition !== false

    // 정규 수업료만 중복 발송 방지 (보충비/분할결제 등 비정규는 중복 허용)
    if (isRegular) {
      const { data: existingBills } = await supabase
        .from('tuition_bill_history')
        .select('bill_id, status, is_regular_tuition')
        .eq('student_id', studentId)
        .eq('billing_month', billingMonth)
        .in('status', ['sent', 'paid'])

      const regularBills = (existingBills ?? []).filter(b => b.is_regular_tuition !== false)
      if (regularBills.length > 0) {
        const activeBill = regularBills.find(b => b.status === 'sent')
        const paidBill = regularBills.find(b => b.status === 'paid')

        if (paidBill) {
          return NextResponse.json({ error: '이미 결제 완료된 청구서가 있습니다', code: 'ALREADY_PAID' }, { status: 409 })
        }
        if (activeBill) {
          return NextResponse.json({ error: '이미 발송된 청구서가 있습니다. 기존 청구서를 파기한 후 다시 발송해주세요.', code: 'ALREADY_SENT', bill_id: activeBill.bill_id }, { status: 409 })
        }
      }
    }

    // 영업시간(평일 11:00~22:00, 토 11:00~20:00 KST) 외 요청 → 큐에 예약
    if (!isBusinessHourKst()) {
      const scheduledAt = nextBusinessSlot()
      const resolvedProductName = productName || `${billingMonth.replace('-', '년 ')}월 수업료`
      const resolvedMessage = (typeof message === 'string' && message.trim()) ? message : `${studentName} ${billingMonth.replace('-', '년 ')}월 수업료`

      const { error: queueError } = await supabase.from('tuition_bill_queue').insert({
        student_id: studentId,
        student_name: studentName,
        phone: cleanPhone,
        billing_month: billingMonth,
        is_regular_tuition: isRegular,
        bill_note: typeof billNote === 'string' && billNote.trim() ? billNote.trim() : null,
        send_type: 'single',
        payload: { amount, productName: resolvedProductName, message: resolvedMessage },
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending',
      })

      if (queueError) {
        console.error('[PaySsam] 큐 등록 실패:', queueError)
        return NextResponse.json({ error: '예약 등록 실패' }, { status: 500 })
      }

      return NextResponse.json({
        code: 'SCHEDULED',
        msg: `영업시간 외 요청 → ${formatKst(scheduledAt)} KST 에 자동 발송됩니다`,
        scheduled_at: scheduledAt.toISOString(),
        scheduled_at_kst: formatKst(scheduledAt),
      })
    }

    const result = await sendBill({
      studentName,
      phone: cleanPhone,
      amount,
      productName: productName || `${billingMonth.replace('-', '년 ')}월 수업료`,
      message: (typeof message === 'string' && message.trim()) ? message : `${studentName} ${billingMonth.replace('-', '년 ')}월 수업료`,
    })

    if (result.code === '0000') {
      // 청구서 발송 성공 → DB에 기록
      const { error: dbError } = await supabase.from('tuition_bill_history').insert({
        student_id: studentId,
        bill_id: result.bill_id,
        amount,
        billing_month: billingMonth,
        phone: cleanPhone,
        status: 'sent',
        short_url: (result as { shortURL?: string }).shortURL ?? null,
        sent_at: new Date().toISOString(),
        is_regular_tuition: isRegular,
        bill_note: typeof billNote === 'string' && billNote.trim() ? billNote.trim() : null,
      })

      if (dbError) {
        console.error('[PaySsam] DB 기록 실패 (청구서는 발송됨):', dbError)
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[PaySsam] 청구서 발송 실패:', error)
    return NextResponse.json({ error: '청구서 발송 중 오류가 발생했습니다' }, { status: 500 })
  }
}
