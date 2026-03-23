import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { writeAuditLog } from '@/lib/auditLog'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabase
    .from('tuition_teachers')
    .select('*')
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
  ])
  if (validationError) return validationError

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.phone !== undefined) updates.phone = body.phone || null
  if (body.subject !== undefined) updates.subject = body.subject || null
  if (body.memo !== undefined) updates.memo = body.memo || null
  if (body.order_index !== undefined) updates.order_index = body.order_index

  const { data, error } = await supabase
    .from('tuition_teachers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const logKeys = Object.keys(updates).filter(k => k !== 'order_index')
  if (logKeys.length > 0) {
    writeAuditLog('teacher', id, 'update', `선생님 수정: ${data.name} (${logKeys.join(', ')})`, updates)
  }

  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: existing } = await supabase
    .from('tuition_teachers')
    .select('name, subject')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('tuition_teachers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  writeAuditLog('teacher', id, 'delete', `선생님 삭제: ${existing?.name ?? id}`, existing ?? undefined)

  return NextResponse.json({ success: true })
}
