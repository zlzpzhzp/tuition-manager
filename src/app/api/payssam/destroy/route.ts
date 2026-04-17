import { NextRequest, NextResponse } from 'next/server'
import { destroyBill } from '@/lib/payssam'
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

    const result = await destroyBill(billId, amount)

    if (result.code === '0000') {
      await supabase
        .from('tuition_bill_history')
        .update({ status: 'destroyed', updated_at: new Date().toISOString() })
        .eq('bill_id', billId)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[PaySsam] 청구서 파기 실패:', error)
    return NextResponse.json({ error: '청구서 파기 중 오류가 발생했습니다' }, { status: 500 })
  }
}
