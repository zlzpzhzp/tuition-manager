import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { writeAuditLog } from '@/lib/auditLog'
import { requireAdminSession } from '@/lib/auth'

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
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
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
  if (body.memo !== undefined) updates.memo = body.memo || null
  if (body.memo_color !== undefined) updates.memo_color = body.memo_color || null
  if (body.split_billing_parts !== undefined) updates.split_billing_parts = body.split_billing_parts
  if (body.split_billing_amounts !== undefined) updates.split_billing_amounts = body.split_billing_amounts
  if (body.electives !== undefined) updates.electives = Array.isArray(body.electives) ? body.electives : []

  const { data, error } = await supabase
    .from('tuition_students')
    .update(updates)
    .eq('id', id)
    .select('*, class:tuition_classes(*, grade:tuition_grades(*))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // memo/memo_color 변경은 빈번하므로 중요 변경만 로그
  const importantKeys = ['name', 'class_id', 'custom_fee', 'payment_due_day', 'withdrawal_date', 'enrollment_date']
  const changed = Object.keys(updates).filter(k => importantKeys.includes(k))
  if (changed.length > 0) {
    const name = data.name || id
    writeAuditLog('student', id, 'update', `학생 수정: ${name} (${changed.join(', ')})`, updates)
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  const { id } = await params

  const { data: existing } = await supabase
    .from('tuition_students')
    .select('name')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('tuition_students').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  writeAuditLog('student', id, 'delete', `학생 삭제: ${existing?.name ?? id}`, existing ?? undefined)

  return NextResponse.json({ success: true })
}
