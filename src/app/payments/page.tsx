'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Check, MoreVertical } from 'lucide-react'
import type { Grade, Class, Student, Payment, PaymentMethod } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/types'
import PaymentModal from '@/components/PaymentModal'

type GradeWithClasses = Grade & { classes: (Class & { students: Student[] })[] }

const INLINE_METHODS: [PaymentMethod, string][] = [
  ['remote', '결제선생'],
  ['card', '카드'],
  ['transfer', '이체'],
  ['cash', '현금'],
]

function getPrevMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function PaymentsPage() {
  const today = new Date().toISOString().split('T')[0]

  const [grades, setGrades] = useState<GradeWithClasses[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [prevPayments, setPrevPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // 인라인 납부 폼
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  const [inlineDate, setInlineDate] = useState(today)
  const [inlineMethod, setInlineMethod] = useState<PaymentMethod>('remote')
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null)
  const [showMethodPicker, setShowMethodPicker] = useState(false)

  // 모달 (고급 옵션 / 납부 상세보기)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedStudentFee, setSelectedStudentFee] = useState(0)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [selectedPrevMemo, setSelectedPrevMemo] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const prevMonth = getPrevMonth(selectedMonth)
    const [gradesRes, paymentsRes, prevPaymentsRes] = await Promise.all([
      fetch('/api/grades'),
      fetch(`/api/payments?billing_month=${selectedMonth}`),
      fetch(`/api/payments?billing_month=${prevMonth}`),
    ])
    const [gradesData, paymentsData, prevPaymentsData] = await Promise.all([
      gradesRes.json(),
      paymentsRes.json(),
      prevPaymentsRes.json(),
    ])
    setGrades(gradesData)
    setPayments(paymentsData)
    setPrevPayments(prevPaymentsData)
    setLoading(false)
  }, [selectedMonth])

  useEffect(() => { fetchData() }, [fetchData])

  const navigateMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const formatMonth = (month: string) => {
    const [y, m] = month.split('-')
    return `${y}년 ${parseInt(m)}월`
  }

  const getStudentPayments = (studentId: string) =>
    payments.filter(p => p.student_id === studentId)

  const getPrevMemo = (studentId: string): string | null => {
    const prev = prevPayments.find(p => p.student_id === studentId)
    return prev?.memo || null
  }

  // 미납 학생 인라인 확장
  const handleExpand = (studentId: string) => {
    if (expandedStudentId === studentId) {
      setExpandedStudentId(null)
      return
    }
    setExpandedStudentId(studentId)
    setInlineDate(today)
    setInlineMethod('remote')
    setShowMethodPicker(false)
  }

  // 인라인 납부 제출
  const handleInlineSubmit = async (studentId: string, fee: number) => {
    if (inlineSuccess) return
    await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,
        amount: fee,
        method: inlineMethod,
        payment_date: inlineDate,
        billing_month: selectedMonth,
      }),
    })
    setInlineSuccess(studentId)
    setTimeout(() => {
      setInlineSuccess(null)
      setExpandedStudentId(null)
      fetchData()
    }, 1000)
  }

  // 모달 열기 (납부 상세보기 또는 고급 옵션)
  const handleOpenModal = (studentId: string, fee: number) => {
    const existing = payments.find(p => p.student_id === studentId)
    setSelectedStudentId(studentId)
    setSelectedStudentFee(fee)
    setSelectedPayment(existing || null)
    setSelectedPrevMemo(getPrevMemo(studentId))
    setShowPaymentModal(true)
  }

  const handleSavePayment = async (data: Partial<Payment>) => {
    await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    fetchData()
  }

  const handleDeletePayment = async (paymentId: string) => {
    await fetch(`/api/payments/${paymentId}`, { method: 'DELETE' })
    setShowPaymentModal(false)
    setSelectedPayment(null)
    fetchData()
  }

  // Summary stats
  const allStudents = grades.flatMap(g => g.classes.flatMap(c =>
    (c.students ?? []).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
  ))
  const totalFee = allStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const unpaidCount = allStudents.filter(s => {
    const paid = getStudentPayments(s.id).reduce((sum, p) => sum + p.amount, 0)
    return getPaymentStatus(paid, getStudentFee(s, s.class)) === 'unpaid'
  }).length

  if (loading) return <div className="text-center py-12 text-gray-400">로딩 중...</div>

  return (
    <div>
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">{formatMonth(selectedMonth)}</h1>
        <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-6">
        <div className="bg-white rounded-xl border p-3 sm:p-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-400">총 원비</p>
          <p className="text-base sm:text-lg font-bold mt-1">{totalFee.toLocaleString()}<span className="text-[10px] sm:text-xs text-gray-400">원</span></p>
        </div>
        <div className="bg-white rounded-xl border p-3 sm:p-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-400">납부 완료</p>
          <p className="text-base sm:text-lg font-bold mt-1 text-green-700">{totalPaid.toLocaleString()}<span className="text-[10px] sm:text-xs text-gray-400">원</span></p>
        </div>
        <div className="bg-white rounded-xl border p-3 sm:p-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-400">미납</p>
          <p className="text-base sm:text-lg font-bold mt-1 text-red-700">{unpaidCount}<span className="text-[10px] sm:text-xs text-gray-400">명</span></p>
        </div>
      </div>

      {/* 학생별 납부 현황 */}
      {grades.map(grade => {
        const gradeStudents = grade.classes.flatMap(c =>
          (c.students ?? []).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
        )
        if (gradeStudents.length === 0) return null

        return (
          <div key={grade.id} className="mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">{grade.name}</h2>
            <div className="bg-white rounded-xl border overflow-hidden">
              {grade.classes.map(cls => {
                const students = (cls.students ?? []).filter(s => !s.withdrawal_date)
                if (students.length === 0) return null

                return (
                  <div key={cls.id}>
                    <div className="px-4 py-2 bg-gray-50 border-b">
                      <span className="text-xs font-medium text-gray-500">{cls.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{cls.monthly_fee.toLocaleString()}원</span>
                    </div>
                    {students.map(student => {
                      const fee = getStudentFee(student, cls)
                      const studentPayments = getStudentPayments(student.id)
                      const paid = studentPayments.reduce((s, p) => s + p.amount, 0)
                      const status = getPaymentStatus(paid, fee)
                      const statusColors = PAYMENT_STATUS_COLORS[status]
                      const prevMemo = getPrevMemo(student.id)
                      const currentMemo = studentPayments[0]?.memo
                      const isExpanded = expandedStudentId === student.id && status === 'unpaid'
                      const isSuccess = inlineSuccess === student.id

                      return (
                        <div key={student.id}>
                          <div className={`flex items-center gap-2 px-4 py-3 border-b last:border-b-0 ${
                            status === 'unpaid' && !isExpanded ? 'cursor-pointer active:bg-gray-50' : ''
                          }`}
                            onClick={status === 'unpaid' && !isExpanded ? () => handleExpand(student.id) : undefined}
                          >
                            <Link
                              href={`/students/${student.id}`}
                              className="flex-1 min-w-0"
                              onClick={e => e.stopPropagation()}
                            >
                              <span className="text-sm font-medium">{student.name}</span>
                            </Link>

                            {isExpanded ? (
                              /* 인라인 납부: 미납 뱃지 자리에서 왼쪽으로 펼쳐짐 */
                              <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                                <input
                                  type="date"
                                  value={inlineDate}
                                  onChange={e => setInlineDate(e.target.value)}
                                  className="fan-item px-2 py-0.5 rounded-full text-xs bg-[#FEF3C7] text-[#92400E] border-0 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                  style={{ width: '120px' }}
                                />
                                <div className="relative fan-item">
                                  <button
                                    type="button"
                                    onClick={() => setShowMethodPicker(!showMethodPicker)}
                                    className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#E0E7FF] text-[#3730A3] flex items-center gap-0.5 whitespace-nowrap"
                                  >
                                    {INLINE_METHODS.find(([v]) => v === inlineMethod)?.[1]}
                                    <span className="text-[9px] opacity-50">▼</span>
                                  </button>
                                  {showMethodPicker && (
                                    <div className="absolute top-full right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 overflow-hidden min-w-[90px]">
                                      {INLINE_METHODS.map(([val, label]) => (
                                        <button
                                          key={val}
                                          type="button"
                                          onClick={() => { setInlineMethod(val); setShowMethodPicker(false) }}
                                          className={`block w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 whitespace-nowrap ${
                                            inlineMethod === val ? 'text-[#3730A3] bg-indigo-50' : 'text-gray-600'
                                          }`}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleInlineSubmit(student.id, fee)}
                                  disabled={!!inlineSuccess}
                                  className={`fan-item px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${
                                    isSuccess
                                      ? 'bg-green-500 text-white scale-105'
                                      : 'bg-[#DEF7EC] text-[#03543F] hover:opacity-80'
                                  }`}
                                >
                                  {isSuccess ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : '납부'}
                                </button>
                                <button
                                  onClick={() => handleOpenModal(student.id, fee)}
                                  className="fan-item p-1 text-gray-400 hover:text-gray-600"
                                >
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              /* 기본 상태: 뱃지 + 상세 버튼 */
                              <>
                                {studentPayments.length > 0 && (
                                  <div className="text-xs text-gray-400 hidden sm:block">
                                    {studentPayments.map(p => PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS]).join(', ')}
                                  </div>
                                )}
                                <span
                                  className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                                  style={{ backgroundColor: statusColors.bg, color: statusColors.text }}
                                >
                                  {paid > 0 ? `${paid.toLocaleString()}원` : PAYMENT_STATUS_LABELS[status]}
                                </span>
                                {status !== 'unpaid' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleOpenModal(student.id, fee) }}
                                    className="p-1.5 transition-colors text-green-500 hover:text-green-700"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>

                          {/* 비고 서브행 */}
                          {!isExpanded && (prevMemo || currentMemo) && (
                            <div className="flex flex-col gap-0.5 px-4 py-1.5 border-b last:border-b-0 bg-gray-50/50">
                              {prevMemo && (
                                <p className="text-[11px] text-amber-600">지난달: {prevMemo}</p>
                              )}
                              {currentMemo && (
                                <p className="text-[11px] text-blue-500">{currentMemo}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {allStudents.length === 0 && (
        <div className="text-center py-12 text-gray-400">등록된 학생이 없습니다</div>
      )}

      {showPaymentModal && selectedStudentId && (
        <PaymentModal
          payment={selectedPayment}
          studentId={selectedStudentId}
          defaultBillingMonth={selectedMonth}
          defaultAmount={selectedStudentFee}
          prevMemo={selectedPrevMemo}
          onSave={handleSavePayment}
          onDelete={handleDeletePayment}
          onClose={() => { setShowPaymentModal(false); setSelectedPayment(null); setExpandedStudentId(null) }}
        />
      )}
    </div>
  )
}
