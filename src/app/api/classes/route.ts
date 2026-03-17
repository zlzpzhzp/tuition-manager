import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

  // Input validation
  const errors: string[] = []
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') errors.push('name is required and must be a non-empty string')
  if (body.monthly_fee !== undefined && body.monthly_fee !== null && Number(body.monthly_fee) < 0) errors.push('monthly_fee must be >= 0')
  if (!body.grade_id) errors.push('grade_id is required')
  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 400 })

  const { count } = await supabase
    .from('tuition_classes')
    .select('*', { count: 'exact', head: true })
    .eq('grade_id', body.grade_id)

  const { data, error } = await supabase
    .from('tuition_classes')
    .insert({
      grade_id: body.grade_id,
      name: body.name,
      monthly_fee: body.monthly_fee ?? 0,
      subject: body.subject || null,
      class_days: body.class_days || null,
      order_index: count ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
