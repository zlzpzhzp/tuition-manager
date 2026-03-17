import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data, error } = await supabase
    .from('tuition_students')
    .select('*, class:tuition_classes(*, grade:tuition_grades(*))')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const validationError = validateInput([
    rules.optionalString('name', body.name),
    rules.optionalDate('enrollment_date', body.enrollment_date),
    rules.nonNegativeNumber('custom_fee', body.custom_fee),
  ])
  if (validationError) return validationError

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.class_id !== undefined) updates.class_id = body.class_id
  if (body.phone !== undefined) updates.phone = body.phone || null
  if (body.parent_phone !== undefined) updates.parent_phone = body.parent_phone || null
  if (body.enrollment_date !== undefined) updates.enrollment_date = body.enrollment_date
  if (body.withdrawal_date !== undefined) updates.withdrawal_date = body.withdrawal_date
  if (body.custom_fee !== undefined) updates.custom_fee = body.custom_fee
  if (body.payment_due_day !== undefined) updates.payment_due_day = body.payment_due_day
  if (body.has_discuss !== undefined) updates.has_discuss = body.has_discuss
  if (body.memo !== undefined) updates.memo = body.memo || null

  const { data, error } = await supabase
    .from('tuition_students')
    .update(updates)
    .eq('id', id)
    .select('*, class:tuition_classes(*, grade:tuition_grades(*))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await supabase.from('tuition_students').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
