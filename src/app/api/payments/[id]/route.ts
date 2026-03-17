import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  // Input validation
  const errors: string[] = []
  if (body.amount !== undefined && Number(body.amount) < 0) errors.push('amount must be >= 0')
  if (body.payment_date !== undefined && isNaN(Date.parse(body.payment_date))) errors.push('payment_date must be a valid date (YYYY-MM-DD)')
  const validMethods = ['remote', 'card', 'transfer', 'cash', 'other']
  if (body.method !== undefined && !validMethods.includes(body.method)) errors.push(`method must be one of: ${validMethods.join(', ')}`)
  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 400 })

  // DB CHECK constraint에 'other'가 없으므로 'cash'로 저장하고 메모에 실제 수단 기록
  const isOther = body.method === 'other'
  const updates: Record<string, unknown> = {}
  if (body.amount !== undefined) updates.amount = body.amount
  if (body.method !== undefined) updates.method = isOther ? 'cash' : body.method
  if (body.payment_date !== undefined) updates.payment_date = body.payment_date
  if (body.memo !== undefined) updates.memo = isOther ? `[기타:${body.memo || '기타'}]` : (body.memo || null)

  const { data, error } = await supabase
    .from('tuition_payments')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await supabase.from('tuition_payments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
