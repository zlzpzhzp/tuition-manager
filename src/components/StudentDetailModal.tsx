'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Pencil, Trash2, Plus, CreditCard, Calculator, LogOut, Check } from 'lucide-react'
import type { Student, Payment, Grade, Class } from '@/types'
import { getStudentFee, calcRefund, parseClassDays, DAY_LABELS, PAYMENT_METHOD_LABELS, CASH_RECEIPT_LABELS, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/types'
import StudentModal from '@/components/StudentModal'
import PaymentModal from '@/components/PaymentModal'
import { safeFetch, safeMutate, getTodayString } from '@/lib/utils'

interface Props {
  studentId: string
  onClose: () => void
  onChange?: () => void
}

export default function StudentDetailModal({ studentId, onClose, onChange }: Props) {
  const [student, setStudent] = useState<Student | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [grades, setGrades] = useState<(Grade & { classes: Class[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showRefundCalc, setShowRefundCalc] = useState(false)
  const [refundDate, setRefundDate] = useState(getTodayString())
  const [memoValue, setMemoValue] = useState('')
  const [memoColor, setMemoColor] = useState<'yellow' | 'green' | 'red' | null>(null)
  const [memoSaving, setMemoSaving] = useState(false)
  const [memoSavedFlash, setMemoSavedFlash] = useState(false)

  const fetchData = useCallback(async () => {
    const [studentResult, paymentsResult] = await Promise.all([
      safeFetch<Student>(`/api/students/${studentId}`),
      safeFetch<Payment[]>(`/api/payments?student_id=${studentId}`),
    ])
    if (studentResult.error) {
      setLoading(false)
      return
    }
    setStudent(studentResult.data)
    setPayments(paymentsResult.data ?? [])
    setMemoValue(studentResult.data?.memo ?? '')
    setMemoColor(studentResult.data?.memo_color ?? null)
    setLoading(false)
  }, [studentId])

  const handleSaveMemo = async () => {
    setMemoSaving(true)
    const memo = memoValue.trim() || null
    const { error } = await safeMutate(`/api/students/${studentId}`, 'PUT', { memo, memo_color: memoColor })
    setMemoSaving(false)
    if (error) { alert(`저장 실패: ${error}`); return }
    setMemoSavedFlash(true)
    setTimeout(() => setMemoSavedFlash(false), 1200)
    await fetchData()
    notifyChange()
  }

  const ensureGrades = useCallback(async () => {
    if (grades.length > 0) return
    const { data } = await safeFetch<(Grade & { classes: Class[] })[]>('/api/grades')
    setGrades(data ?? [])
  }, [grades.length])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const notifyChange = () => { onChange?.() }

  const handleUpdateStudent = async (data: Partial<Student>) => {
    const { error } = await safeMutate(`/api/students/${studentId}`, 'PUT', data)
    if (error) { alert(`수정 실패: ${error}`); return }
    setShowEditModal(false)
    await fetchData()
    notifyChange()
  }

  const handleDeleteStudent = async () => {
    if (!confirm(`"${student?.name}" 학생을 삭제하시겠습니까?`)) return
    const { error } = await safeMutate(`/api/students/${studentId}`, 'DELETE')
    if (error) { alert(`삭제 실패: ${error}`); return }
    notifyChange()
    onClose()
  }

  const handleWithdraw = async () => {
    if (!student) return
    const date = prompt('퇴원일을 입력하세요 (YYYY-MM-DD)', getTodayString())
    if (!date) return
    const { error } = await safeMutate(`/api/students/${studentId}`, 'PUT', { withdrawal_date: date })
    if (error) { alert(`퇴원 처리 실패: ${error}`); return }
    await fetchData()
    notifyChange()
  }

  const handleReenroll = async () => {
    const { error } = await safeMutate(`/api/students/${studentId}`, 'PUT', { withdrawal_date: null })
    if (error) { alert(`재등록 실패: ${error}`); return }
    await fetchData()
    notifyChange()
  }

  const handleSavePayment = async (data: Partial<Payment>) => {
    const { error } = await safeMutate('/api/payments', 'POST', data)
    if (error) { alert(`납부 기록 실패: ${error}`); return }
    setShowPaymentModal(false)
    await fetchData()
    notifyChange()
  }

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('이 납부 기록을 삭제하시겠습니까?')) return
    const { error } = await safeMutate(`/api/payments/${paymentId}`, 'DELETE')
    if (error) { alert(`삭제 실패: ${error}`); return }
    await fetchData()
    notifyChange()
  }

  if (typeof document === 'undefined') return null

  const fee = student ? getStudentFee(student, student.class as Class | undefined) : 0
  const currentMonth = new Date().toISOString().slice(0, 7)
  const currentMonthPayments = payments.filter(p => p.billing_month === currentMonth)
  const currentMonthTotal = currentMonthPayments.reduce((s, p) => s + p.amount, 0)
  const status = student ? getPaymentStatus(currentMonthTotal, fee) : 'unpaid'
  const statusColors = PAYMENT_STATUS_COLORS[status]

  const classDays = student?.class?.class_days ?? null
  const refund = student && showRefundCalc
    ? calcRefund(fee, new Date(student.enrollment_date), new Date(refundDate), classDays)
    : null

  const paymentsByMonth = payments.reduce<Record<string, Payment[]>>((acc, p) => {
    if (!acc[p.billing_month]) acc[p.billing_month] = []
    acc[p.billing_month].push(p)
    return acc
  }, {})

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) onClose()
        }}
        className="bg-[var(--bg)] w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 rounded-full bg-[var(--text-4)]" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] sticky top-0 bg-[var(--bg)] z-10">
          <h2 className="font-bold text-base">{student?.name ?? '학생'}</h2>
          <button onClick={onClose} className="p-1 text-[var(--text-4)] hover:text-[var(--text-1)]" aria-label="닫기">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-[var(--text-4)]">로딩 중...</div>
        ) : !student ? (
          <div className="text-center py-12 text-[var(--text-4)]">학생을 찾을 수 없습니다</div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm text-[var(--text-4)]">
                    {student.class?.grade?.name} · {student.class?.name ?? '반 미지정'}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={async () => { await ensureGrades(); setShowEditModal(true) }} className="p-2 text-[var(--text-4)] hover:text-[var(--text-1)]" aria-label="학생 정보 수정">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={handleDeleteStudent} className="p-2 text-[var(--text-4)] hover:text-[var(--red)]" aria-label="학생 삭제">
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

              {/* 비고 인라인 편집 */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-4)]">비고</span>
                  <div className="flex items-center gap-2">
                    {(['yellow', 'green', 'red'] as const).map(c => {
                      const dot = c === 'yellow' ? 'bg-yellow-400' : c === 'green' ? 'bg-green-400' : 'bg-red-400'
                      const active = memoColor === c
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setMemoColor(active ? null : c)}
                          className={`w-4 h-4 rounded-full ${dot} ${active ? 'ring-2 ring-white/80' : 'opacity-50'}`}
                          aria-label={`색상 ${c}`}
                        />
                      )
                    })}
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={memoValue}
                    onChange={e => setMemoValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveMemo() }}
                    placeholder="학생에 대한 메모"
                    className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
                  />
                  <button
                    onClick={handleSaveMemo}
                    disabled={memoSaving}
                    className={`p-2 rounded-lg text-white shrink-0 transition-all ${memoSavedFlash ? 'bg-[var(--green)] scale-110' : 'bg-[var(--blue)] hover:opacity-80'}`}
                    aria-label="비고 저장"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {student.withdrawal_date ? (
                <div className="mt-4 p-3 bg-[var(--red-dim)] rounded-lg">
                  <p className="text-sm text-[var(--red)] font-medium">퇴원: {student.withdrawal_date}</p>
                  <button onClick={handleReenroll} className="text-xs text-[var(--red)] underline mt-1">재등록</button>
                </div>
              ) : (
                <button
                  onClick={handleWithdraw}
                  className="mt-4 flex items-center gap-1 text-sm text-[var(--red)] hover:opacity-80"
                >
                  <LogOut className="w-4 h-4" /> 퇴원 처리
                </button>
              )}
            </div>

            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm">이번달 납부현황</h3>
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
                  className="px-3 py-2 bg-[var(--blue)] text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:opacity-90"
                >
                  <CreditCard className="w-4 h-4" /> 납부 기록
                </button>
              </div>
            </div>

            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
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
                      className="px-3 py-2 border border-[var(--border)] bg-[var(--bg)] text-[var(--text-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                    />
                  </div>
                  {refund.isSessionBased && classDays && (
                    <div className="px-3 py-2 bg-[var(--blue-dim)] rounded-lg text-xs text-[var(--blue)]">
                      수업 요일: {parseClassDays(classDays)?.map(d => DAY_LABELS[d]).join(', ')} (수업 횟수 기반 계산)
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-[var(--bg-elevated)] rounded-lg">
                      <p className="text-[var(--text-4)] text-xs">{refund.isSessionBased ? '총 수업 횟수' : '등록기간'}</p>
                      <p className="font-medium">{refund.totalSessions}{refund.isSessionBased ? '회' : '일'}</p>
                    </div>
                    <div className="p-3 bg-[var(--bg-elevated)] rounded-lg">
                      <p className="text-[var(--text-4)] text-xs">{refund.isSessionBased ? '경과 수업' : '경과일수'}</p>
                      <p className="font-medium">{refund.elapsedSessions}{refund.isSessionBased ? '회' : '일'}</p>
                    </div>
                    <div className="p-3 bg-[var(--bg-elevated)] rounded-lg">
                      <p className="text-[var(--text-4)] text-xs">{refund.isSessionBased ? '잔여 수업' : '잔여일수'}</p>
                      <p className="font-medium">{refund.remainingSessions}{refund.isSessionBased ? '회' : '일'}</p>
                    </div>
                    <div className="p-3 bg-[var(--blue-dim)] rounded-lg">
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

            <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm">납부 내역</h3>
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
                            <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-elevated)] group">
                              <div className="flex-1 text-sm">
                                <span className="font-medium">{p.amount.toLocaleString()}원</span>
                                <span className="text-[var(--text-4)] ml-2">{PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS]}</span>
                                {p.cash_receipt && (
                                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded ${p.cash_receipt === 'issued' ? 'bg-[var(--green-dim)] text-[var(--paid-text)]' : 'bg-[var(--orange-dim)] text-[var(--orange)]'}`}>
                                    {CASH_RECEIPT_LABELS[p.cash_receipt]}
                                  </span>
                                )}
                                <span className="text-[var(--text-4)] ml-2">{p.payment_date}</span>
                                {p.memo && <span className="text-[var(--text-4)] ml-2">· {p.memo}</span>}
                              </div>
                              <button
                                onClick={() => handleDeletePayment(p.id)}
                                className="p-1 text-[var(--text-4)] hover:text-[var(--red)] opacity-0 group-hover:opacity-100 transition-opacity"
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
          </div>
        )}

        {showEditModal && student && (
          <StudentModal
            student={student}
            grades={grades}
            onSave={handleUpdateStudent}
            onClose={() => setShowEditModal(false)}
          />
        )}

        {showPaymentModal && student && (
          <PaymentModal
            studentId={studentId}
            defaultAmount={fee}
            onSave={handleSavePayment}
            onClose={() => setShowPaymentModal(false)}
          />
        )}
      </motion.div>
    </motion.div>,
    document.body
  )
}
