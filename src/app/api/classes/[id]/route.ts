import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const validationError = validateInput([
    rules.optionalString('name', body.name),
    rules.nonNegativeNumber('monthly_fee', body.monthly_fee),
  ])
  if (validationError) return validationError

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.monthly_fee !== undefined) updates.monthly_fee = body.monthly_fee
  if (body.grade_id !== undefined) updates.grade_id = body.grade_id
  if (body.subject !== undefined) updates.subject = body.subject || null
  if (body.class_days !== undefined) updates.class_days = body.class_days || null
  if (body.order_index !== undefined) updates.order_index = body.order_index

  const { data, error } = await supabase
    .from('tuition_classes')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await supabase.from('tuition_classes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
