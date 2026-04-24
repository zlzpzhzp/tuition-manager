'use client'

import { toast } from 'sonner'
import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Trash2, Plus, CreditCard, Calculator, LogOut } from 'lucide-react'
import type { Student, Payment, Grade, Class } from '@/types'
import { getStudentFee, calcRefund, parseClassDays, DAY_LABELS, PAYMENT_METHOD_LABELS, CASH_RECEIPT_LABELS, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/types'
import StudentModal from '@/components/StudentModal'
import PaymentModal from '@/components/PaymentModal'
import { safeFetch, safeMutate, getTodayString } from '@/lib/utils'

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [student, setStudent] = useState<Student | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [grades, setGrades] = useState<(Grade & { classes: Class[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showRefundCalc, setShowRefundCalc] = useState(false)
  const [refundDate, setRefundDate] = useState(getTodayString())

  const fetchData = useCallback(async () => {
    const [studentResult, paymentsResult] = await Promise.all([
      safeFetch<Student>(`/api/students/${id}`),
      safeFetch<Payment[]>(`/api/payments?student_id=${id}`),
    ])
    if (studentResult.error) {
      setLoading(false)
      return
    }
    setStudent(studentResult.data)
    setPayments(paymentsResult.data ?? [])
    setLoading(false)
  }, [id])

  const ensureGrades = useCallback(async () => {
    if (grades.length > 0) return
    const { data } = await safeFetch<(Grade & { classes: Class[] })[]>('/api/grades')
    setGrades(data ?? [])
  }, [grades.length])

  useEffect(() => { fetchData() }, [fetchData])

  const handleUpdateStudent = async (data: Partial<Student>) => {
    const { error } = await safeMutate(`/api/students/${id}`, 'PUT', data)
    if (error) {
      toast.error(`수정 실패: ${error}`)
      return
    }
    setShowEditModal(false)
    fetchData()
  }

  const handleDeleteStudent = async () => {
    if (!confirm(`"${student?.name}" 학생을 삭제하시겠습니까?`)) return
    const { error } = await safeMutate(`/api/students/${id}`, 'DELETE')
    if (error) {
      toast.error(`삭제 실패: ${error}`)
      return
    }
    router.push('/payments')
  }

  const handleWithdraw = async () => {
    if (!student) return
    const date = prompt('퇴원일을 입력하세요 (YYYY-MM-DD)', getTodayString())
    if (!date) return
    const { error } = await safeMutate(`/api/students/${id}`, 'PUT', { withdrawal_date: date })
    if (error) {
      toast.error(`퇴원 처리 실패: ${error}`)
      return
    }
    fetchData()
  }

  const handleReenroll = async () => {
    const { error } = await safeMutate(`/api/students/${id}`, 'PUT', { withdrawal_date: null })
    if (error) {
      toast.error(`재등록 실패: ${error}`)
      return
    }
    fetchData()
  }

  const handleSavePayment = async (data: Partial<Payment>) => {
    const { error } = await safeMutate('/api/payments', 'POST', data)
    if (error) {
      toast.error(`납부 기록 실패: ${error}`)
      return
    }
    setShowPaymentModal(false)
    fetchData()
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('이 납부 기록을 삭제하시겠습니까?')) return
    const { error } = await safeMutate(`/api/payments/${paymentId}`, 'DELETE')
    if (error) {
      toast.error(`삭제 실패: ${error}`)
      return
    }
    fetchData()
  }

  if (loading) return <div className="text-center py-12 text-[var(--text-4)]">로딩 중...</div>
  if (!student) return <div className="text-center py-12 text-[var(--text-4)]">학생을 찾을 수 없습니다</div>

  const fee = getStudentFee(student, student.class as Class | undefined)
  const _now = new Date()
  const currentMonth = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}`
  const currentMonthPayments = payments.filter(p => p.billing_month === currentMonth)
  const currentMonthTotal = currentMonthPayments.reduce((s, p) => s + p.amount, 0)
  const status = getPaymentStatus(currentMonthTotal, fee)
  const statusColors = PAYMENT_STATUS_COLORS[status]

  const classDays = student.class?.class_days ?? null
  const refund = showRefundCalc
    ? calcRefund(fee, new Date(student.enrollment_date), new Date(refundDate), classDays)
    : null

  const paymentsByMonth = payments.reduce<Record<string, Payment[]>>((acc, p) => {
    if (!acc[p.billing_month]) acc[p.billing_month] = []
    acc[p.billing_month].push(p)
    return acc
  }, {})

  return (
    <div>
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-[var(--text-3)] mb-4 hover:text-[var(--text-2)]" aria-label="돌아가기">
        <ArrowLeft className="w-4 h-4" /> 돌아가기
      </button>

      {/* 학생 정보 카드 */}
      <div className="bg-[var(--bg-card)] rounded-xl border p-5 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold">{student.name}</h1>
            <p className="text-sm text-[var(--text-4)] mt-1">
              {student.class?.grade?.name} · {student.class?.name ?? '반 미지정'}
            </p>
          </div>
          <div className="flex gap-1">
            <button onClick={async () => { await ensureGrades(); setShowEditModal(true) }} className="p-2 text-[var(--text-4)] hover:text-[var(--text-3)]" aria-label="학생 정보 수정">
              <Pencil className="w-4 h-4" />
            </button>
            <button onClick={handleDeleteStudent} className="p-2 text-[var(--text-4)] hover:text-[var(--unpaid-text)]" aria-label="학생 삭제">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-[var(--text-4)]">첫 등원일</span>
            <p className="font-medium">{student.enrollment_date}</p>
          </div>
          <div>
            <span className="text-[var(--text-4)]">원비</span>
            <p className="font-medium">{fee.toLocaleString()}원{student.custom_fee != null && ' (개별)'}</p>
          </div>
          {student.phone && (
            <div>
              <span className="text-[var(--text-4)]">연락처</span>
              <p className="font-medium">{student.phone}</p>
            </div>
          )}
          {student.parent_phone && (
            <div>
              <span className="text-[var(--text-4)]">학부모</span>
              <p className="font-medium">{student.parent_phone}</p>
            </div>
          )}
        </div>

        {student.withdrawal_date ? (
          <div className="mt-4 p-3 bg-[var(--unpaid-bg)] rounded-lg">
            <p className="text-sm text-[var(--unpaid-text)] font-medium">퇴원: {student.withdrawal_date}</p>
            <button onClick={handleReenroll} className="text-xs text-[var(--unpaid-text)] underline mt-1 opacity-80">재등록</button>
          </div>
        ) : (
          <button
            onClick={handleWithdraw}
            className="mt-4 flex items-center gap-1 text-sm text-[var(--unpaid-text)] hover:opacity-80 transition-opacity"
          >
            <LogOut className="w-4 h-4" /> 퇴원 처리
          </button>
        )}
      </div>

      {/* 이번달 납부 현황 */}
      <div className="bg-[var(--bg-card)] rounded-xl border p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">이번달 납부현황</h2>
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: statusColors.bg, color: statusColors.text }}
            role="status"
          >
            {PAYMENT_STATUS_LABELS[status]}
          </span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold">{currentMonthTotal.toLocaleString()}원</p>
            <p className="text-sm text-[var(--text-4)]">/ {fee.toLocaleString()}원</p>
          </div>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="px-3 py-2 bg-[var(--blue)] text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:opacity-90 transition-opacity"
          >
            <CreditCard className="w-4 h-4" /> 납부 기록
          </button>
        </div>
      </div>

      {/* 환불 계산기 */}
      <div className="bg-[var(--bg-card)] rounded-xl border p-5 mb-4">
        <button
          onClick={() => setShowRefundCalc(!showRefundCalc)}
          className="flex items-center gap-2 font-bold text-sm w-full text-left"
          aria-expanded={showRefundCalc}
        >
          <Calculator className="w-4 h-4" /> 환불 계산기
        </button>
        {showRefundCalc && refund && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs text-[var(--text-4)] mb-1" htmlFor="refund-date">퇴원 예정일</label>
              <input
                id="refund-date"
                type="date"
                value={refundDate}
                onChange={e => setRefundDate(e.target.value)}
                className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
            </div>
            {refund.isSessionBased && classDays && (
              <div className="px-3 py-2 bg-[var(--blue-bg)] rounded-lg text-xs text-[var(--blue)]">
                수업 요일: {parseClassDays(classDays)?.map(d => DAY_LABELS[d]).join(', ')} (수업 횟수 기반 계산)
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-[var(--bg-card-hover)] rounded-lg">
                <p className="text-[var(--text-4)] text-xs">{refund.isSessionBased ? '총 수업 횟수' : '등록기간'}</p>
                <p className="font-medium">{refund.totalSessions}{refund.isSessionBased ? '회' : '일'}</p>
              </div>
              <div className="p-3 bg-[var(--bg-card-hover)] rounded-lg">
                <p className="text-[var(--text-4)] text-xs">{refund.isSessionBased ? '경과 수업' : '경과일수'}</p>
                <p className="font-medium">{refund.elapsedSessions}{refund.isSessionBased ? '회' : '일'}</p>
              </div>
              <div className="p-3 bg-[var(--bg-card-hover)] rounded-lg">
                <p className="text-[var(--text-4)] text-xs">{refund.isSessionBased ? '잔여 수업' : '잔여일수'}</p>
                <p className="font-medium">{refund.remainingSessions}{refund.isSessionBased ? '회' : '일'}</p>
              </div>
              <div className="p-3 bg-[var(--blue-bg)] rounded-lg">
                <p className="text-[var(--blue)] text-xs">환불 예상액</p>
                <p className="font-bold text-[var(--blue)]">{refund.refundAmount.toLocaleString()}원</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-4)]">
              원비 {fee.toLocaleString()}원 × 잔여 {refund.remainingSessions}{refund.isSessionBased ? '회' : '일'} / {refund.totalSessions}{refund.isSessionBased ? '회' : '일'}
            </p>
          </div>
        )}
      </div>

      {/* 납부 내역 */}
      <div className="bg-[var(--bg-card)] rounded-xl border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">납부 내역</h2>
          <button
            onClick={() => setShowPaymentModal(true)}
            className="text-sm text-[var(--blue)] font-medium flex items-center gap-1 hover:opacity-70"
          >
            <Plus className="w-4 h-4" /> 추가
          </button>
        </div>

        {payments.length === 0 ? (
          <p className="text-sm text-[var(--text-4)] py-4 text-center">납부 기록이 없습니다</p>
        ) : (
          <div className="space-y-4">
            {Object.entries(paymentsByMonth)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([month, monthPayments]) => {
                const monthTotal = monthPayments.reduce((s, p) => s + p.amount, 0)
                const monthStatus = getPaymentStatus(monthTotal, fee)
                const monthStatusColors = PAYMENT_STATUS_COLORS[monthStatus]
                return (
                  <div key={month}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[var(--text-2)]">{month}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: monthStatusColors.bg, color: monthStatusColors.text }}
                        role="status"
                      >
                        {monthTotal.toLocaleString()}원 · {PAYMENT_STATUS_LABELS[monthStatus]}
                      </span>
                    </div>
                    {monthPayments.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-card-hover)] group">
                        <div className="flex-1 text-sm">
                          <span className="font-medium">{p.amount.toLocaleString()}원</span>
                          <span className="text-[var(--text-4)] ml-2">{PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS]}</span>
                          {p.cash_receipt && (
                            <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded ${p.cash_receipt === 'issued' ? 'bg-[var(--paid-bg)] text-[var(--paid-text)]' : 'bg-[var(--scheduled-bg)] text-[var(--scheduled-text)]'}`}>
                              {CASH_RECEIPT_LABELS[p.cash_receipt]}
                            </span>
                          )}
                          <span className="text-[var(--text-4)] ml-2">{p.payment_date}</span>
                          {p.memo && <span className="text-[var(--text-4)] ml-2">· {p.memo}</span>}
                        </div>
                        <button
                          onClick={() => handleDeletePayment(p.id)}
                          className="p-1 text-[var(--text-4)] hover:text-[var(--unpaid-text)] opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="납부 기록 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {showEditModal && (
        <StudentModal
          student={student}
          grades={grades}
          onSave={handleUpdateStudent}
          onClose={() => setShowEditModal(false)}
        />
      )}

      {showPaymentModal && (
        <PaymentModal
          studentId={id}
          defaultAmount={fee}
          onSave={handleSavePayment}
          onClose={() => setShowPaymentModal(false)}
        />
      )}
    </div>
  )
}
