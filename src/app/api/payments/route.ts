import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { validateInput, rules } from '@/lib/validate'
import { writeAuditLog } from '@/lib/auditLog'
import { destroyBill } from '@/lib/payssam'

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

  // 다른 결제수단으로 저장 시 같은 학생·월의 미결제 PaySsam 청구서 자동 파기
  if (body.method !== 'payssam') {
    const { data: sentBills } = await supabase
      .from('tuition_bill_history')
      .select('bill_id, amount')
      .eq('student_id', body.student_id)
      .eq('billing_month', body.billing_month)
      .eq('is_regular_tuition', true)
      .eq('status', 'sent')

    if (sentBills && sentBills.length > 0) {
      const methodLabel = METHOD_LABEL[body.method] || body.method
      for (const bill of sentBills) {
        try {
          const result = await destroyBill(bill.bill_id, bill.amount)
          if (result.code === '0000') {
            await supabase
              .from('tuition_bill_history')
              .update({
                status: 'destroyed',
                bill_note: `${methodLabel} 결제로 자동 파기`,
                updated_at: new Date().toISOString(),
              })
              .eq('bill_id', bill.bill_id)
          }
        } catch (e) {
          console.error('[auto-destroy] bill 파기 실패:', bill.bill_id, e)
        }
      }
    }
  }

  return NextResponse.json(data)
}
