import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { writeAuditLog } from '@/lib/auditLog'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const validationError = validateInput([rules.requiredString('name', body.name)])
  if (validationError) return validationError

  const { data, error } = await supabase
    .from('tuition_grades')
    .update({ name: body.name })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  writeAuditLog('grade', id, 'update', `학년 수정: ${body.name}`, { name: body.name })

  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: existing } = await supabase
    .from('tuition_grades')
    .select('name')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('tuition_grades').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  writeAuditLog('grade', id, 'delete', `학년 삭제: ${existing?.name ?? id}`, existing ?? undefined)

  return NextResponse.json({ success: true })
}
