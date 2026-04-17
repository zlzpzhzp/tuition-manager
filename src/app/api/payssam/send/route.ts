import { NextRequest, NextResponse } from 'next/server'
import { sendBill } from '@/lib/payssam'
import { supabase } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  try {
    const { studentId, studentName, phone, amount, productName, billingMonth, isRegularTuition } = await request.json()

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

    // 중복 발송 방지: 같은 학생+같은 월에 활성 청구서가 있으면 차단
    const { data: existingBills } = await supabase
      .from('tuition_bill_history')
      .select('bill_id, status')
      .eq('student_id', studentId)
      .eq('billing_month', billingMonth)
      .in('status', ['sent', 'paid'])

    if (existingBills && existingBills.length > 0) {
      const activeBill = existingBills.find(b => b.status === 'sent')
      const paidBill = existingBills.find(b => b.status === 'paid')

      if (paidBill) {
        return NextResponse.json({ error: '이미 결제 완료된 청구서가 있습니다', code: 'ALREADY_PAID' }, { status: 409 })
      }
      if (activeBill) {
        return NextResponse.json({ error: '이미 발송된 청구서가 있습니다. 기존 청구서를 파기한 후 다시 발송해주세요.', code: 'ALREADY_SENT', bill_id: activeBill.bill_id }, { status: 409 })
      }
    }

    const result = await sendBill({
      studentName,
      phone: cleanPhone,
      amount,
      productName: productName || `${billingMonth.replace('-', '년 ')}월 수업료`,
      message: `${studentName} ${billingMonth.replace('-', '년 ')}월 수업료`,
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
        is_regular_tuition: isRegularTuition !== false,
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
