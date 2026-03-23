import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { writeAuditLog } from '@/lib/auditLog'

export async function GET() {
  const { data, error } = await supabase
    .from('tuition_teachers')
    .select('*')
    .order('order_index')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json()

  const validationError = validateInput([
    rules.requiredString('name', body.name),
  ])
  if (validationError) return validationError

  const { data, error } = await supabase
    .from('tuition_teachers')
    .insert({
      name: body.name,
      phone: body.phone || null,
      subject: body.subject || null,
      memo: body.memo || null,
      order_index: Math.floor(Date.now() / 1000) % 2000000000,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  writeAuditLog('teacher', data.id, 'create',
    `선생님 등록: ${body.name}${body.subject ? ` (${body.subject})` : ''}`,
    { name: body.name, phone: body.phone, subject: body.subject })

  return NextResponse.json(data)
}
