'use client'

import { useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Users, CreditCard, AlertCircle, TrendingUp } from 'lucide-react'
import type { Payment, GradeWithClasses } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS } from '@/types'
import { getPaymentDueDay, isPaymentScheduled, getActiveStudents, getCurrentMonth, formatMonth, useGrades, usePayments } from '@/lib/utils'

export default function DashboardPage() {
  const currentMonth = getCurrentMonth()
  const { data: grades = [], error: gradesError, isLoading: gradesLoading } = useGrades<GradeWithClasses[]>()
  const { data: payments = [], error: paymentsError, isLoading: paymentsLoading } = usePayments<Payment[]>(currentMonth)

  const loading = gradesLoading || paymentsLoading
  const error = gradesError || paymentsError

  const allStudents = useMemo(() =>
    grades.flatMap(g =>
      g.classes.flatMap(c =>
        getActiveStudents(c.students ?? [], currentMonth).map(s => ({ ...s, class: c }))
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
    <div className="animate-pulse" style={{ padding: '20px 16px 12px' }}>
      <div className="h-6 bg-gray-200 rounded w-40 mb-2"></div>
      <div className="h-4 bg-gray-100 rounded w-56 mb-6"></div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', padding: 16 }}>
            <div className="h-3 bg-gray-200 rounded w-12 mb-3"></div>
            <div className="h-7 bg-gray-200 rounded w-20"></div>
          </div>
        ))}
      </div>
    </div>
  )

  if (error) return (
    <div className="text-center py-12">
      <p style={{ color: 'var(--color-red)' }} className="mb-4">{error?.message}</p>
      <button onClick={() => window.location.reload()} className="ios-tap" style={{ background: 'var(--accent)', color: '#fff', padding: '10px 20px', borderRadius: 8 }}>다시 시도</button>
    </div>
  )

  return (
    <div>
      {/* 월 타이틀 */}
      <div style={{ padding: '20px 16px 12px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, color: 'var(--text-primary)' }}>
          {formatMonth(currentMonth)} 대시보드
        </h1>
        <p style={{ fontSize: 15, fontWeight: 400, lineHeight: 1.4, color: 'var(--text-secondary)', marginTop: 2 }}>
          {new Date().toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* 4개 KPI 카드 (2x2 그리드) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '0 16px 16px' }}>
        {[
          { icon: <Users style={{ width: 16, height: 16, color: 'var(--accent)' }} />, label: '재원생', value: stats.totalStudents, unit: '명' },
          { icon: <TrendingUp style={{ width: 16, height: 16, color: 'var(--color-green)' }} />, label: '납부율', value: stats.paymentRate, unit: '%', sub: `${stats.paidCount}/${stats.totalStudents}명` },
          { icon: <CreditCard style={{ width: 16, height: 16, color: 'var(--accent)' }} />, label: '수납/총원비', value: (stats.totalPaid / 10000).toFixed(0), unit: '만', sub: `/ ${(stats.totalFee / 10000).toFixed(0)}만원` },
          { icon: <AlertCircle style={{ width: 16, height: 16, color: 'var(--color-red)' }} />, label: '미납/예정', isSpecial: true },
        ].map((card, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              {card.icon}
              <span style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.3, color: 'var(--text-secondary)' }}>{card.label}</span>
            </div>
            {'isSpecial' in card && card.isSpecial ? (
              <p style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.5 }}>
                <span style={{ color: 'var(--color-red)' }}>{stats.overdueStudents.length}</span>
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, margin: '0 4px' }}>/</span>
                <span style={{ color: 'var(--color-orange)' }}>{stats.scheduledStudents.length}</span>
                <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 2 }}>명</span>
              </p>
            ) : (
              <>
                <p style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2, letterSpacing: -0.5 }}>
                  {card.value}<span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 2 }}>{card.unit}</span>
                </p>
                {card.sub && <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{card.sub}</p>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* 납부 기한 임박 */}
      {urgentStudents.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', margin: '0 16px 16px', overflow: 'hidden', borderLeft: '3px solid var(--color-orange)' }}>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-orange)', display: 'inline-block' }} />
              <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4, color: 'var(--text-primary)' }}>납부 기한 임박 ({urgentStudents.length}명)</span>
            </div>
            <div>
              {urgentStudents.slice(0, 5).map((s, idx) => {
                const fee = getStudentFee(s, s.class)
                const paid = getStudentPaid(s.id)
                const enrollDay = new Date(s.enrollment_date).getDate()
                return (
                  <Link key={s.id} href={`/students/${s.id}`}>
                    <div
                      className="ios-tap"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        minHeight: 44, padding: '0 0',
                        borderBottom: idx < urgentStudents.slice(0, 5).length - 1 ? '0.5px solid var(--separator)' : 'none',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4 }}>{s.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>{s.class?.name}</span>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)' }}>
                        매월 {enrollDay}일 · {(fee - paid).toLocaleString()}원 미납
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 미납 학생 섹션 */}
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', margin: '0 16px 16px', overflow: 'hidden' }}>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4 }}>미납 학생</span>
            {stats.overdueStudents.length > 0 && <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-red)' }}>미납 {stats.overdueStudents.length}</span>}
            {stats.overdueStudents.length > 0 && stats.scheduledStudents.length > 0 && <span style={{ color: 'var(--text-tertiary)', margin: '0 2px' }}>·</span>}
            {stats.scheduledStudents.length > 0 && <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-orange)' }}>예정 {stats.scheduledStudents.length}</span>}
          </div>
          {stats.unpaidStudents.length === 0 ? (
            <p style={{ fontSize: 15, color: 'var(--text-secondary)', padding: '16px 0', textAlign: 'center' }}>모든 학생이 납부 완료했습니다</p>
          ) : (
            <div>
              {stats.unpaidStudents.map((s, idx) => {
                const fee = getStudentFee(s, s.class)
                const paid = getStudentPaid(s.id)
                const status = getPaymentStatus(paid, fee)
                const scheduled = status === 'unpaid' && isPaymentScheduled(s, currentMonth)
                const dueDay = getPaymentDueDay(s)
                const month = parseInt(currentMonth.split('-')[1])
                const displayLabel = status === 'unpaid'
                  ? `${month}/${dueDay} ${scheduled ? '예정' : '미납'}`
                  : PAYMENT_STATUS_LABELS[status]

                let badgeBg: string, badgeColor: string
                if (scheduled) {
                  badgeBg = 'var(--badge-scheduled-bg)'; badgeColor = 'var(--badge-scheduled-text)'
                } else if (status === 'partial') {
                  badgeBg = 'var(--badge-partial-bg)'; badgeColor = 'var(--badge-partial-text)'
                } else {
                  badgeBg = 'var(--badge-unpaid-bg)'; badgeColor = 'var(--badge-unpaid-text)'
                }

                return (
                  <Link key={s.id} href={`/students/${s.id}`}>
                    <div
                      className="ios-tap"
                      style={{
                        display: 'flex', alignItems: 'center', minHeight: 44,
                        borderBottom: idx < stats.unpaidStudents.length - 1 ? '0.5px solid var(--separator)' : 'none',
                        paddingLeft: 0,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4 }}>{s.name}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>{s.class?.name}</span>
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-primary)', marginRight: 8 }}>{(fee - paid).toLocaleString()}원</span>
                      <span style={{
                        background: badgeBg, color: badgeColor,
                        borderRadius: 6, padding: '4px 8px',
                        fontSize: 12, fontWeight: 600,
                      }}>
                        {displayLabel}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 반별 인원 바 차트 */}
      {grades.length > 0 && (() => {
        const classData = grades.flatMap(g =>
          g.classes.map(c => ({
            name: c.name,
            gradeName: g.name,
            count: getActiveStudents(c.students ?? [], currentMonth).length,
            subject: c.subject,
          }))
        ).filter(c => c.count > 0)
        const maxCount = Math.max(...classData.map(c => c.count), 1)

        return (
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', margin: '0 16px 16px', overflow: 'hidden' }}>
            <div style={{ padding: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginBottom: 12 }}>반별 인원</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {classData.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 56, fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    <div style={{ flex: 1, height: 8, background: 'var(--bg-primary)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        width: `${Math.max((c.count / maxCount) * 100, 8)}%`,
                        background: 'var(--accent)',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', minWidth: 30, textAlign: 'right' }}>{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

      {/* 학년별 원비 총액 */}
      {grades.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', margin: '0 16px 16px', overflow: 'hidden' }}>
          <div style={{ padding: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginBottom: 12 }}>학년별 원비 총액</h2>
            <div>
              {grades.map((grade, idx) => {
                const gradeStudents = grade.classes.flatMap(c =>
                  getActiveStudents(c.students ?? [], currentMonth).map(s => ({ ...s, class: c }))
                )
                const gradeFee = gradeStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
                const gradePaid = gradeStudents.reduce((sum, s) => sum + getStudentPaid(s.id), 0)
                if (gradeStudents.length === 0) return null

                return (
                  <div key={grade.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    minHeight: 44,
                    borderBottom: idx < grades.length - 1 ? '0.5px solid var(--separator)' : 'none',
                  }}>
                    <div>
                      <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4 }}>{grade.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>{gradeStudents.length}명</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4 }}>{gradeFee.toLocaleString()}원</span>
                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>수납 {gradePaid.toLocaleString()}원</span>
                    </div>
                  </div>
                )
              })}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                minHeight: 44, borderTop: '1px solid var(--separator)',
              }}>
                <span style={{ fontSize: 17, fontWeight: 700 }}>합계</span>
                <span style={{ fontSize: 17, fontWeight: 700 }}>{stats.totalFee.toLocaleString()}원</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
