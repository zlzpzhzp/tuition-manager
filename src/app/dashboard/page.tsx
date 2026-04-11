'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Users, CreditCard, AlertCircle, TrendingUp } from 'lucide-react'
import type { Payment, GradeWithClasses, Teacher } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from '@/types'
import { getPaymentDueDay, isPaymentScheduled, getActiveStudents, getCurrentMonth, formatMonth, useGrades, usePayments, useTeachers } from '@/lib/utils'
import { DashboardSkeleton } from '@/components/Skeleton'
import { motion } from 'framer-motion'
import { FadeInUp, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion'

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
    for (const p of payments) map.set(p.student_id, (map.get(p.student_id) ?? 0) + p.amount)
    return map
  }, [payments])

  const getStudentPaid = useCallback((studentId: string) => paidByStudentId.get(studentId) ?? 0, [paidByStudentId])

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

  if (loading) return <DashboardSkeleton />

  if (error) return (
    <div className="text-center py-20">
      <p className="text-danger mb-4 text-sm">{error?.message}</p>
      <button onClick={() => window.location.reload()} className="btn btn-primary">다시 시도</button>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <p className="text-tertiary text-sm font-medium mb-1">{new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
        <h1 className="text-[26px] font-extrabold text-primary tracking-tight">{formatMonth(currentMonth)}</h1>
      </div>

      {/* 요약 카드 */}
      <StaggerContainer className="grid grid-cols-2 gap-3">
        <StaggerItem className="card p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Users className="w-4 h-4 text-brand" />
            <span className="text-[13px] text-tertiary font-medium">재원생</span>
          </div>
          <p className="text-[32px] font-extrabold text-primary leading-none tracking-tight"><AnimatedNumber value={stats.totalStudents} /><span className="text-[15px] font-medium text-tertiary ml-0.5">명</span></p>
        </StaggerItem>
        <StaggerItem className="card p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingUp className="w-4 h-4 text-success" />
            <span className="text-[13px] text-tertiary font-medium">납부율</span>
          </div>
          <p className="text-[32px] font-extrabold text-primary leading-none tracking-tight"><AnimatedNumber value={stats.paymentRate} /><span className="text-[15px] font-medium text-tertiary ml-0.5">%</span></p>
          <p className="text-[13px] text-tertiary mt-1">{stats.paidCount}/{stats.totalStudents}명 완료</p>
        </StaggerItem>
        <StaggerItem className="card p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <CreditCard className="w-4 h-4 text-brand" />
            <span className="text-[13px] text-tertiary font-medium">수납액</span>
          </div>
          <p className="text-[28px] font-extrabold text-primary leading-none tracking-tight"><AnimatedNumber value={Math.round(stats.totalPaid / 10000)} /><span className="text-[14px] font-medium text-tertiary ml-0.5">만원</span></p>
          <p className="text-[13px] text-tertiary mt-1">/ {(stats.totalFee / 10000).toFixed(0)}만원</p>
        </StaggerItem>
        <StaggerItem className="card p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <AlertCircle className="w-4 h-4 text-danger" />
            <span className="text-[13px] text-tertiary font-medium">미납</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-[28px] font-extrabold text-danger leading-none tracking-tight"><AnimatedNumber value={stats.overdueStudents.length} /></p>
            <p className="text-[13px] text-tertiary">예정 {stats.scheduledStudents.length}</p>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* 납부 기한 임박 */}
      {urgentStudents.length > 0 && (
        <FadeInUp delay={0.15} className="card p-5" style={{ background: '#2a2018' }}>
          <h2 className="text-[15px] font-bold text-warning mb-3 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" /> 납부 기한 임박
          </h2>
          <div className="space-y-1">
            {urgentStudents.slice(0, 5).map(s => {
              const fee = getStudentFee(s, s.class)
              const paid = getStudentPaid(s.id)
              const enrollDay = new Date(s.enrollment_date).getDate()
              return (
                <Link key={s.id} href={`/students/${s.id}`}
                  className="flex items-center justify-between py-2.5 px-1 rounded-xl hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-primary">{s.name}</span>
                    {s.enrollment_date?.startsWith(currentMonth) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--blue-bg)] text-brand font-bold">신규</span>
                    )}
                    <span className="text-[13px] text-tertiary">{s.class?.name}</span>
                  </div>
                  <span className="text-[13px] font-semibold text-warning tabular-nums">{enrollDay}일 · {(fee - paid).toLocaleString()}원</span>
                </Link>
              )
            })}
          </div>
        </FadeInUp>
      )}

      {/* 미납 학생 목록 */}
      <FadeInUp delay={0.2} className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[17px] font-bold text-primary">미납 학생</h2>
          {stats.overdueStudents.length > 0 && <span className="text-[13px] font-bold text-danger">{stats.overdueStudents.length}</span>}
          {stats.scheduledStudents.length > 0 && <span className="text-[13px] font-bold text-warning">예정 {stats.scheduledStudents.length}</span>}
        </div>
        {stats.unpaidStudents.length === 0 ? (
          <p className="text-[15px] text-tertiary py-8 text-center">모든 학생이 납부 완료했습니다</p>
        ) : (
          <div className="space-y-0">
            {stats.unpaidStudents.map(s => {
              const fee = getStudentFee(s, s.class)
              const paid = getStudentPaid(s.id)
              const status = getPaymentStatus(paid, fee)
              const scheduled = status === 'unpaid' && isPaymentScheduled(s, currentMonth)
              const displayColors = scheduled
                ? { bg: '#302a1a', text: '#e5a731' }
                : PAYMENT_STATUS_COLORS[status]
              const dueDay = getPaymentDueDay(s)
              const month = parseInt(currentMonth.split('-')[1])
              const displayLabel = status === 'unpaid'
                ? `${month}/${dueDay} ${scheduled ? '예정' : '미납'}`
                : PAYMENT_STATUS_LABELS[status]
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28, delay: Math.min(stats.unpaidStudents.indexOf(s) * 0.03, 0.3) }}
                >
                  <Link href={`/students/${s.id}`}
                    className="flex items-center gap-3 py-3.5 border-b border-default last:border-b-0 hover:bg-surface-hover -mx-2 px-2 rounded-xl transition-colors">
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] font-semibold text-primary">{s.name}</span>
                      {s.enrollment_date?.startsWith(currentMonth) && (
                        <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-md bg-[var(--blue-bg)] text-brand font-bold">신규</span>
                      )}
                      <span className="text-[13px] text-tertiary ml-2">{s.class?.name}</span>
                    </div>
                    <span className="text-[13px] text-tertiary tabular-nums">{(fee - paid).toLocaleString()}원</span>
                    <span className="px-2.5 py-1 rounded-lg text-[12px] font-bold" style={{ backgroundColor: displayColors.bg, color: displayColors.text }}>
                      {displayLabel}
                    </span>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        )}
      </FadeInUp>

      {/* 선생님별 매출 */}
      {teachers.length > 0 && grades.length > 0 && (() => {
        const teacherStats = teachers.map(teacher => {
          const teacherClasses = grades.flatMap(g => g.classes.filter(c => c.teacher_id === teacher.id))
          const teacherStudents = teacherClasses.flatMap(c =>
            getActiveStudents(c.students ?? [], currentMonth).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
          )
          const totalFee = teacherStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
          const totalPaid = teacherStudents.reduce((sum, s) => sum + getStudentPaid(s.id), 0)
          return { teacher, totalFee, totalPaid, studentCount: teacherStudents.length, classCount: teacherClasses.length }
        }).filter(t => t.studentCount > 0)
        if (teacherStats.length === 0) return null
        const grandFee = teacherStats.reduce((sum, t) => sum + t.totalFee, 0)
        const grandPaid = teacherStats.reduce((sum, t) => sum + t.totalPaid, 0)
        return (
          <FadeInUp delay={0.25} className="card p-5">
            <h2 className="text-[17px] font-bold text-primary mb-4">선생님별 매출</h2>
            {teacherStats.map(({ teacher, totalFee, totalPaid, studentCount, classCount }) => (
              <div key={teacher.id} className="flex items-center justify-between py-3.5 border-b border-default last:border-b-0">
                <div>
                  <span className="text-[15px] font-semibold text-primary">{teacher.name}</span>
                  <span className="text-[13px] text-tertiary ml-2">{classCount}반 · {studentCount}명</span>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-bold text-primary tabular-nums">{totalFee.toLocaleString()}원</p>
                  <p className="text-[12px] text-tertiary">수납 {totalPaid.toLocaleString()}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-4 mt-1">
              <span className="text-[15px] font-bold text-primary">합계</span>
              <div className="text-right">
                <span className="text-[15px] font-bold text-primary tabular-nums">{grandFee.toLocaleString()}원</span>
                <p className="text-[12px] text-tertiary">수납 {grandPaid.toLocaleString()}</p>
              </div>
            </div>
          </FadeInUp>
        )
      })()}

      {/* 반별 인원수 */}
      {grades.length > 0 && (() => {
        const classData = grades.flatMap(g =>
          g.classes.map(c => ({
            name: c.name, count: getActiveStudents(c.students ?? [], currentMonth).filter(s => !s.withdrawal_date).length,
          }))
        ).filter(c => c.count > 0)
        const maxCount = Math.max(...classData.map(c => c.count), 1)
        return (
          <FadeInUp delay={0.3} className="card p-5">
            <h2 className="text-[17px] font-bold text-primary mb-5">반별 인원</h2>
            <div className="space-y-3">
              {classData.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-16 text-[13px] text-secondary font-medium truncate shrink-0">{c.name}</div>
                  <div className="flex-1 h-8 bg-surface-hover rounded-xl overflow-hidden relative">
                    <motion.div
                      className="h-full rounded-xl"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max((c.count / maxCount) * 100, 10)}%` }}
                      transition={{ type: 'spring', stiffness: 80, damping: 20, delay: i * 0.05 }}
                      style={{ background: 'var(--blue)' }}
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-[13px] font-bold text-secondary">{c.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </FadeInUp>
        )
      })()}

      {/* 학년별 총액 */}
      {grades.length > 0 && (
        <FadeInUp delay={0.35} className="card p-5">
          <h2 className="text-[17px] font-bold text-primary mb-4">학년별 원비</h2>
          {grades.map(grade => {
            const gradeStudents = grade.classes.flatMap(c =>
              getActiveStudents(c.students ?? [], currentMonth).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
            )
            const gradeFee = gradeStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
            const gradePaid = gradeStudents.reduce((sum, s) => sum + getStudentPaid(s.id), 0)
            if (gradeStudents.length === 0) return null
            return (
              <div key={grade.id} className="flex items-center justify-between py-3.5 border-b border-default last:border-b-0">
                <div>
                  <span className="text-[15px] font-semibold text-primary">{grade.name}</span>
                  <span className="text-[13px] text-tertiary ml-2">{gradeStudents.length}명</span>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-bold text-primary tabular-nums">{gradeFee.toLocaleString()}원</p>
                  <p className="text-[12px] text-tertiary">수납 {gradePaid.toLocaleString()}</p>
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-4 mt-1">
            <span className="text-[15px] font-bold text-primary">합계</span>
            <span className="text-[15px] font-bold text-primary tabular-nums">{stats.totalFee.toLocaleString()}원</span>
          </div>
        </FadeInUp>
      )}
    </div>
  )
}
