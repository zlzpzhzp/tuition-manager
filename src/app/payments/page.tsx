'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CreditCard } from 'lucide-react'
import type { Grade, Class, Student, Payment } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/types'
import PaymentModal from '@/components/PaymentModal'

type GradeWithClasses = Grade & { classes: (Class & { students: Student[] })[] }

export default function PaymentsPage() {
  const [grades, setGrades] = useState<GradeWithClasses[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedStudentFee, setSelectedStudentFee] = useState(0)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)

  const fetchData = useCallback(async () => {
    const [gradesRes, paymentsRes] = await Promise.all([
      fetch('/api/grades'),
      fetch(`/api/payments?billing_month=${selectedMonth}`),
    ])
    const [gradesData, paymentsData] = await Promise.all([
      gradesRes.json(),
      paymentsRes.json(),
    ])
    setGrades(gradesData)
    setPayments(paymentsData)
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

  const handleAddPayment = (studentId: string, fee: number) => {
    const existing = payments.find(p => p.student_id === studentId)
    setSelectedStudentId(studentId)
    setSelectedStudentFee(fee)
    setSelectedPayment(existing || null)
    setShowPaymentModal(true)
  }

  const handleSavePayment = async (data: Partial<Payment>) => {
    await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    setShowPaymentModal(false)
    setSelectedPayment(null)
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

                      return (
                        <div key={student.id} className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
                          <Link href={`/students/${student.id}`} className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{student.name}</span>
                          </Link>

                          {studentPayments.length > 0 && (
                            <div className="text-xs text-gray-400">
                              {studentPayments.map(p => PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS]).join(', ')}
                            </div>
                          )}

                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                            style={{ backgroundColor: statusColors.bg, color: statusColors.text }}
                          >
                            {paid > 0 ? `${paid.toLocaleString()}원` : PAYMENT_STATUS_LABELS[status]}
                          </span>

                          <button
                            onClick={() => handleAddPayment(student.id, fee)}
                            className={`p-1.5 transition-colors ${
                              status === 'paid'
                                ? 'text-green-500 hover:text-green-700'
                                : 'text-gray-300 hover:text-[#1e2d6f]'
                            }`}
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
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
          onSave={handleSavePayment}
          onDelete={handleDeletePayment}
          onClose={() => { setShowPaymentModal(false); setSelectedPayment(null) }}
        />
      )}
    </div>
  )
}
