import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('tuition_grades')
    .select('*, tuition_classes(*, tuition_students(*))')
    .order('order_index')
    .order('order_index', { referencedTable: 'tuition_classes' })
    .order('name', { referencedTable: 'tuition_classes.tuition_students' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Rename nested keys for frontend compatibility
  const mapped = (data ?? []).map((g: Record<string, unknown>) => ({
    ...g,
    classes: ((g.tuition_classes as Record<string, unknown>[]) ?? []).map((c: Record<string, unknown>) => ({
      ...c,
      students: c.tuition_students ?? [],
    })),
  }))

  return NextResponse.json(mapped)
}

export async function POST(request: Request) {
  const body = await request.json()

  const { count } = await supabase.from('tuition_grades').select('*', { count: 'exact', head: true })
  const { data, error } = await supabase
    .from('tuition_grades')
    .insert({ name: body.name, order_index: count ?? 0 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
