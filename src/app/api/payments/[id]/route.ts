import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { encodePaymentMethod } from '@/lib/utils'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const validMethods = ['remote', 'card', 'transfer', 'cash', 'other']
  const validationError = validateInput([
    rules.nonNegativeNumber('amount', body.amount),
    rules.optionalDate('payment_date', body.payment_date),
    ...(body.method !== undefined ? [rules.oneOf('method', body.method, validMethods)] : []),
  ])
  if (validationError) return validationError

  const updates: Record<string, unknown> = {}
  if (body.amount !== undefined) updates.amount = body.amount
  if (body.payment_date !== undefined) updates.payment_date = body.payment_date

  if (body.method !== undefined) {
    const { dbMethod, dbMemo } = encodePaymentMethod(body.method, body.memo)
    updates.method = dbMethod
    if (body.memo !== undefined) updates.memo = dbMemo
  } else if (body.memo !== undefined) {
    updates.memo = body.memo || null
  }

  const { data, error } = await supabase
    .from('tuition_payments')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await supabase.from('tuition_payments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
