import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'

interface SupabaseGrade {
  id: string
  name: string
  order_index: number
  created_at: string
  tuition_classes?: SupabaseClass[]
}

interface SupabaseClass {
  id: string
  grade_id: string
  name: string
  monthly_fee: number
  subject?: string | null
  class_days?: string | null
  order_index: number
  created_at: string
  tuition_students?: unknown[]
}

export async function GET() {
  const { data, error } = await supabase
    .from('tuition_grades')
    .select('*, tuition_classes(*, tuition_students(*))')
    .order('order_index')
    .order('order_index', { referencedTable: 'tuition_classes' })
    .order('name', { referencedTable: 'tuition_classes.tuition_students' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const mapped = ((data as SupabaseGrade[]) ?? []).map(g => ({
    ...g,
    classes: (g.tuition_classes ?? []).map(c => ({
      ...c,
      students: c.tuition_students ?? [],
    })),
  }))

  return NextResponse.json(mapped)
}

export async function POST(request: Request) {
  const body = await request.json()

  const validationError = validateInput([rules.requiredString('name', body.name)])
  if (validationError) return validationError

  const { count } = await supabase.from('tuition_grades').select('*', { count: 'exact', head: true })
  const { data, error } = await supabase
    .from('tuition_grades')
    .insert({ name: body.name, order_index: count ?? 0 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
