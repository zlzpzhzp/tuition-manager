import { NextRequest, NextResponse } from 'next/server'
import { cancelBill } from '@/lib/payssam'
import { supabase } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  try {
    const { billId, amount } = await request.json()
    if (!billId || !amount) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다' }, { status: 400 })
    }

    const result = await cancelBill(billId, amount)

    if (result.code === '0000') {
      // bill_history 상태 변경 전에 student_id/billing_month 확보
      const { data: billRow } = await supabase
        .from('tuition_bill_history')
        .select('student_id, billing_month, is_regular_tuition')
        .eq('bill_id', billId)
        .single()

      await supabase
        .from('tuition_bill_history')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('bill_id', billId)

      // 콜백이 자동수납한 payments 레코드 제거 — 없으면 UI가 계속 "결제완료"로 보임
      if (billRow && billRow.is_regular_tuition !== false) {
        await supabase
          .from('tuition_payments')
          .delete()
          .eq('student_id', billRow.student_id)
          .eq('billing_month', billRow.billing_month)
          .eq('method', 'payssam')
      }
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[PaySsam] 결제 취소 실패:', error)
    return NextResponse.json({ error: '결제 취소 중 오류가 발생했습니다' }, { status: 500 })
  }
}
