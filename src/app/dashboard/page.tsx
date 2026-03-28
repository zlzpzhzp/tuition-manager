'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Users, CreditCard, AlertCircle, TrendingUp } from 'lucide-react'
import type { Payment, GradeWithClasses, Teacher } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/types'
import { getPaymentDueDay, isPaymentScheduled, getActiveStudents, getCurrentMonth, formatMonth, useGrades, usePayments, useTeachers } from '@/lib/utils'

export default function DashboardPage() {
  const currentMonth = getCurrentMonth()
  const { data: grades = [], error: gradesError, isLoading: gradesLoading } = useGrades<GradeWithClasses[]>()
  const { data: payments = [], error: paymentsError, isLoading: paymentsLoading } = usePayments<Payment[]>(currentMonth)
  const { data: teachers = [] } = useTeachers<Teacher[]>()

  const loading = gradesLoading || paymentsLoading
  const error = gradesError || paymentsError

  const allStudents = useMemo(() =>
    grades.flatMap(g =>
      g.classes.flatMap(c =>
        getActiveStudents(c.students ?? [], currentMonth)
          .filter(s => !s.withdrawal_date)
          .map(s => ({ ...s, class: c }))
      )
    ), [grades, currentMonth])

  const paidByStudentId = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments) {
      map.set(p.student_id, (map.get(p.student_id) ?? 0) + p.amount)
    }
    return map
  }, [payments])

  const getStudentPaid = useCallback((studentId: string) =>
    paidByStudentId.get(studentId) ?? 0
  , [paidByStudentId])

  const stats = useMemo(() => {
    const totalStudents = allStudents.length
    const totalFee = allStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
    const unpaidStudents = allStudents.filter(s => {
      const fee = getStudentFee(s, s.class)
      const paid = paidByStudentId.get(s.id) ?? 0
      return getPaymentStatus(paid, fee) !== 'paid'
    })
    const overdueStudents = unpaidStudents.filter(s => !isPaymentScheduled(s, currentMonth))
    const scheduledStudents = unpaidStudents.filter(s => isPaymentScheduled(s, currentMonth))
    const paidCount = totalStudents - unpaidStudents.length
    const paymentRate = totalStudents > 0 ? Math.round((paidCount / totalStudents) * 100) : 0
    return { totalStudents, totalFee, totalPaid, unpaidStudents, overdueStudents, scheduledStudents, paidCount, paymentRate }
  }, [allStudents, payments, currentMonth, paidByStudentId])

  const urgentStudents = useMemo(() => {
    const today = new Date()
    return stats.unpaidStudents.filter(s => {
      const enrollDay = new Date(s.enrollment_date).getDate()
      const dueDate = new Date(today.getFullYear(), today.getMonth(), enrollDay)
      if (dueDate < today) dueDate.setMonth(dueDate.getMonth() + 1)
      const daysUntilDue = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return daysUntilDue <= 3
    })
  }, [stats.unpaidStudents])

  if (loading) return (
    <div className="animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-40 mb-2"></div>
      <div className="h-4 bg-gray-100 rounded w-56 mb-6"></div>
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

  if (error) return (
    <div className="text-center py-12">
      <p className="text-red-500 mb-4">{error?.message}</p>
      <button onClick={() => window.location.reload()} className="px-4 py-2 bg-[#1e2d6f] text-white rounded-lg hover:opacity-90">다시 시도</button>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">{formatMonth(currentMonth)} 대시보드</h1>
      <p className="text-sm text-gray-400 mb-6">{new Date().toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-[#1e2d6f]" />
            <span className="text-xs text-gray-400">재원생</span>
          </div>
          <p className="text-4xl font-bold tracking-tight">{stats.totalStudents}<span className="text-base text-gray-400 font-normal ml-0.5">명</span></p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <span className="text-xs text-gray-400">납부율</span>
          </div>
          <p className="text-4xl font-bold tracking-tight">{stats.paymentRate}<span className="text-base text-gray-400 font-normal ml-0.5">%</span></p>
          <p className="text-xs text-gray-400 mt-0.5">{stats.paidCount}/{stats.totalStudents}명</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className="w-4 h-4 text-[#1e2d6f]" />
            <span className="text-xs text-gray-400">수납 / 총원비</span>
          </div>
          <p className="text-3xl font-bold tracking-tight">{(stats.totalPaid / 10000).toFixed(0)}<span className="text-sm text-gray-400 font-normal ml-0.5">만</span></p>
          <p className="text-xs text-gray-400 mt-0.5">/ {(stats.totalFee / 10000).toFixed(0)}만원</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs text-gray-400">미납 / 예정</span>
          </div>
          <p className="text-3xl font-bold tracking-tight">
            <span className="text-red-600">{stats.overdueStudents.length}</span>
            <span className="text-gray-300 font-normal mx-1">/</span>
            <span className="text-amber-600">{stats.scheduledStudents.length}</span>
            <span className="text-base text-gray-400 font-normal ml-0.5">명</span>
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
                    {s.enrollment_date?.startsWith(currentMonth) && (
                      <span className="text-[9px] ml-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 font-bold">신규</span>
                    )}
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
          {stats.overdueStudents.length > 0 && <span className="text-red-600 ml-1">미납 {stats.overdueStudents.length}</span>}
          {stats.overdueStudents.length > 0 && stats.scheduledStudents.length > 0 && <span className="text-gray-300 mx-1">·</span>}
          {stats.scheduledStudents.length > 0 && <span className="text-amber-600">예정 {stats.scheduledStudents.length}</span>}
          {stats.unpaidStudents.length === 0 && ' (0명)'}
        </h2>
        {stats.unpaidStudents.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">모든 학생이 납부 완료했습니다 🎉</p>
        ) : (
          <div className="space-y-1">
            {stats.unpaidStudents.map(s => {
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
                    {s.enrollment_date?.startsWith(currentMonth) && (
                      <span className="text-[9px] ml-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 font-bold">신규</span>
                    )}
                    <span className="text-xs text-gray-400 ml-2">{s.class?.name}</span>
                  </div>
                  <span className="text-xs text-gray-400">{(fee - paid).toLocaleString()}원</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: displayColors.bg, color: displayColors.text }}
                    role="status"
                  >
                    {displayLabel}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* 선생님별 매출 */}
      {teachers.length > 0 && grades.length > 0 && (() => {
        const teacherStats = teachers.map(teacher => {
          const teacherClasses = grades.flatMap(g =>
            g.classes.filter(c => c.teacher_id === teacher.id)
          )
          const teacherStudents = teacherClasses.flatMap(c =>
            getActiveStudents(c.students ?? [], currentMonth).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
          )
          const totalFee = teacherStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
          const totalPaid = teacherStudents.reduce((sum, s) => sum + getStudentPaid(s.id), 0)
          const studentCount = teacherStudents.length
          return { teacher, totalFee, totalPaid, studentCount, classCount: teacherClasses.length }
        }).filter(t => t.studentCount > 0)

        if (teacherStats.length === 0) return null

        const grandFee = teacherStats.reduce((sum, t) => sum + t.totalFee, 0)
        const grandPaid = teacherStats.reduce((sum, t) => sum + t.totalPaid, 0)

        return (
          <div className="bg-white rounded-xl border p-5 mb-4">
            <h2 className="font-bold text-sm mb-3">선생님별 매출</h2>
            <div className="space-y-2">
              {teacherStats.map(({ teacher, totalFee, totalPaid, studentCount, classCount }) => (
                <div key={teacher.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div>
                    <span className="text-sm font-medium">{teacher.name}</span>
                    {teacher.subject && <span className="text-xs text-gray-400 ml-1">({teacher.subject})</span>}
                    <span className="text-xs text-gray-400 ml-2">{classCount}반 · {studentCount}명</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{totalFee.toLocaleString()}원</p>
                    <p className="text-xs text-gray-400">수납 {totalPaid.toLocaleString()}원</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t font-bold">
                <span className="text-sm">합계</span>
                <div className="text-right">
                  <span className="text-sm">{grandFee.toLocaleString()}원</span>
                  <p className="text-xs text-gray-400 font-normal">수납 {grandPaid.toLocaleString()}원</p>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* 반별 인원수 다이어그램 */}
      {grades.length > 0 && (() => {
        const classData = grades.flatMap(g =>
          g.classes.map(c => ({
            name: c.name,
            gradeName: g.name,
            count: getActiveStudents(c.students ?? [], currentMonth).filter(s => !s.withdrawal_date).length,
            subject: c.subject,
          }))
        ).filter(c => c.count > 0)
        const maxCount = Math.max(...classData.map(c => c.count), 1)

        return (
          <div className="bg-white rounded-xl border p-5 mb-4">
            <h2 className="font-bold text-sm mb-4">반별 인원</h2>
            <div className="space-y-2.5">
              {classData.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-gray-600 font-medium truncate shrink-0">{c.name}</div>
                  <div className="flex-1 h-6 bg-gray-50 rounded-full overflow-hidden relative">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max((c.count / maxCount) * 100, 8)}%`,
                        background: `linear-gradient(90deg, #1e2d6f, #2d4298)`,
                      }}
                    />
                    <span className="absolute inset-y-0 right-2 flex items-center text-xs font-bold text-gray-500">
                      {c.count}명
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* 학년별 총액 */}
      {grades.length > 0 && (
        <div className="bg-white rounded-xl border p-5 mt-4">
          <h2 className="font-bold text-sm mb-3">학년별 원비 총액</h2>
          <div className="space-y-2">
            {grades.map(grade => {
              const gradeStudents = grade.classes.flatMap(c =>
                getActiveStudents(c.students ?? [], currentMonth).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
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
              <span className="text-sm">{stats.totalFee.toLocaleString()}원</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
