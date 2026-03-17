import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { queryGradesTree, mapGradesTree } from '@/lib/queries'

export async function GET() {
  const { data, error } = await queryGradesTree()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(mapGradesTree(data ?? []))
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
