import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { writeAuditLog } from '@/lib/auditLog'
import { requireAdminSession } from '@/lib/auth'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  const { id } = await params
  const body = await request.json()

  const validMethods = ['card', 'transfer', 'cash', 'payssam', 'remote', 'other']
  const validationError = validateInput([
    rules.nonNegativeNumber('amount', body.amount),
    rules.optionalDate('payment_date', body.payment_date),
    ...(body.method !== undefined ? [rules.oneOf('method', body.method, validMethods)] : []),
  ])
  if (validationError) return validationError

  const updates: Record<string, unknown> = {}
  if (body.amount !== undefined) updates.amount = body.amount
  if (body.method !== undefined) updates.method = body.method
  if (body.payment_date !== undefined) updates.payment_date = body.payment_date
  if (body.memo !== undefined) updates.memo = body.memo || null

  const { data, error } = await supabase
    .from('tuition_payments')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const fields = Object.keys(updates).join(', ')
  writeAuditLog('payment', id, 'update', `납부 수정: ${fields}`, updates)

  return NextResponse.json(data)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  const { id } = await params

  // 삭제 전 데이터 조회
  const { data: existing } = await supabase
    .from('tuition_payments')
    .select('*, student:tuition_students(name)')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('tuition_payments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 아직 실행되지 않은 파기 예약 취소 (1시간 버퍼 안에서 삭제하면 청구서 복구)
  await supabase
    .from('tuition_bill_queue')
    .update({ status: 'cancelled', error_msg: '납부 취소로 파기 예약 해제', sent_at: new Date().toISOString() })
    .eq('send_type', 'destroy')
    .eq('status', 'pending')
    .filter('payload->>paymentId', 'eq', id)

  if (existing) {
    const existingWithStudent = existing as { student?: { name?: string } | null; billing_month?: string; amount?: number } | null
    const studentName = existingWithStudent?.student?.name ?? ''
    writeAuditLog('payment', id, 'delete',
      `납부 삭제: ${studentName} ${existing.billing_month} ${existing.amount?.toLocaleString()}원`,
      existing)
  }

  return NextResponse.json({ success: true })
}
