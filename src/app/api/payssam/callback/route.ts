import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 2.2 승인동기화 — 페이민트 → 우리 서버
// 결제 완료 시 페이민트가 이 URL로 결과를 전달
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const { apikey, bill_id, appr_state, appr_price, appr_pay_type, appr_dt, appr_num } = data

    console.log('[PaySsam Callback]', JSON.stringify({ bill_id, appr_state, appr_price, appr_pay_type }))

    // bill_history 업데이트
    const statusMap: Record<string, string> = {
      F: 'paid',    // 결제완료
      W: 'pending', // 미결제
      C: 'cancelled', // 취소
      D: 'destroyed', // 파기
    }

    const updateData: Record<string, unknown> = {
      status: statusMap[appr_state] || appr_state,
      appr_num: appr_num || null,
      appr_price: appr_price ? parseInt(appr_price) : null,
      appr_pay_type: appr_pay_type || null,
      appr_dt: appr_dt || null,
      updated_at: new Date().toISOString(),
    }

    await supabase
      .from('tuition_bill_history')
      .update(updateData)
      .eq('bill_id', bill_id)

    // 결제 완료(F)인 경우 → 자동으로 납부 기록 생성
    if (appr_state === 'F' && bill_id) {
      const { data: billData } = await supabase
        .from('tuition_bill_history')
        .select('student_id, amount, billing_month')
        .eq('bill_id', bill_id)
        .single()

      if (billData) {
        // 이미 납부 기록이 있는지 확인
        const { data: existingPayment } = await supabase
          .from('tuition_payments')
          .select('id')
          .eq('student_id', billData.student_id)
          .eq('billing_month', billData.billing_month)
          .single()

        if (!existingPayment) {
          await supabase.from('tuition_payments').insert({
            student_id: billData.student_id,
            amount: parseInt(appr_price) || billData.amount,
            method: 'payssam',
            payment_date: new Date().toISOString().split('T')[0],
            billing_month: billData.billing_month,
            memo: `결제선생 자동수납 (${appr_pay_type || 'card'})`,
          })
        }
      }
    }

    // 페이민트가 "0000" 응답을 받으면 검수 완료
    return NextResponse.json({ code: '0000', msg: '성공하였습니다.' })
  } catch (error) {
    console.error('[PaySsam Callback] 처리 실패:', error)
    return NextResponse.json({ code: '9999', msg: '처리 실패' }, { status: 500 })
  }
}
