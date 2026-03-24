import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const billingMonth = searchParams.get('billing_month')

  let query = supabase.from('academy_expenses').select('*').order('category').order('created_at')
  if (billingMonth) query = query.eq('billing_month', billingMonth)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json()
  if (!body.billing_month || !body.category || !body.name) {
    return NextResponse.json({ error: 'billing_month, category, name required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('academy_expenses')
    .insert({
      billing_month: body.billing_month,
      category: body.category,
      name: body.name,
      amount: body.amount ?? 0,
      memo: body.memo || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
