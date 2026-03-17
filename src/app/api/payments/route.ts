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

  // Check if payment already exists for this student/month
  const { data: existing } = await supabase
    .from('tuition_payments')
    .select('id')
    .eq('student_id', body.student_id)
    .eq('billing_month', body.billing_month)
    .maybeSingle()

  // DB CHECK constraint에 'other'가 없으므로 'cash'로 저장하고 메모에 실제 수단 기록
  const isOther = body.method === 'other'
  const dbMethod = isOther ? 'cash' : body.method
  const dbMemo = isOther
    ? `[기타:${body.memo || '기타'}]`
    : (body.memo || null)

  const payload = {
    student_id: body.student_id,
    amount: body.amount,
    method: dbMethod,
    payment_date: body.payment_date,
    billing_month: body.billing_month,
    cash_receipt: body.cash_receipt ?? null,
    memo: dbMemo,
  }

  let data, error
  if (existing?.id) {
    // Update existing payment
    const result = await supabase
      .from('tuition_payments')
      .update(payload)
      .eq('id', existing.id)
      .select('*, student:tuition_students(*)')
      .single()
    data = result.data
    error = result.error
  } else {
    // Insert new payment
    const result = await supabase
      .from('tuition_payments')
      .insert(payload)
      .select('*, student:tuition_students(*)')
      .single()
    data = result.data
    error = result.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
