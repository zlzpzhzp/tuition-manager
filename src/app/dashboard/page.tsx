'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Users, CreditCard, AlertCircle, TrendingUp } from 'lucide-react'
import type { Payment, GradeWithClasses, Teacher, Student, Class } from '@/types'
import { getStudentFee, getPaymentStatus } from '@/types'
import { getPaymentDueDay, isPaymentScheduled, getActiveStudents, getCurrentMonth, formatMonth, useGrades, usePayments, useTeachers } from '@/lib/utils'
import { DashboardSkeleton } from '@/components/Skeleton'
import { motion } from 'framer-motion'
import { FadeInUp, StaggerContainer, StaggerItem, AnimatedNumber } from '@/components/motion'

type DashStudent = Student & { class: Class; gradeName: string; gradeIndex: number; classIndex: number }

export default function DashboardPage() {
  const currentMonth = getCurrentMonth()
  const { data: grades = [], error: gradesError, isLoading: gradesLoading } = useGrades<GradeWithClasses[]>()
  const { data: payments = [], error: paymentsError, isLoading: paymentsLoading } = usePayments<Payment[]>(currentMonth)
  const { data: teachers = [] } = useTeachers<Teacher[]>()

  const loading = gradesLoading || paymentsLoading
  const error = gradesError || paymentsError

  const allStudents = useMemo<DashStudent[]>(() => {
    const list: DashStudent[] = []
    grades.forEach((g, gi) => {
      g.classes.forEach((c, ci) => {
        getActiveStudents(c.students ?? [], currentMonth)
          .filter(s => !s.withdrawal_date)
          .forEach(s => list.push({ ...s, class: c, gradeName: g.name, gradeIndex: gi, classIndex: ci }))
      })
    })
    // 영어 과목은 학년 낮아도 뒤로
    const subjectWeight = (c: Class) => (c.subject === '영어' ? 1 : 0)
    list.sort((a, b) => {
      const sw = subjectWeight(a.class) - subjectWeight(b.class)
      if (sw !== 0) return sw
      if (a.gradeIndex !== b.gradeIndex) return a.gradeIndex - b.gradeIndex
      if (a.classIndex !== b.classIndex) return a.classIndex - b.classIndex
      return (a.order_index ?? 0) - (b.order_index ?? 0)
    })
    return list
  }, [grades, currentMonth])

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

  if (loading) return <DashboardSkeleton />

  if (error) return (
    <div className="text-center py-20">
      <p className="text-[var(--red)] mb-4 text-sm">{error?.message}</p>
      <button onClick={() => window.location.reload()} className="btn btn-primary">다시 시도</button>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        {(() => {
          const today = new Date()
          const y = today.getFullYear()
          const m = today.getMonth() + 1
          const d = today.getDate()
          const weekday = ['일','월','화','수','목','금','토'][today.getDay()]
          return (
            <h1 className="text-[1.5rem] font-extrabold tracking-tight text-[var(--text-1)] tabular-nums mb-1">
              {y}년 {m}월 {d}일 {weekday}요일
            </h1>
          )
        })()}
        <p className="text-[13px] font-medium text-[var(--text-4)]">{formatMonth(currentMonth)} 기준</p>
      </div>

      {/* 요약 카드 */}
      <StaggerContainer className="grid grid-cols-2 gap-3">
        <StaggerItem className="card p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Users className="w-4 h-4 text-[var(--blue)]" />
            <span className="text-[13px] text-[var(--text-4)] font-medium">재원생</span>
          </div>
          <p className="text-[32px] font-extrabold text-[var(--text-1)] leading-none tracking-tight"><AnimatedNumber value={stats.totalStudents} /><span className="text-[15px] font-medium text-[var(--text-4)] ml-0.5">명</span></p>
        </StaggerItem>
        <StaggerItem className="card p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <TrendingUp className="w-4 h-4 text-[var(--green)]" />
            <span className="text-[13px] text-[var(--text-4)] font-medium">납부율</span>
          </div>
          <p className="text-[32px] font-extrabold text-[var(--text-1)] leading-none tracking-tight"><AnimatedNumber value={stats.paymentRate} /><span className="text-[15px] font-medium text-[var(--text-4)] ml-0.5">%</span></p>
          <p className="text-[13px] text-[var(--text-4)] mt-1">{stats.paidCount}/{stats.totalStudents}명 완료</p>
        </StaggerItem>
        <StaggerItem className="card p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <CreditCard className="w-4 h-4 text-[var(--blue)]" />
            <span className="text-[13px] text-[var(--text-4)] font-medium">수납액</span>
          </div>
          <p className="text-[28px] font-extrabold text-[var(--text-1)] leading-none tracking-tight"><AnimatedNumber value={Math.round(stats.totalPaid / 10000)} /><span className="text-[14px] font-medium text-[var(--text-4)] ml-0.5">만원</span></p>
          <p className="text-[13px] text-[var(--text-4)] mt-1">/ {(stats.totalFee / 10000).toFixed(0)}만원</p>
        </StaggerItem>
        <StaggerItem className="card p-5">
          <div className="flex items-center gap-1.5 mb-3">
            <AlertCircle className="w-4 h-4 text-[var(--red)]" />
            <span className="text-[13px] text-[var(--text-4)] font-medium">미납</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-[28px] font-extrabold text-[var(--red)] leading-none tracking-tight"><AnimatedNumber value={stats.overdueStudents.length} /></p>
            <p className="text-[13px] text-[var(--text-4)]">예정 {stats.scheduledStudents.length}</p>
          </div>
        </StaggerItem>
      </StaggerContainer>

      {/* 미납 */}
      <FadeInUp delay={0.2} className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[17px] font-bold text-[var(--text-1)]">미납</h2>
          {stats.overdueStudents.length > 0 && <span className="text-[13px] font-bold text-[var(--red)]">{stats.overdueStudents.length}</span>}
        </div>
        {stats.overdueStudents.length === 0 ? (
          <p className="text-[15px] text-[var(--text-4)] py-8 text-center">미납 학생이 없습니다</p>
        ) : (
          <div className="space-y-0">
            {stats.overdueStudents.map((s, idx) => {
              const fee = getStudentFee(s, s.class)
              const paid = getStudentPaid(s.id)
              const dueDay = getPaymentDueDay(s)
              const month = parseInt(currentMonth.split('-')[1])
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28, delay: Math.min(idx * 0.03, 0.3) }}
                >
                  <Link href={`/students/${s.id}`}
                    className="flex items-center gap-3 py-3.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-card-hover)] -mx-2 px-2 rounded-xl transition-colors">
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] font-semibold text-[var(--text-1)]">{s.name}</span>
                      {s.enrollment_date?.startsWith(currentMonth) && (
                        <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-md bg-[var(--blue-bg)] text-[var(--blue)] font-bold">신규</span>
                      )}
                      <span className="text-[13px] text-[var(--text-4)] ml-2">{s.gradeName} · {s.class?.name}</span>
                    </div>
                    <span className="text-[13px] text-[var(--text-4)] tabular-nums">{(fee - paid).toLocaleString()}원</span>
                    <span className="px-2.5 py-1 rounded-lg text-[12px] font-bold" style={{ backgroundColor: '#351c20', color: '#e8656d' }}>
                      {month}/{dueDay} 미납
                    </span>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        )}
      </FadeInUp>

      {/* 예정 */}
      {stats.scheduledStudents.length > 0 && (
        <FadeInUp delay={0.22} className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-[17px] font-bold text-[var(--text-1)]">예정</h2>
            <span className="text-[13px] font-bold text-[var(--orange)]">{stats.scheduledStudents.length}</span>
          </div>
          <div className="space-y-0">
            {stats.scheduledStudents.map((s, idx) => {
              const fee = getStudentFee(s, s.class)
              const paid = getStudentPaid(s.id)
              const dueDay = getPaymentDueDay(s)
              const month = parseInt(currentMonth.split('-')[1])
              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28, delay: Math.min(idx * 0.03, 0.3) }}
                >
                  <Link href={`/students/${s.id}`}
                    className="flex items-center gap-3 py-3.5 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-card-hover)] -mx-2 px-2 rounded-xl transition-colors">
                    <div className="flex-1 min-w-0">
                      <span className="text-[15px] font-semibold text-[var(--text-1)]">{s.name}</span>
                      {s.enrollment_date?.startsWith(currentMonth) && (
                        <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-md bg-[var(--blue-bg)] text-[var(--blue)] font-bold">신규</span>
                      )}
                      <span className="text-[13px] text-[var(--text-4)] ml-2">{s.gradeName} · {s.class?.name}</span>
                    </div>
                    <span className="text-[13px] text-[var(--text-4)] tabular-nums">{(fee - paid).toLocaleString()}원</span>
                    <span className="px-2.5 py-1 rounded-lg text-[12px] font-bold" style={{ backgroundColor: '#302a1a', color: '#e5a731' }}>
                      {month}/{dueDay} 예정
                    </span>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </FadeInUp>
      )}

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
            <h2 className="text-[17px] font-bold text-[var(--text-1)] mb-4">선생님별 매출</h2>
            {teacherStats.map(({ teacher, totalFee, totalPaid, studentCount, classCount }) => (
              <div key={teacher.id} className="flex items-center justify-between py-3.5 border-b border-[var(--border)] last:border-b-0">
                <div>
                  <span className="text-[15px] font-semibold text-[var(--text-1)]">{teacher.name}</span>
                  <span className="text-[13px] text-[var(--text-4)] ml-2">{classCount}반 · {studentCount}명</span>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-bold text-[var(--text-1)] tabular-nums">{totalFee.toLocaleString()}원</p>
                  <p className="text-[12px] text-[var(--text-4)]">수납 {totalPaid.toLocaleString()}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-4 mt-1">
              <span className="text-[15px] font-bold text-[var(--text-1)]">합계</span>
              <div className="text-right">
                <span className="text-[15px] font-bold text-[var(--text-1)] tabular-nums">{grandFee.toLocaleString()}원</span>
                <p className="text-[12px] text-[var(--text-4)]">수납 {grandPaid.toLocaleString()}</p>
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
            <h2 className="text-[17px] font-bold text-[var(--text-1)] mb-5">반별 인원</h2>
            <div className="space-y-3">
              {classData.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-16 text-[13px] text-[var(--text-3)] font-medium truncate shrink-0">{c.name}</div>
                  <div className="flex-1 h-8 bg-[var(--bg-card-hover)] rounded-xl overflow-hidden relative">
                    <motion.div
                      className="h-full rounded-xl"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max((c.count / maxCount) * 100, 10)}%` }}
                      transition={{ type: 'spring', stiffness: 80, damping: 20, delay: i * 0.05 }}
                      style={{ background: 'var(--blue)' }}
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center text-[13px] font-bold text-[var(--text-3)]">{c.count}</span>
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
          <h2 className="text-[17px] font-bold text-[var(--text-1)] mb-4">학년별 원비</h2>
          {grades.map(grade => {
            const gradeStudents = grade.classes.flatMap(c =>
              getActiveStudents(c.students ?? [], currentMonth).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
            )
            const gradeFee = gradeStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
            const gradePaid = gradeStudents.reduce((sum, s) => sum + getStudentPaid(s.id), 0)
            if (gradeStudents.length === 0) return null
            return (
              <div key={grade.id} className="flex items-center justify-between py-3.5 border-b border-[var(--border)] last:border-b-0">
                <div>
                  <span className="text-[15px] font-semibold text-[var(--text-1)]">{grade.name}</span>
                  <span className="text-[13px] text-[var(--text-4)] ml-2">{gradeStudents.length}명</span>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-bold text-[var(--text-1)] tabular-nums">{gradeFee.toLocaleString()}원</p>
                  <p className="text-[12px] text-[var(--text-4)]">수납 {gradePaid.toLocaleString()}</p>
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between pt-4 mt-1">
            <span className="text-[15px] font-bold text-[var(--text-1)]">합계</span>
            <span className="text-[15px] font-bold text-[var(--text-1)] tabular-nums">{stats.totalFee.toLocaleString()}원</span>
          </div>
        </FadeInUp>
      )}
    </div>
  )
}
