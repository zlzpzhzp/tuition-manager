import { NextRequest, NextResponse } from 'next/server'
import { destroyBill, sendBill } from '@/lib/payssam'
import { supabase } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/auth'

// 기존 청구서 파기 + 같은 조건(학생·월·금액)으로 새 청구서 발송.
// 새 bill_id가 발급되므로 PaySsam/카톡 입장에선 별개 캠페인 → 스팸 감지 안 걸림.
export async function POST(request: NextRequest) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  try {
    const { billId, amount } = await request.json()
    if (!billId || !amount) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다' }, { status: 400 })
    }

    const { data: oldBill } = await supabase
      .from('tuition_bill_history')
      .select('student_id, billing_month, phone, is_regular_tuition, status')
      .eq('bill_id', billId)
      .single()

    if (!oldBill) {
      return NextResponse.json({ error: '기존 청구서를 찾을 수 없습니다' }, { status: 404 })
    }
    if (oldBill.status !== 'sent') {
      return NextResponse.json({ error: '발송 상태가 아닌 청구서는 재발송할 수 없습니다' }, { status: 400 })
    }

    // 이미 결제된 건이면 차단 (#77이 놓친 edge case 방어)
    const { data: existingPayment } = await supabase
      .from('tuition_payments')
      .select('id')
      .eq('student_id', oldBill.student_id)
      .eq('billing_month', oldBill.billing_month)
      .maybeSingle()
    if (existingPayment) {
      return NextResponse.json({ error: '이미 결제된 건입니다. 재발송할 수 없습니다', code: 'ALREADY_PAID' }, { status: 409 })
    }

    const { data: student } = await supabase
      .from('tuition_students')
      .select('name')
      .eq('id', oldBill.student_id)
      .single()
    if (!student) {
      return NextResponse.json({ error: '학생을 찾을 수 없습니다' }, { status: 404 })
    }

    // 1단계: 기존 청구서 파기
    const destroyResult = await destroyBill(billId, amount)
    if (destroyResult.code !== '0000') {
      return NextResponse.json({ error: '기존 청구서 파기 실패', detail: destroyResult }, { status: 500 })
    }
    await supabase
      .from('tuition_bill_history')
      .update({
        status: 'destroyed',
        bill_note: '수동 재발송으로 파기',
        updated_at: new Date().toISOString(),
      })
      .eq('bill_id', billId)

    // 2단계: 새 청구서 발송 (새 bill_id 자동 발급)
    const productName = `${oldBill.billing_month.replace('-', '년 ')}월 수업료`
    const sendResult = await sendBill({
      studentName: student.name,
      phone: oldBill.phone,
      amount,
      productName,
      message: `${student.name} ${productName}`,
    }) as { code?: string; msg?: string; bill_id?: string; shortURL?: string }

    if (sendResult.code === '0000') {
      await supabase.from('tuition_bill_history').insert({
        student_id: oldBill.student_id,
        bill_id: sendResult.bill_id,
        amount,
        billing_month: oldBill.billing_month,
        phone: oldBill.phone,
        status: 'sent',
        short_url: sendResult.shortURL ?? null,
        sent_at: new Date().toISOString(),
        is_regular_tuition: oldBill.is_regular_tuition,
        bill_note: '수동 재발송',
      })
    }

    return NextResponse.json(sendResult)
  } catch (error) {
    console.error('[PaySsam] 재발송 실패:', error)
    return NextResponse.json({ error: '재발송 중 오류가 발생했습니다' }, { status: 500 })
  }
}
