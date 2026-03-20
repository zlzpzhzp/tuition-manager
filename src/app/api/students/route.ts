import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { writeAuditLog } from '@/lib/auditLog'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const classId = searchParams.get('class_id')
  const activeOnly = searchParams.get('active') === 'true'

  let query = supabase.from('tuition_students').select('*, class:tuition_classes(*, grade:tuition_grades(*))').order('name')
  if (classId) query = query.eq('class_id', classId)
  if (activeOnly) query = query.is('withdrawal_date', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json()

  const validationError = validateInput([
    rules.requiredString('name', body.name),
    rules.required('class_id', body.class_id),
    rules.validDate('enrollment_date', body.enrollment_date),
    rules.nonNegativeNumber('custom_fee', body.custom_fee),
  ])
  if (validationError) return validationError

  const { data, error } = await supabase
    .from('tuition_students')
    .insert({
      class_id: body.class_id,
      name: body.name,
      phone: body.phone || null,
      parent_phone: body.parent_phone || null,
      enrollment_date: body.enrollment_date,
      custom_fee: body.custom_fee ?? null,
      memo: body.memo || null,
    })
    .select('*, class:tuition_classes(*, grade:tuition_grades(*))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  writeAuditLog('student', data.id, 'create', `학생 등록: ${body.name}`, { name: body.name, class_id: body.class_id })

  return NextResponse.json(data)
}
