import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// 대기 중인 결제선생 큐 엔트리(타임락 예약) 조회 — 월별 pending 상태만.
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get('month')
  if (!month) return NextResponse.json({ error: 'month required' }, { status: 400 })

  const { data, error } = await supabase
    .from('tuition_bill_queue')
    .select('id, student_id, billing_month, send_type, scheduled_at, is_regular_tuition, created_at')
    .eq('billing_month', month)
    .eq('status', 'pending')
    .order('scheduled_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
