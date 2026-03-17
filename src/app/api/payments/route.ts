import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { encodePaymentMethod } from '@/lib/utils'

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

  const validMethods = ['remote', 'card', 'transfer', 'cash', 'other']
  const validationError = validateInput([
    rules.required('student_id', body.student_id),
    rules.nonNegativeNumber('amount', body.amount),
    rules.validDate('payment_date', body.payment_date),
    rules.billingMonth('billing_month', body.billing_month),
    rules.oneOf('method', body.method, validMethods),
  ])
  if (validationError) return validationError

  const { data: existing } = await supabase
    .from('tuition_payments')
    .select('id')
    .eq('student_id', body.student_id)
    .eq('billing_month', body.billing_month)
    .maybeSingle()

  const { dbMethod, dbMemo } = encodePaymentMethod(body.method, body.memo)

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
    const result = await supabase
      .from('tuition_payments')
      .update(payload)
      .eq('id', existing.id)
      .select('*, student:tuition_students(*)')
      .single()
    data = result.data
    error = result.error
  } else {
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
