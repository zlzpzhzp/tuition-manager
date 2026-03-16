import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('student_id')
  const billingMonth = searchParams.get('billing_month')

  let query = supabase.from('tuition_payments').select('*, student:tuition_students(*, class:tuition_classes(*))').order('payment_date', { ascending: false })
  if (studentId) query = query.eq('student_id', studentId)
  if (billingMonth) query = query.eq('billing_month', billingMonth)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json()

  // 같은 학생+월에 이미 납부 기록이 있으면 업데이트
  const { data: existing } = await supabase
    .from('tuition_payments')
    .select('id')
    .eq('student_id', body.student_id)
    .eq('billing_month', body.billing_month)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('tuition_payments')
      .update({
        amount: body.amount,
        method: body.method,
        payment_date: body.payment_date,
        cash_receipt: body.cash_receipt ?? null,
        memo: body.memo || null,
      })
      .eq('id', existing.id)
      .select('*, student:tuition_students(*)')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('tuition_payments')
    .insert({
      student_id: body.student_id,
      amount: body.amount,
      method: body.method,
      payment_date: body.payment_date,
      billing_month: body.billing_month,
      cash_receipt: body.cash_receipt ?? null,
      memo: body.memo || null,
    })
    .select('*, student:tuition_students(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
