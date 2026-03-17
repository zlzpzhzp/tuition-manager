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

  // Input validation
  const errors: string[] = []
  if (!body.student_id) errors.push('student_id is required')
  if (body.amount === undefined || body.amount === null || Number(body.amount) < 0) errors.push('amount must be >= 0')
  if (!body.payment_date || isNaN(Date.parse(body.payment_date))) errors.push('payment_date must be a valid date (YYYY-MM-DD)')
  if (!body.billing_month || !/^\d{4}-\d{2}$/.test(body.billing_month)) errors.push('billing_month must be in YYYY-MM format')
  const validMethods = ['remote', 'card', 'transfer', 'cash', 'other']
  if (!body.method || !validMethods.includes(body.method)) errors.push(`method must be one of: ${validMethods.join(', ')}`)
  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 400 })

  // upsert on (student_id, billing_month) to prevent duplicate race conditions
  const { data, error } = await supabase
    .from('tuition_payments')
    .upsert(
      {
        student_id: body.student_id,
        amount: body.amount,
        method: body.method,
        payment_date: body.payment_date,
        billing_month: body.billing_month,
        cash_receipt: body.cash_receipt ?? null,
        memo: body.memo || null,
      },
      { onConflict: 'student_id,billing_month' }
    )
    .select('*, student:tuition_students(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
