import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

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

  // Input validation
  const errors: string[] = []
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') errors.push('name is required and must be a non-empty string')
  if (!body.class_id) errors.push('class_id is required')
  if (!body.enrollment_date || isNaN(Date.parse(body.enrollment_date))) errors.push('enrollment_date must be a valid date (YYYY-MM-DD)')
  if (body.custom_fee !== undefined && body.custom_fee !== null && Number(body.custom_fee) < 0) errors.push('custom_fee must be >= 0')
  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 400 })

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
  return NextResponse.json(data)
}
