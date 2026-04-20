'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { ChevronDown, Loader2, AlertCircle, Clock, PhoneOff, Lock, Download, FileText, Ban, Send } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import type { Student, GradeWithClasses } from '@/types'
import { getStudentFee } from '@/types'
import { useGrades, getActiveStudents, getPaymentDueDay } from '@/lib/utils'
import AiFilterButton from '@/components/payments/AiFilterButton'
import QuickBillSendModal from '@/components/QuickBillSendModal'
import useSWR from 'swr'

interface BillRecord {
  id: string
  student_id: string
  bill_id: string
  amount: number
  billing_month: string
  phone: string
  status: string
  short_url?: string
  appr_price?: number
  appr_dt?: string
  sent_at: string
  updated_at?: string
  is_regular_tuition?: boolean
  bill_note?: string | null
}

type WeekFilter = 'all' | 'day1' | 'week1' | 'week2' | 'week3' | 'week4'

type ClassWithStudents = GradeWithClasses['classes'][number]
type StudentWithClass = Student & { class: ClassWithStudents }

const FILTER_LABELS: Record<WeekFilter, string> = {
  all: '전체',
  day1: '1일',
  week1: '첫째주',
  week2: '둘째주',
  week3: '셋째주',
  week4: '넷째주',
}

const WEEK_KEYS: Exclude<WeekFilter, 'all'>[] = ['day1', 'week1', 'week2', 'week3', 'week4']

function timeAgo(iso: string, now: number): string {
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const min = Math.floor(diff / 60000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}일 전`
  return new Date(iso).toISOString().slice(5, 10)
}

export default function BillingPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [weekFilter] = useState<WeekFilter>('all')
  const [expandedAction, setExpandedAction] = useState<'overdue' | 'cancelled' | 'nophone' | null>(null)
  const [showTools, setShowTools] = useState(false)
  const [nowTs, setNowTs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 60000)
    return () => clearInterval(id)
  }, [])

  const { data: grades = [], isLoading: gradesLoading, mutate: mutateGrades } = useGrades<GradeWithClasses[]>()
  const { data: bills = [], mutate: mutateBills } = useSWR<BillRecord[]>(
    `/api/billing?month=${selectedMonth}`,
    (url: string) => fetch(url).then(r => r.json()),
    { refreshInterval: 30000 }
  )

  const { data: testModeInfo } = useSWR<{ testMode: boolean }>(
    '/api/billing/test-mode',
    (url: string) => fetch(url).then(r => r.json()),
    { refreshInterval: 60000 }
  )

  // Sun~Sat 기준 주차 범위
  const weekRanges = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const firstDay = new Date(y, m - 1, 1)
    const lastDay = new Date(y, m, 0).getDate()
    const firstDow = firstDay.getDay()

    const week1EndDay = Math.min(1 + (6 - firstDow), lastDay)
    const week1: [number, number] = [2, week1EndDay]
    const w2s = week1EndDay + 1
    const w2e = Math.min(w2s + 6, lastDay)
    const w3s = w2e + 1
    const w3e = Math.min(w3s + 6, lastDay)
    const w4s = w3e + 1
    const w4e = lastDay

    return {
      day1: [1, 1] as [number, number],
      week1,
      week2: [w2s, w2e] as [number, number],
      week3: [w3s, w3e] as [number, number],
      week4: [w4s, w4e] as [number, number],
    }
  }, [selectedMonth])

  const isRangeValid = (r: [number, number]) => r[0] <= r[1]

  const getDueDay = useCallback((s: Student): number => s.payment_due_day ?? getPaymentDueDay(s), [])

  const matchesWeekFilter = useCallback((dueDay: number) => {
    if (weekFilter === 'all') return true
    if (!dueDay) return false
    const [start, end] = weekRanges[weekFilter]
    if (start > end) return false
    return dueDay >= start && dueDay <= end
  }, [weekFilter, weekRanges])

  const billByStudent = useMemo(() => {
    const map = new Map<string, BillRecord>()
    for (const b of bills) map.set(b.student_id, b)
    return map
  }, [bills])

  // AI 필터 (검색요정)
  const [aiFilterIds, setAiFilterIds] = useState<Set<string> | null>(null)
  const [aiFilterDesc, setAiFilterDesc] = useState('')
  const [aiFilterLoading, setAiFilterLoading] = useState(false)

  // 청구서 발송 모달
  const [showSendModal, setShowSendModal] = useState(false)

  const allVisibleStudents = useMemo<StudentWithClass[]>(() =>
    grades.flatMap(g => g.classes.flatMap(c => {
      const active = getActiveStudents((c as ClassWithStudents).students ?? [], selectedMonth)
      return active
        .filter(s => matchesWeekFilter(getDueDay(s)))
        .filter(s => aiFilterIds ? aiFilterIds.has(s.id) : true)
        .map(s => ({ ...s, class: c as ClassWithStudents }))
    })), [grades, selectedMonth, matchesWeekFilter, getDueDay, aiFilterIds])

  // 발송 모달용: 모든 활성 학생 (필터 미적용)
  const allForSendModal = useMemo<StudentWithClass[]>(() =>
    grades.flatMap(g => g.classes.flatMap(c => {
      const active = getActiveStudents((c as ClassWithStudents).students ?? [], selectedMonth)
      return active.map(s => ({ ...s, class: c as ClassWithStudents }))
    })), [grades, selectedMonth])

  const studentById = useMemo(() => {
    const map = new Map<string, StudentWithClass>()
    for (const s of allVisibleStudents) map.set(s.id, s)
    return map
  }, [allVisibleStudents])

  // 최근 활동 등 전체 학생 메타(필터 무관) — 과목/학년/반/원래결제일 표시용
  const studentMetaById = useMemo(() => {
    const map = new Map<string, { name: string; subject: string | null; gradeName: string; className: string; dueDay: number }>()
    for (const g of grades) {
      for (const c of g.classes) {
        for (const s of (c as ClassWithStudents).students ?? []) {
          map.set(s.id, {
            name: s.name,
            subject: c.subject ?? null,
            gradeName: g.name,
            className: c.name,
            dueDay: s.payment_due_day ?? getPaymentDueDay(s),
          })
        }
      }
    }
    return map
  }, [grades])

  // Expanded stats — counts + amounts per status
  const stats = useMemo(() => {
    const expectedAmount = allVisibleStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
    const total = allVisibleStudents.length

    const scopedBills = weekFilter === 'all'
      ? bills
      : bills.filter(b => studentById.has(b.student_id))

    let sentCount = 0, paidCount = 0, cancelledCount = 0
    let sentAmount = 0, paidAmount = 0, pendingAmount = 0, cancelledAmount = 0

    for (const b of scopedBills) {
      if (b.status === 'paid') {
        paidCount++
        paidAmount += b.appr_price ?? b.amount
        sentAmount += b.amount
        sentCount++
      } else if (b.status === 'cancelled' || b.status === 'destroyed') {
        cancelledCount++
        cancelledAmount += b.amount
      } else {
        sentCount++
        sentAmount += b.amount
        pendingAmount += b.amount
      }
    }

    const activeSent = sentCount - paidCount  // 발송됨(미결제)
    const unsent = Math.max(0, total - sentCount - cancelledCount)
    const paymentRate = sentCount > 0 ? Math.round((paidCount / sentCount) * 100) : 0

    return {
      total,
      expectedAmount,
      sentCount,
      paidCount,
      cancelledCount,
      activeSent,
      unsent,
      sentAmount,
      paidAmount,
      pendingAmount,
      cancelledAmount,
      paymentRate,
    }
  }, [allVisibleStudents, bills, weekFilter, studentById])

  // 주차별 결제율
  const weekStats = useMemo(() => {
    return WEEK_KEYS.map(key => {
      const [start, end] = weekRanges[key]
      if (start > end) return { key, label: FILTER_LABELS[key], range: [start, end] as [number, number], total: 0, paid: 0, sent: 0 }
      const students = allVisibleStudents.filter(s => {
        const d = getDueDay(s)
        return d >= start && d <= end
      })
      let paid = 0, sent = 0
      for (const s of students) {
        const b = billByStudent.get(s.id)
        if (!b) continue
        if (b.status === 'paid') { paid++; sent++ }
        else if (b.status !== 'cancelled' && b.status !== 'destroyed') sent++
      }
      return { key, label: FILTER_LABELS[key], range: [start, end] as [number, number], total: students.length, paid, sent }
    })
  }, [weekRanges, allVisibleStudents, billByStudent, getDueDay])

  // 액션 필요 리스트
  const actionItems = useMemo(() => {
    const threeDays = 3 * 24 * 60 * 60 * 1000

    const overdue = bills
      .filter(b => {
        if (b.status === 'paid' || b.status === 'cancelled' || b.status === 'destroyed') return false
        return nowTs - new Date(b.sent_at).getTime() >= threeDays
      })
      .filter(b => weekFilter === 'all' || studentById.has(b.student_id))
      .map(b => {
        const s = studentById.get(b.student_id) ?? allVisibleStudents.find(x => x.id === b.student_id)
        return { bill: b, student: s, daysSince: Math.floor((nowTs - new Date(b.sent_at).getTime()) / (24 * 60 * 60 * 1000)) }
      })
      .sort((a, b) => b.daysSince - a.daysSince)

    const cancelled = bills
      .filter(b => b.status === 'cancelled' || b.status === 'destroyed')
      .filter(b => weekFilter === 'all' || studentById.has(b.student_id))
      .map(b => {
        const s = studentById.get(b.student_id) ?? allVisibleStudents.find(x => x.id === b.student_id)
        return { bill: b, student: s }
      })

    const noPhone = allVisibleStudents.filter(s => !(s.parent_phone || s.phone))

    return { overdue, cancelled, noPhone }
  }, [bills, allVisibleStudents, studentById, weekFilter, nowTs])

  // 최근 활동 (최대 30건)
  const recentActivity = useMemo(() => {
    const scoped = weekFilter === 'all'
      ? bills
      : bills.filter(b => studentById.has(b.student_id))
    return scoped.slice(0, 30)
  }, [bills, weekFilter, studentById])

  // ─── Pull-to-refresh ──────────────────────────────────────
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const pullRef = useRef<{ startY: number; pulling: boolean } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const PULL_THRESHOLD = 60

  const handlePullStart = useCallback((e: TouchEvent) => {
    if (isRefreshing) return
    const scrollTop = window.scrollY || document.documentElement.scrollTop
    if (scrollTop > 0) return
    pullRef.current = { startY: e.touches[0].clientY, pulling: false }
  }, [isRefreshing])

  const handlePullMove = useCallback((e: TouchEvent) => {
    if (!pullRef.current || isRefreshing) return
    const dy = e.touches[0].clientY - pullRef.current.startY
    if (dy > 0) {
      pullRef.current.pulling = true
      const distance = Math.min(120, dy * 0.4)
      setPullDistance(distance)
    } else {
      pullRef.current.pulling = false
      setPullDistance(0)
    }
  }, [isRefreshing])

  const handlePullEnd = useCallback(async () => {
    if (!pullRef.current?.pulling || isRefreshing) {
      pullRef.current = null
      return
    }
    pullRef.current = null
    if (pullDistance >= PULL_THRESHOLD) {
      setIsRefreshing(true)
      setPullDistance(40)
      await Promise.all([mutateGrades(), mutateBills()])
      await new Promise(r => setTimeout(r, 500))
      setIsRefreshing(false)
    }
    setPullDistance(0)
  }, [pullDistance, isRefreshing, mutateGrades, mutateBills])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.addEventListener('touchstart', handlePullStart, { passive: true })
    el.addEventListener('touchmove', handlePullMove, { passive: true })
    el.addEventListener('touchend', handlePullEnd)
    return () => {
      el.removeEventListener('touchstart', handlePullStart)
      el.removeEventListener('touchmove', handlePullMove)
      el.removeEventListener('touchend', handlePullEnd)
    }
  }, [handlePullStart, handlePullMove, handlePullEnd])

  // ─── AI 필터 (검색요정) — 청구서 컨텍스트 기반 ──
  const handleAiFilter = useCallback(async (query: string) => {
    setAiFilterLoading(true)
    const allForFilter = grades.flatMap(g => g.classes.flatMap(c => {
      const active = getActiveStudents((c as ClassWithStudents).students ?? [], selectedMonth)
      return active.map(s => ({ ...s, class: c as ClassWithStudents }))
    }))

    const nowMs = Date.now()
    const studentContext = allForFilter.map(s => {
      const bill = bills.find(b => b.student_id === s.id)
      const fee = getStudentFee(s, s.class)
      const dueDay = getDueDay(s)
      const status = bill
        ? (bill.status === 'paid' ? 'paid'
          : (bill.status === 'cancelled' || bill.status === 'destroyed') ? 'cancelled'
          : 'sent')
        : 'unsent'
      const daysSinceSent = bill?.sent_at
        ? Math.floor((nowMs - new Date(bill.sent_at).getTime()) / (24 * 60 * 60 * 1000))
        : null
      return {
        id: s.id,
        name: s.name,
        grade: '',
        class_name: s.class?.name || '',
        fee,
        status,
        due_day: dueDay,
        bill_amount: bill?.amount ?? null,
        paid_amount: bill?.appr_price ?? null,
        sent_at: bill?.sent_at ?? null,
        paid_at: bill?.appr_dt ?? null,
        days_since_sent: daysSinceSent,
        phone_available: !!(s.parent_phone || s.phone),
      }
    })

    try {
      const res = await fetch('/api/agent/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, context: { students: studentContext, billing_month: selectedMonth } }),
      })
      const data = await res.json()
      if (data.student_ids && data.student_ids.length > 0) {
        setAiFilterIds(new Set(data.student_ids))
        setAiFilterDesc(data.description || '필터 적용')
      } else {
        setAiFilterIds(new Set())
        setAiFilterDesc(data.description || '결과 없음')
      }
    } catch {
      alert('AI 필터 처리 중 오류가 발생했습니다.')
    }
    setAiFilterLoading(false)
  }, [grades, bills, selectedMonth, getDueDay])

  const clearAiFilter = useCallback(() => {
    setAiFilterIds(null)
    setAiFilterDesc('')
  }, [])

  const exportCsv = useCallback(() => {
    const rows = [
      ['학생', '금액', '상태', '발송일', '결제일', 'bill_id'],
      ...bills.map(b => {
        const s = studentById.get(b.student_id)
        return [
          s?.name ?? '?',
          b.amount.toString(),
          b.status,
          b.sent_at ?? '',
          b.appr_dt ?? '',
          b.bill_id,
        ]
      }),
    ]
    const csv = '\ufeff' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `결제선생_${selectedMonth}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [bills, studentById, selectedMonth])

  if (gradesLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-4)]" /></div>
  }

  const filterOrder: WeekFilter[] = ['all', 'day1', 'week1', 'week2', 'week3', 'week4']

  const formatRange = (r: [number, number]) =>
    r[0] > r[1] ? '-' : r[0] === r[1] ? `${r[0]}일` : `${r[0]}~${r[1]}`

  const isTestMode = testModeInfo?.testMode !== false

  return (
    <div ref={containerRef}>
      {/* Pull-to-refresh 인디케이터 */}
      <AnimatePresence>
        {pullDistance > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: pullDistance, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex items-center justify-center overflow-hidden"
          >
            <motion.div
              animate={{
                rotate: isRefreshing ? 360 : (pullDistance / PULL_THRESHOLD) * 360,
                scale: pullDistance >= PULL_THRESHOLD ? 1.15 : 0.9,
              }}
              transition={isRefreshing
                ? { rotate: { duration: 0.8, repeat: Infinity, ease: 'linear' } }
                : { type: 'spring', stiffness: 200, damping: 15 }
              }
            >
              <svg className="w-6 h-6 text-[var(--text-4)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pt-2 pb-1">
        {(() => {
          const today = new Date()
          const m = today.getMonth() + 1
          const d = today.getDate()
          const weekday = ['일','월','화','수','목','금','토'][today.getDay()]
          return (
            <h1 className="text-[3rem] font-extrabold tracking-tight leading-none text-[var(--text-1)] tabular-nums mb-2">
              {m}월 {d}일 <span className="text-[2.1rem]">{weekday}요일</span>
            </h1>
          )
        })()}

        {/* 청구서 발송 — 메인 진입점 */}
        <button
          onClick={() => setShowSendModal(true)}
          className="w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[var(--blue)] text-white text-sm font-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-[0_2px_12px_rgba(59,130,246,0.2)]"
        >
          <Send className="w-4 h-4" />
          청구서 발송하기
        </button>

        {isTestMode && (
          <div className="mt-3 mb-2">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--orange-dim)] text-[var(--orange)] text-[11px] font-semibold">
              <Lock className="w-3 h-3" /> 테스트 모드
            </span>
          </div>
        )}

        {/* 액션 필요 */}
        {(actionItems.overdue.length > 0 || actionItems.cancelled.length > 0 || actionItems.noPhone.length > 0) && (
          <div className="card overflow-hidden mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-2)] px-4 pt-4 pb-2">액션 필요</h2>
            <div>
              {actionItems.overdue.length > 0 && (
                <ActionRow
                  icon={<Clock className="w-4 h-4" />}
                  color="var(--orange)"
                  bg="var(--orange-dim)"
                  label="3일 이상 미결제"
                  count={actionItems.overdue.length}
                  expanded={expandedAction === 'overdue'}
                  onToggle={() => setExpandedAction(expandedAction === 'overdue' ? null : 'overdue')}
                >
                  {actionItems.overdue.map(({ bill, student, daysSince }) => (
                    <ActionItemRow
                      key={bill.id}
                      name={student?.name ?? '?'}
                      detail={`${daysSince}일째 미결제`}
                      amount={bill.amount}
                      accent="var(--orange)"
                      irregular={bill.is_regular_tuition === false}
                      note={bill.bill_note}
                    />
                  ))}
                </ActionRow>
              )}
              {actionItems.cancelled.length > 0 && (
                <ActionRow
                  icon={<Ban className="w-4 h-4" />}
                  color="var(--red)"
                  bg="var(--red-dim)"
                  label="취소 / 파기된 청구서"
                  count={actionItems.cancelled.length}
                  expanded={expandedAction === 'cancelled'}
                  onToggle={() => setExpandedAction(expandedAction === 'cancelled' ? null : 'cancelled')}
                >
                  {actionItems.cancelled.map(({ bill, student }) => (
                    <ActionItemRow
                      key={bill.id}
                      name={student?.name ?? '?'}
                      detail={bill.status === 'destroyed' ? '파기됨' : '취소됨'}
                      amount={bill.amount}
                      accent="var(--red)"
                      irregular={bill.is_regular_tuition === false}
                      note={bill.bill_note}
                    />
                  ))}
                </ActionRow>
              )}
              {actionItems.noPhone.length > 0 && (
                <ActionRow
                  icon={<PhoneOff className="w-4 h-4" />}
                  color="var(--text-3)"
                  bg="var(--bg-elevated)"
                  label="전화번호 미등록"
                  count={actionItems.noPhone.length}
                  expanded={expandedAction === 'nophone'}
                  onToggle={() => setExpandedAction(expandedAction === 'nophone' ? null : 'nophone')}
                >
                  {actionItems.noPhone.map(s => (
                    <ActionItemRow
                      key={s.id}
                      name={s.name}
                      detail={s.class?.name ?? ''}
                      accent="var(--text-3)"
                    />
                  ))}
                </ActionRow>
              )}
            </div>
          </div>
        )}

        {/* 최근 활동 피드 */}
        {recentActivity.length > 0 && (
          <div className="card p-4 mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-2)] mb-3">최근 활동</h2>
            <div className="space-y-1.5">
              {recentActivity.map(bill => {
                const s = studentById.get(bill.student_id)
                const meta = studentMetaById.get(bill.student_id)
                const { label, color } = statusBadge(bill.status)
                const isIrregular = bill.is_regular_tuition === false
                const note = bill.bill_note
                const metaParts = meta
                  ? [meta.subject, meta.gradeName, meta.className, meta.dueDay ? `${meta.dueDay}일` : null].filter(Boolean)
                  : []
                return (
                  <div key={bill.id} className="flex items-start gap-2 py-1">
                    <span className="text-[10px] text-[var(--text-4)] w-14 shrink-0 tabular-nums mt-0.5">{timeAgo(bill.updated_at ?? bill.sent_at, nowTs)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium">{s?.name ?? meta?.name ?? '?'}</span>
                        {metaParts.length > 0 && (
                          <span className="text-[10px] text-[var(--text-4)] truncate">{metaParts.join(' · ')}</span>
                        )}
                        {isIrregular && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--orange-dim)] text-[var(--orange)] shrink-0">비정규</span>
                        )}
                      </div>
                      {note && (
                        <p className="text-[10px] text-[var(--text-3)] mt-0.5 truncate" title={note}>📝 {note}</p>
                      )}
                    </div>
                    <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0 mt-0.5" style={{ color, background: dimColor(color) }}>{label}</span>
                    <span className="text-[11px] text-[var(--text-3)] tabular-nums w-20 text-right shrink-0 mt-0.5">{bill.amount.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 결제율 게이지 */}
        <div className="card p-4 mb-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm text-[var(--text-3)] font-semibold">결제율</span>
            <span className="text-[10px] text-[var(--text-4)]">{stats.paidCount}/{stats.sentCount} 건</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-extrabold tabular-nums" style={{ color: 'var(--paid-text)' }}>{stats.paymentRate}</span>
            <span className="text-xl text-[var(--text-3)]">%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--bg-elevated)] mt-2 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'var(--paid-text)' }}
              initial={{ width: 0 }}
              animate={{ width: `${stats.paymentRate}%` }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            />
          </div>
          <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-[var(--border)]">
            <div>
              <p className="text-[10px] text-[var(--text-4)]">결제 완료 금액</p>
              <p className="text-base font-bold tabular-nums" style={{ color: 'var(--paid-text)' }}>{stats.paidAmount.toLocaleString()}원</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-[var(--text-4)]">미결제 금액</p>
              <p className="text-base font-bold tabular-nums" style={{ color: 'var(--orange)' }}>{stats.pendingAmount.toLocaleString()}원</p>
            </div>
          </div>
        </div>

        {/* 2x2 상태 카드 */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[var(--text-4)]">발송</span>
              <span className="text-xs font-bold tabular-nums">{stats.sentCount}</span>
            </div>
            <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--text-2)' }}>{stats.sentAmount.toLocaleString()}원</p>
          </div>
          <div className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px]" style={{ color: 'var(--paid-text)' }}>결제완료</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--paid-text)' }}>{stats.paidCount}</span>
            </div>
            <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--paid-text)' }}>{stats.paidAmount.toLocaleString()}원</p>
          </div>
          <div className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px]" style={{ color: 'var(--orange)' }}>미결제</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--orange)' }}>{stats.activeSent}</span>
            </div>
            <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--orange)' }}>{stats.pendingAmount.toLocaleString()}원</p>
          </div>
          <div className="card p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px]" style={{ color: 'var(--red)' }}>취소/파기</span>
              <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--red)' }}>{stats.cancelledCount}</span>
            </div>
            <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--red)' }}>{stats.cancelledAmount.toLocaleString()}원</p>
          </div>
        </div>

        {/* 주차별 진행률 */}
        <div className="card p-4 mb-3">
          <h2 className="text-sm font-semibold text-[var(--text-2)] mb-3">주차별 결제율</h2>
          <div className="space-y-2.5">
            {weekStats.map(({ key, label, range, total, paid, sent }) => {
              if (!isRangeValid(range) || total === 0) return null
              const totalRate = total > 0 ? Math.round((paid / total) * 100) : 0
              return (
                <div key={key}>
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-[var(--text-2)] inline-block w-[42px] text-left">{label}</span>
                      <span className="text-[10px] text-[var(--text-4)]">{key !== 'day1' ? formatRange(range) : '1일'}</span>
                    </div>
                    <span className="text-[10px] text-[var(--text-4)] tabular-nums">
                      {paid}/{total} · <span style={{ color: 'var(--paid-text)' }}>{totalRate}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden relative">
                    {/* 발송된 부분 */}
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ background: 'var(--orange)', opacity: 0.35 }}
                      initial={{ width: 0 }}
                      animate={{ width: total > 0 ? `${(sent / total) * 100}%` : 0 }}
                      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                    />
                    {/* 결제된 부분 */}
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ background: 'var(--paid-text)' }}
                      initial={{ width: 0 }}
                      animate={{ width: total > 0 ? `${(paid / total) * 100}%` : 0 }}
                      transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 도구 (접힘) */}
        <div className="card overflow-hidden mb-4">
          <button
            onClick={() => setShowTools(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--text-2)] hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            <span>추가 도구</span>
            <motion.div animate={{ rotate: showTools ? 180 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
              <ChevronDown className="w-4 h-4 text-[var(--text-4)]" />
            </motion.div>
          </button>
          <AnimatePresence initial={false}>
            {showTools && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-4 pb-4 space-y-2 border-t border-[var(--border)] pt-3">
                  <Link
                    href="/payments"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-card-hover)] text-sm font-medium text-[var(--text-2)] transition-colors"
                  >
                    <FileText className="w-4 h-4 text-[var(--blue)]" />
                    납부 탭으로 이동 (발송 · 결제 관리)
                  </Link>
                  <button
                    onClick={exportCsv}
                    disabled={bills.length === 0}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-card-hover)] text-sm font-medium text-[var(--text-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-4 h-4 text-[var(--blue)]" />
                    CSV 내보내기 ({bills.length}건)
                  </button>
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--orange-dim)]">
                    <AlertCircle className="w-4 h-4 text-[var(--orange)] shrink-0 mt-0.5" />
                    <div className="text-xs text-[var(--orange)]">
                      <p className="font-semibold">
                        {isTestMode ? '테스트 모드 켜짐' : '운영 모드'}
                      </p>
                      <p className="text-[11px] opacity-80 mt-0.5">
                        {isTestMode
                          ? '실제 발송/결제/취소가 차단되어 있습니다. src/lib/payssam.ts의 TEST_MODE를 false로 바꾸면 실제 운영 전환됩니다.'
                          : '실제 결제선생 API로 발송됩니다.'}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AiFilterButton
        aiFilterIds={aiFilterIds}
        aiFilterDesc={aiFilterDesc}
        onFilter={handleAiFilter}
        onClear={clearAiFilter}
        loading={aiFilterLoading}
      />

      {showSendModal && (
        <QuickBillSendModal
          students={allForSendModal}
          grades={grades}
          billingMonth={selectedMonth}
          onClose={() => setShowSendModal(false)}
          onSuccess={() => mutateBills()}
        />
      )}
    </div>
  )
}

function ActionRow({ icon, color, bg, label, count, expanded, onToggle, children }: {
  icon: React.ReactNode
  color: string
  bg: string
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-t border-[var(--border)] first:border-t-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: bg, color }}
        >
          {icon}
        </span>
        <span className="text-sm font-medium text-[var(--text-2)] flex-1 text-left">{label}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color }}>{count}</span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
          <ChevronDown className="w-4 h-4 text-[var(--text-4)]" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ActionItemRow({ name, detail, amount, irregular, note }: {
  name: string
  detail: string
  amount?: number
  accent?: string
  irregular?: boolean
  note?: string | null
}) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[var(--border)]/40 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium">{name}</span>
          {irregular && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--orange-dim)] text-[var(--orange)]">비정규</span>
          )}
          <span className="text-[11px] text-[var(--text-4)]">{detail}</span>
        </div>
        {note && (
          <p className="text-[10px] text-[var(--text-3)] mt-0.5 truncate" title={note}>📝 {note}</p>
        )}
      </div>
      {amount !== undefined && (
        <span className="text-[11px] font-semibold tabular-nums text-[var(--text-3)] shrink-0 mt-1">{amount.toLocaleString()}원</span>
      )}
    </div>
  )
}

function statusBadge(status: string): { label: string; color: string } {
  switch (status) {
    case 'paid': return { label: '결제완료', color: 'var(--paid-text)' }
    case 'cancelled': return { label: '취소', color: 'var(--red)' }
    case 'destroyed': return { label: '파기', color: 'var(--red)' }
    case 'sent': return { label: '발송됨', color: 'var(--orange)' }
    default: return { label: status, color: 'var(--text-3)' }
  }
}

function dimColor(color: string): string {
  if (color.includes('paid-text')) return 'var(--green-dim)'
  if (color.includes('orange')) return 'var(--orange-dim)'
  if (color.includes('red')) return 'var(--red-dim)'
  return 'var(--bg-elevated)'
}
