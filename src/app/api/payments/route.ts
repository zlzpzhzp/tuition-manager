import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { writeAuditLog } from '@/lib/auditLog'

const DESTROY_DELAY_MS = 60 * 60 * 1000 // 1시간 (착각 복구용 버퍼)

const METHOD_LABEL: Record<string, string> = {
  card: '카드',
  transfer: '계좌이체',
  cash: '현금',
  payssam: '결제선생',
  remote: '비대면',
  other: '기타',
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('student_id')
  const billingMonth = searchParams.get('billing_month')

  let query = supabase.from('tuition_payments').select('id, student_id, amount, method, payment_date, billing_month, cash_receipt, memo, created_at').order('payment_date', { ascending: false })
  if (studentId) query = query.eq('student_id', studentId)
  if (billingMonth) query = query.eq('billing_month', billingMonth)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const body = await request.json()

  const validMethods = ['card', 'transfer', 'cash', 'payssam', 'remote', 'other']
  const validationError = validateInput([
    rules.required('student_id', body.student_id),
    rules.nonNegativeNumber('amount', body.amount),
    rules.validDate('payment_date', body.payment_date),
    rules.billingMonth('billing_month', body.billing_month),
    rules.oneOf('method', body.method, validMethods),
  ])
  if (validationError) return validationError

  const payload = {
    student_id: body.student_id,
    amount: body.amount,
    method: body.method,
    payment_date: body.payment_date,
    billing_month: body.billing_month,
    cash_receipt: body.cash_receipt ?? null,
    memo: body.memo || null,
  }

  const { data, error } = await supabase
    .from('tuition_payments')
    .insert(payload)
    .select('*, student:tuition_students(*)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const paymentWithStudent = data as { student?: { name?: string } | null } | null
  const studentName = paymentWithStudent?.student?.name ?? body.student_id
  writeAuditLog('payment', data.id, 'create',
    `납부 등록: ${studentName} ${body.billing_month} ${body.amount?.toLocaleString()}원`,
    { ...payload, student_name: studentName })

  // 다른 결제수단으로 저장 시 같은 학생·월의 미결제 PaySsam 청구서 1시간 뒤 파기 예약
  // 즉시 파기하지 않는 이유: 착각 입력을 1시간 이내 취소하면 청구서 복구 가능해야 함.
  if (body.method !== 'payssam') {
    const { data: sentBills } = await supabase
      .from('tuition_bill_history')
      .select('bill_id, amount, phone')
      .eq('student_id', body.student_id)
      .eq('billing_month', body.billing_month)
      .eq('is_regular_tuition', true)
      .eq('status', 'sent')

    if (sentBills && sentBills.length > 0) {
      const methodLabel = METHOD_LABEL[body.method] || body.method
      const { data: studentRow } = await supabase
        .from('tuition_students')
        .select('name')
        .eq('id', body.student_id)
        .single()
      const studentName = studentRow?.name ?? ''
      const scheduledAt = new Date(Date.now() + DESTROY_DELAY_MS)
      for (const bill of sentBills) {
        const { error: queueError } = await supabase.from('tuition_bill_queue').insert({
          student_id: body.student_id,
          student_name: studentName,
          phone: bill.phone ?? '',
          billing_month: body.billing_month,
          is_regular_tuition: true,
          bill_note: `${methodLabel} 결제 — 1시간 뒤 청구서 자동 파기`,
          send_type: 'destroy',
          payload: { billId: bill.bill_id, amount: bill.amount, methodLabel, paymentId: data.id },
          scheduled_at: scheduledAt.toISOString(),
          status: 'pending',
        })
        if (queueError) {
          console.error('[delayed-destroy] 큐 등록 실패:', bill.bill_id, queueError)
        }
      }
    }
  }

  return NextResponse.json(data)
}
