import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const teacherId = searchParams.get('teacher_id')
  const billingMonth = searchParams.get('billing_month')

  let query = supabase.from('teacher_bonuses').select('*').order('created_at', { ascending: false })
  if (teacherId) query = query.eq('teacher_id', teacherId)
  if (billingMonth) query = query.eq('billing_month', billingMonth)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json()
  if (!body.teacher_id || !body.billing_month || body.amount == null) {
    return NextResponse.json({ error: 'teacher_id, billing_month, amount required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('teacher_bonuses')
    .insert({
      teacher_id: body.teacher_id,
      billing_month: body.billing_month,
      amount: body.amount,
      memo: body.memo || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
