import { NextRequest, NextResponse } from 'next/server'
import { sendBill } from '@/lib/payssam'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { studentId, studentName, phone, amount, productName, billingMonth } = await request.json()

    if (!studentId || !phone || !amount) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다' }, { status: 400 })
    }

    const result = await sendBill({
      studentName,
      phone,
      amount,
      productName: productName || `${billingMonth} 수업료`,
      message: `${studentName} ${billingMonth} 수업료`,
    })

    if (result.code === '0000') {
      // 청구서 발송 성공 → DB에 기록
      await supabase.from('tuition_bill_history').insert({
        student_id: studentId,
        bill_id: result.bill_id,
        amount,
        billing_month: billingMonth,
        phone: phone.replace(/-/g, ''),
        status: 'sent',
        short_url: (result as Record<string, unknown>).shortURL as string || null,
        sent_at: new Date().toISOString(),
      })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[PaySsam] 청구서 발송 실패:', error)
    return NextResponse.json({ error: '청구서 발송 중 오류가 발생했습니다' }, { status: 500 })
  }
}
