import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const billingMonth = searchParams.get('billing_month')

  // 해당 월이 처음 열리면 이전 월 고정비를 복사해 승계
  if (billingMonth) {
    const { data: seen } = await supabase
      .from('academy_finance_months')
      .select('billing_month')
      .eq('billing_month', billingMonth)
      .maybeSingle()

    if (!seen) {
      const { data: prev } = await supabase
        .from('academy_expenses')
        .select('billing_month')
        .eq('category', 'fixed')
        .lt('billing_month', billingMonth)
        .order('billing_month', { ascending: false })
        .limit(1)

      if (prev?.[0]?.billing_month) {
        const { data: toCopy } = await supabase
          .from('academy_expenses')
          .select('category, name, amount, memo')
          .eq('billing_month', prev[0].billing_month)
          .eq('category', 'fixed')

        if (toCopy?.length) {
          await supabase.from('academy_expenses').insert(
            toCopy.map(e => ({ ...e, billing_month: billingMonth }))
          )
        }
      }

      await supabase.from('academy_finance_months').insert({ billing_month: billingMonth })
    }
  }

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
