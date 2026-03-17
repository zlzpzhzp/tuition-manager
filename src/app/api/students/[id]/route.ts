import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

  // Input validation
  const errors: string[] = []
  if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim() === '')) errors.push('name must be a non-empty string')
  if (body.enrollment_date !== undefined && isNaN(Date.parse(body.enrollment_date))) errors.push('enrollment_date must be a valid date (YYYY-MM-DD)')
  if (body.custom_fee !== undefined && body.custom_fee !== null && Number(body.custom_fee) < 0) errors.push('custom_fee must be >= 0')
  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.class_id !== undefined) updates.class_id = body.class_id
  if (body.phone !== undefined) updates.phone = body.phone || null
  if (body.parent_phone !== undefined) updates.parent_phone = body.parent_phone || null
  if (body.enrollment_date !== undefined) updates.enrollment_date = body.enrollment_date
  if (body.withdrawal_date !== undefined) updates.withdrawal_date = body.withdrawal_date
  if (body.custom_fee !== undefined) updates.custom_fee = body.custom_fee
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
