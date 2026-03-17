'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Users, CreditCard, AlertCircle, TrendingUp } from 'lucide-react'
import type { Grade, Class, Student, Payment } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/types'

type GradeWithClasses = Grade & { classes: (Class & { students: Student[] })[] }

/** 학생의 결제 예정일 (등록일 기준 매월 같은 날) */
function getPaymentDueDay(student: Student): number {
  return new Date(student.enrollment_date).getDate()
}

/** 결제일이 아직 안 지났으면 true (예정), 지났으면 false (미납) */
function isPaymentScheduled(student: Student, selectedMonth: string): boolean {
  const paymentDay = getPaymentDueDay(student)
  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  if (selectedMonth < currentMonth) return false
  if (selectedMonth > currentMonth) return true
  return today.getDate() < paymentDay
}

export default function DashboardPage() {
  const [grades, setGrades] = useState<GradeWithClasses[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)

  const currentMonth = new Date().toISOString().slice(0, 7)
  const formatMonth = (m: string) => {
    const [y, mo] = m.split('-')
    return `${y}년 ${parseInt(mo)}월`
  }

  const fetchData = useCallback(async () => {
    const [gradesRes, paymentsRes] = await Promise.all([
      fetch('/api/grades'),
      fetch(`/api/payments?billing_month=${currentMonth}`),
    ])
    const [gradesData, paymentsData] = await Promise.all([
      gradesRes.json(),
      paymentsRes.json(),
    ])
    setGrades(gradesData)
    setPayments(paymentsData)
    setLoading(false)
  }, [currentMonth])

  useEffect(() => { fetchData() }, [fetchData])

  const allStudents = grades.flatMap(g =>
    g.classes.flatMap(c =>
      (c.students ?? []).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
    )
  )

  const getStudentPaid = (studentId: string) =>
    payments.filter(p => p.student_id === studentId).reduce((s, p) => s + p.amount, 0)

  const totalStudents = allStudents.length
  const totalFee = allStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const totalRemaining = totalFee - totalPaid

  const unpaidStudents = allStudents.filter(s => {
    const fee = getStudentFee(s, s.class)
    const paid = getStudentPaid(s.id)
    return getPaymentStatus(paid, fee) !== 'paid'
  })

  const overdueStudents = unpaidStudents.filter(s => !isPaymentScheduled(s, currentMonth))
  const scheduledStudents = unpaidStudents.filter(s => isPaymentScheduled(s, currentMonth))
  const paidCount = totalStudents - unpaidStudents.length
  const paymentRate = totalStudents > 0 ? Math.round((paidCount / totalStudents) * 100) : 0

  // 납부 기한 임박 (등원일 기준 3일 이내)
  const today = new Date()
  const urgentStudents = unpaidStudents.filter(s => {
    const enrollDay = new Date(s.enrollment_date).getDate()
    const dueDate = new Date(today.getFullYear(), today.getMonth(), enrollDay)
    if (dueDate < today) dueDate.setMonth(dueDate.getMonth() + 1)
    const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return daysUntilDue <= 3
  })

  if (loading) return (
    <div className="animate-pulse">
      {/* 제목 */}
      <div className="h-6 bg-gray-200 rounded w-40 mb-2"></div>
      <div className="h-4 bg-gray-100 rounded w-56 mb-6"></div>
      {/* 요약 카드 4개 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-4 h-4 bg-gray-200 rounded"></div>
              <div className="h-3 bg-gray-200 rounded w-12"></div>
            </div>
            <div className="h-7 bg-gray-200 rounded w-20"></div>
          </div>
        ))}
      </div>
      {/* 미납 학생 목록 */}
      <div className="bg-white rounded-xl border p-5">
        <div className="h-4 bg-gray-200 rounded w-28 mb-4"></div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-16 mb-1"></div>
              </div>
              <div className="h-4 bg-gray-100 rounded w-20"></div>
              <div className="h-5 bg-gray-200 rounded-full w-12"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">{formatMonth(currentMonth)} 대시보드</h1>
      <p className="text-sm text-gray-400 mb-6">{new Date().toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-[#1e2d6f]" />
            <span className="text-xs text-gray-400">재원생</span>
          </div>
          <p className="text-2xl font-bold">{totalStudents}<span className="text-sm text-gray-400 font-normal">명</span></p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-xs text-gray-400">납부율</span>
          </div>
          <p className="text-2xl font-bold">{paymentRate}<span className="text-sm text-gray-400 font-normal">%</span></p>
          <p className="text-xs text-gray-400">{paidCount}/{totalStudents}명</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-4 h-4 text-[#1e2d6f]" />
            <span className="text-xs text-gray-400">수납 완료</span>
          </div>
          <p className="text-xl font-bold">{totalPaid.toLocaleString()}<span className="text-xs text-gray-400 font-normal">원</span></p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-gray-400">미납 / 예정</span>
          </div>
          <p className="text-xl font-bold">
            <span className="text-red-600">{overdueStudents.length}</span>
            <span className="text-gray-300 font-normal mx-1">/</span>
            <span className="text-amber-600">{scheduledStudents.length}</span>
            <span className="text-sm text-gray-400 font-normal">명</span>
          </p>
        </div>
      </div>

      {/* 납부 기한 임박 */}
      {urgentStudents.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-bold text-orange-800 mb-2 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> 납부 기한 임박 ({urgentStudents.length}명)
          </h2>
          <div className="space-y-2">
            {urgentStudents.slice(0, 5).map(s => {
              const fee = getStudentFee(s, s.class)
              const paid = getStudentPaid(s.id)
              const enrollDay = new Date(s.enrollment_date).getDate()
              return (
                <Link
                  key={s.id}
                  href={`/students/${s.id}`}
                  className="flex items-center justify-between text-sm hover:bg-orange-100 active:bg-orange-100 rounded-lg px-2 py-2 -mx-2"
                >
                  <div>
                    <span className="font-medium text-orange-900">{s.name}</span>
                    <span className="text-orange-600 ml-2 text-xs">{s.class?.name}</span>
                  </div>
                  <div className="text-xs text-orange-700">
                    매월 {enrollDay}일 · {(fee - paid).toLocaleString()}원 미납
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* 미납 학생 목록 */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-bold text-sm mb-3">
          미납 학생
          {overdueStudents.length > 0 && <span className="text-red-600 ml-1">미납 {overdueStudents.length}</span>}
          {overdueStudents.length > 0 && scheduledStudents.length > 0 && <span className="text-gray-300 mx-1">·</span>}
          {scheduledStudents.length > 0 && <span className="text-amber-600">예정 {scheduledStudents.length}</span>}
          {unpaidStudents.length === 0 && ' (0명)'}
        </h2>
        {unpaidStudents.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">모든 학생이 납부 완료했습니다 🎉</p>
        ) : (
          <div className="space-y-1">
            {unpaidStudents.map(s => {
              const fee = getStudentFee(s, s.class)
              const paid = getStudentPaid(s.id)
              const status = getPaymentStatus(paid, fee)
              const scheduled = status === 'unpaid' && isPaymentScheduled(s, currentMonth)
              const displayColors = scheduled
                ? { bg: '#FEF3C7', text: '#92400E' }
                : PAYMENT_STATUS_COLORS[status]
              const dueDay = getPaymentDueDay(s)
              const month = parseInt(currentMonth.split('-')[1])
              const displayLabel = status === 'unpaid'
                ? `${month}/${dueDay} ${scheduled ? '예정' : '미납'}`
                : PAYMENT_STATUS_LABELS[status]
              return (
                <Link
                  key={s.id}
                  href={`/students/${s.id}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 active:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{s.class?.name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{(fee - paid).toLocaleString()}원</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: displayColors.bg, color: displayColors.text }}
                  >
                    {displayLabel}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* 학년별 총액 */}
      {grades.length > 0 && (
        <div className="bg-white rounded-xl border p-5 mt-4">
          <h2 className="font-bold text-sm mb-3">학년별 원비 총액</h2>
          <div className="space-y-2">
            {grades.map(grade => {
              const gradeStudents = grade.classes.flatMap(c =>
                (c.students ?? []).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
              )
              const gradeFee = gradeStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
              const gradePaid = gradeStudents.reduce((sum, s) => sum + getStudentPaid(s.id), 0)
              if (gradeStudents.length === 0) return null

              return (
                <div key={grade.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div>
                    <span className="text-sm font-medium">{grade.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{gradeStudents.length}명</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{gradeFee.toLocaleString()}원</p>
                    <p className="text-xs text-gray-400">수납 {gradePaid.toLocaleString()}원</p>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center justify-between pt-2 border-t font-bold">
              <span className="text-sm">합계</span>
              <span className="text-sm">{totalFee.toLocaleString()}원</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
