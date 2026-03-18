import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const gradeId = searchParams.get('grade_id')

  let query = supabase.from('tuition_classes').select('*, grade:tuition_grades(*), tuition_students(*)').order('order_index')
  if (gradeId) query = query.eq('grade_id', gradeId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const mapped = (data ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    students: c.tuition_students ?? [],
  }))

  return NextResponse.json(mapped)
}

export async function POST(request: Request) {
  const body = await request.json()

  const validationError = validateInput([
    rules.requiredString('name', body.name),
    rules.nonNegativeNumber('monthly_fee', body.monthly_fee),
    rules.required('grade_id', body.grade_id),
  ])
  if (validationError) return validationError

  const { data, error } = await supabase
    .from('tuition_classes')
    .insert({
      grade_id: body.grade_id,
      name: body.name,
      monthly_fee: body.monthly_fee ?? 0,
      subject: body.subject || null,
      class_days: body.class_days || null,
      order_index: Math.floor(Date.now() / 1000) % 2000000000,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
