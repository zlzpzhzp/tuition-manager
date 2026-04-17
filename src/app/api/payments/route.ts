import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { writeAuditLog } from '@/lib/auditLog'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('student_id')
  const billingMonth = searchParams.get('billing_month')

  let query = supabase.from('tuition_payments').select('id, student_id, amount, method, payment_date, billing_month, cash_receipt, memo, created_at').order('payment_date', { ascending: false })
  if (studentId) query = query.eq('student_id', studentId)
  if (billingMonth) query = query.eq('billing_month', billingMonth)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json()

  const validMethods = ['card', 'transfer', 'cash', 'payssam', 'remote', 'other']
  const validationError = validateInput([
    rules.required('student_id', body.student_id),
    rules.nonNegativeNumber('amount', body.amount),
    rules.validDate('payment_date', body.payment_date),
    rules.billingMonth('billing_month', body.billing_month),
    rules.oneOf('method', body.method, validMethods),
  ])
  if (validationError) return validationError

  const payload = {
    student_id: body.student_id,
    amount: body.amount,
    method: body.method,
    payment_date: body.payment_date,
    billing_month: body.billing_month,
    cash_receipt: body.cash_receipt ?? null,
    memo: body.memo || null,
  }

  const { data, error } = await supabase
    .from('tuition_payments')
    .insert(payload)
    .select('*, student:tuition_students(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const studentName = (data as Record<string, unknown>).student
    ? ((data as Record<string, unknown>).student as Record<string, unknown>).name
    : body.student_id
  writeAuditLog('payment', data.id, 'create',
    `납부 등록: ${studentName} ${body.billing_month} ${body.amount?.toLocaleString()}원`,
    { ...payload, student_name: studentName })

  return NextResponse.json(data)
}
