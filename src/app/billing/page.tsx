'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Send, Check, Loader2, Square } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Student, GradeWithClasses } from '@/types'
import { getStudentFee } from '@/types'
import { useGrades, safeMutate, getActiveStudents, getPaymentDueDay } from '@/lib/utils'
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
  sent_at: string
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

export default function BillingPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [weekFilter, setWeekFilter] = useState<WeekFilter>('all')
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const [showFilter, setShowFilter] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  const { data: grades = [], isLoading: gradesLoading, mutate: mutateGrades } = useGrades<GradeWithClasses[]>()
  const { data: bills = [], mutate: mutateBills } = useSWR<BillRecord[]>(
    `/api/billing?month=${selectedMonth}`,
    (url: string) => fetch(url).then(r => r.json()),
    { refreshInterval: 30000 }
  )
  const { data: testModeData } = useSWR<{ testMode: boolean }>(
    '/api/billing/test-mode',
    (url: string) => fetch(url).then(r => r.json())
  )
  const isTestMode = testModeData?.testMode ?? true

  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const [batchSending, setBatchSending] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [results, setResults] = useState<Map<string, { ok: boolean; msg: string }>>(new Map())
  const cancelBatchRef = useRef(false)

  const navigateMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const toggleClass = (classId: string) => {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      if (next.has(classId)) next.delete(classId); else next.add(classId)
      return next
    })
  }

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

  const subjectGradeGroups = useMemo(() => {
    const subjectMap = new Map<string, Map<string, { gradeName: string; classes: ClassWithStudents[] }>>()
    grades.forEach(grade => {
      grade.classes.forEach(cls => {
        const subject = cls.subject || '기타'
        if (!subjectMap.has(subject)) subjectMap.set(subject, new Map())
        const gradeMap = subjectMap.get(subject)!
        if (!gradeMap.has(grade.id)) gradeMap.set(grade.id, { gradeName: grade.name, classes: [] })
        gradeMap.get(grade.id)!.classes.push(cls as ClassWithStudents)
      })
    })
    return Array.from(subjectMap.entries()).map(([subject, gradeMap]) => ({
      subject,
      grades: Array.from(gradeMap.entries()).map(([gradeId, data]) => ({ gradeId, ...data })),
    }))
  }, [grades])

  const getFilteredStudents = useCallback((cls: ClassWithStudents): Student[] => {
    const active = getActiveStudents(cls.students ?? [], selectedMonth)
    const filtered = active.filter(s => matchesWeekFilter(getDueDay(s)))
    return [...filtered].sort((a, b) => getDueDay(a) - getDueDay(b))
  }, [selectedMonth, matchesWeekFilter, getDueDay])

  // 표시될 섹션만 남긴 flat 목록 (스크롤 관찰용)
  type SectionRef = { key: string; classIds: string[] }
  const visibleSections = useMemo<SectionRef[]>(() => {
    const list: SectionRef[] = []
    for (const { subject, grades: sgs } of subjectGradeGroups) {
      for (const { gradeId, classes: gcs } of sgs) {
        const visible = gcs.filter(c => getFilteredStudents(c).length > 0)
        if (visible.length === 0) continue
        list.push({ key: `${subject}__${gradeId}`, classIds: visible.map(c => c.id) })
      }
    }
    return list
  }, [subjectGradeGroups, getFilteredStudents])

  const allVisibleStudents = useMemo<StudentWithClass[]>(() =>
    grades.flatMap(g => g.classes.flatMap(c =>
      getFilteredStudents(c as ClassWithStudents).map(s => ({ ...s, class: c as ClassWithStudents }))
    )), [grades, getFilteredStudents])

  const stats = useMemo(() => {
    const total = allVisibleStudents.length
    const sent = allVisibleStudents.filter(s => billByStudent.has(s.id)).length
    const paid = allVisibleStudents.filter(s => billByStudent.get(s.id)?.status === 'paid').length
    return { total, sent, paid, unsent: total - sent }
  }, [allVisibleStudents, billByStudent])

  // 기본: 보이는 반 전부 펼침 (새 반 등장 시 추가만, 사용자 접음은 유지)
  useEffect(() => {
    const allIds = visibleSections.flatMap(s => s.classIds)
    if (allIds.length === 0) return
    setExpandedClasses(prev => {
      const next = new Set(prev)
      allIds.forEach(id => next.add(id))
      return next
    })
  }, [visibleSections])

  // ─── Memo (스크롤 연동 상단 고정) ───────────────────────────
  const [memo, setMemo] = useState('')
  const [memoFocused, setMemoFocused] = useState(false)
  const [memoScrolled, setMemoScrolled] = useState(false)
  const memoRef = useRef<HTMLTextAreaElement>(null)

  // 로드
  useEffect(() => {
    try {
      const s = localStorage.getItem('billing_memo')
      if (s) setMemo(s)
    } catch {}
  }, [])
  // 저장(디바운스)
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem('billing_memo', memo) } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [memo])

  // 스크롤 감지
  useEffect(() => {
    const onScroll = () => setMemoScrolled(window.scrollY > 30)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const MEMO_LINE = 22
  const MEMO_PAD = 16
  const [memoContentHeight, setMemoContentHeight] = useState(3 * MEMO_LINE)

  useEffect(() => {
    if (memoFocused && memoRef.current) {
      setMemoContentHeight(Math.max(3 * MEMO_LINE, memoRef.current.scrollHeight))
    }
  }, [memoFocused, memo])

  const memoHeight = memoScrolled && !memoFocused
    ? MEMO_LINE + MEMO_PAD                                      // 1줄
    : memoFocused
      ? memoContentHeight + MEMO_PAD                            // 포커스 시 내용만큼
      : 3 * MEMO_LINE + MEMO_PAD                                // 기본 3줄

  // 필터 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!showFilter) return
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showFilter])

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

  const sendBill = useCallback(async (student: StudentWithClass) => {
    const phone = student.parent_phone || student.phone || ''
    const fee = getStudentFee(student, student.class)
    if (!phone || fee <= 0) return

    setSendingIds(prev => new Set(prev).add(student.id))
    const { data, error } = await safeMutate<{ code: string; msg: string; bill_id?: string; shortURL?: string }>('/api/payssam/send', 'POST', {
      studentId: student.id,
      studentName: student.name,
      phone: phone.replace(/-/g, ''),
      amount: fee,
      productName: `${selectedMonth.replace('-', '년 ')}월 수업료`,
      billingMonth: selectedMonth,
    })

    setSendingIds(prev => { const n = new Set(prev); n.delete(student.id); return n })

    if (error || !data || data.code !== '0000') {
      setResults(prev => new Map(prev).set(student.id, { ok: false, msg: error || data?.msg || '발송 실패' }))
    } else {
      setResults(prev => new Map(prev).set(student.id, { ok: true, msg: '발송 완료' }))
      mutateBills()
    }

    setTimeout(() => setResults(prev => { const n = new Map(prev); n.delete(student.id); return n }), 3000)
  }, [selectedMonth, mutateBills])

  const sendClassBatch = useCallback(async (classId: string, students: StudentWithClass[]) => {
    const eligible = students.filter(s => {
      const phone = s.parent_phone || s.phone || ''
      const fee = getStudentFee(s, s.class)
      return phone && fee > 0 && !billByStudent.has(s.id)
    })
    if (eligible.length === 0) return

    cancelBatchRef.current = false
    setCancelling(false)
    setBatchSending(classId)
    setBatchProgress({ done: 0, total: eligible.length })

    for (let i = 0; i < eligible.length; i++) {
      if (cancelBatchRef.current) break
      await sendBill(eligible[i])
      setBatchProgress({ done: i + 1, total: eligible.length })
      if (cancelBatchRef.current) break
      if (i < eligible.length - 1) await new Promise(r => setTimeout(r, 500))
    }

    setBatchSending(null)
    setBatchProgress(null)
    setCancelling(false)
    cancelBatchRef.current = false
  }, [billByStudent, sendBill])

  const cancelBatch = useCallback(() => {
    cancelBatchRef.current = true
    setCancelling(true)
  }, [])

  const getBillStatus = (studentId: string): 'unsent' | 'sent' | 'paid' | 'cancelled' => {
    const bill = billByStudent.get(studentId)
    if (!bill) return 'unsent'
    if (bill.status === 'paid') return 'paid'
    if (bill.status === 'cancelled' || bill.status === 'destroyed') return 'cancelled'
    return 'sent'
  }

  const statusConfig = {
    unsent: { label: '미발송', bg: 'var(--bg-elevated)', text: 'var(--text-4)' },
    sent: { label: '발송됨', bg: 'var(--orange-dim)', text: 'var(--orange)' },
    paid: { label: '결제완료', bg: 'var(--green-dim)', text: 'var(--paid-text)' },
    cancelled: { label: '취소됨', bg: 'var(--red-dim)', text: 'var(--red)' },
  }

  if (gradesLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[var(--text-4)]" /></div>
  }

  const filterOrder: WeekFilter[] = ['all', 'day1', 'week1', 'week2', 'week3', 'week4']

  const formatRange = (r: [number, number]) =>
    r[0] > r[1] ? '-' : r[0] === r[1] ? `${r[0]}일` : `${r[0]}~${r[1]}`

  return (
    <div ref={containerRef}>
      {isTestMode && (
        <div className="flex items-center gap-2 px-4 py-2 mb-2 rounded-xl bg-[var(--orange-dim)] border border-[var(--orange)]">
          <span className="text-base">🔒</span>
          <div>
            <p className="text-sm font-bold text-[var(--orange)]">테스트 모드</p>
            <p className="text-[11px] text-[var(--text-3)]">실제 발송되지 않습니다. 버튼을 눌러도 시뮬레이션만 됩니다.</p>
          </div>
        </div>
      )}

      {/* Sticky Memo — 스크롤해도 상단 고정, 3줄→1줄 축소, 탭하면 펼침 */}
      <div className="sticky -top-6 z-30 bg-[var(--bg)] -mx-4 px-4 pt-6 pb-2">
        <textarea
          ref={memoRef}
          value={memo}
          onChange={e => setMemo(e.target.value)}
          onFocus={() => setMemoFocused(true)}
          onBlur={() => setMemoFocused(false)}
          placeholder="메모..."
          className="w-full resize-none bg-[var(--bg-elevated)] rounded-xl px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)] overflow-hidden leading-[22px]"
          style={{ height: memoHeight, transition: 'height 0.2s ease-out' }}
        />
      </div>

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
        <div className="flex items-center justify-center gap-3 mb-1">
          <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-[var(--bg-elevated)] rounded-lg" aria-label="이전 달">
            <ChevronLeft className="w-7 h-7" />
          </button>
          <h1 className="font-extrabold tracking-tight text-center">
            <span className="text-[2.6rem] sm:text-[3.2rem] leading-none">{selectedMonth.split('-')[0]}</span>
            <span className="text-[1.8rem] sm:text-[2.2rem] text-[var(--text-3)]">년 </span>
            <span className="text-5xl sm:text-6xl">{parseInt(selectedMonth.split('-')[1])}</span>
            <span className="text-[1.8rem] sm:text-[2.2rem] text-[var(--text-3)]">월</span>
          </h1>
          <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-[var(--bg-elevated)] rounded-lg" aria-label="다음 달">
            <ChevronRight className="w-7 h-7" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-3">
          <div className="card px-3 py-2 text-center">
            <p className="text-[var(--text-4)] text-[10px]">전체</p>
            <p className="text-lg font-bold">{stats.total}</p>
          </div>
          <div className="card px-3 py-2 text-center">
            <p className="text-[10px]" style={{ color: 'var(--orange)' }}>발송됨</p>
            <p className="text-lg font-bold" style={{ color: 'var(--orange)' }}>{stats.sent}</p>
          </div>
          <div className="card px-3 py-2 text-center">
            <p className="text-[10px]" style={{ color: 'var(--paid-text)' }}>결제완료</p>
            <p className="text-lg font-bold" style={{ color: 'var(--paid-text)' }}>{stats.paid}</p>
          </div>
          <div className="card px-3 py-2 text-center">
            <p className="text-[var(--text-4)] text-[10px]">미발송</p>
            <p className="text-lg font-bold">{stats.unsent}</p>
          </div>
        </div>

        {/* 결제일 필터 — 우측 드롭다운 */}
        <div className="flex justify-end mt-2.5 mb-1">
          <div ref={filterRef} className="relative">
            <button
              onClick={() => setShowFilter(v => !v)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-[var(--bg-elevated)] text-[var(--text-2)] hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <span>{FILTER_LABELS[weekFilter]}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
            <AnimatePresence>
              {showFilter && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-1 min-w-[140px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl z-40 overflow-hidden"
                >
                  {filterOrder.map((key) => {
                    const range = key !== 'all' ? weekRanges[key as Exclude<WeekFilter, 'all'>] : null
                    const disabled = range ? !isRangeValid(range) : false
                    const active = weekFilter === key
                    return (
                      <button
                        key={key}
                        onClick={() => { if (!disabled) { setWeekFilter(key); setShowFilter(false) } }}
                        disabled={disabled}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors ${
                          active
                            ? 'bg-[var(--blue)]/20 text-[var(--blue)]'
                            : disabled
                            ? 'text-[var(--text-4)] opacity-40 cursor-not-allowed'
                            : 'text-[var(--text-2)] hover:bg-[var(--bg-elevated)]'
                        }`}
                      >
                        <span>{FILTER_LABELS[key]}</span>
                        {range && isRangeValid(range) && key !== 'day1' && (
                          <span className="text-[10px] opacity-60 ml-3">{formatRange(range)}</span>
                        )}
                      </button>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="mt-2">
      {subjectGradeGroups.map(({ subject, grades: subjectGrades }) => {
        const hasVisible = subjectGrades.some(({ classes: gcs }) =>
          gcs.some(c => getFilteredStudents(c).length > 0)
        )
        if (!hasVisible) return null

        return (
          <div key={subject} className="mb-6">
            <div className="flex items-center mb-2 px-1">
              <h2 className="text-sm font-semibold text-[var(--text-3)]">{subject}</h2>
            </div>
            <div className="space-y-2">
              {subjectGrades.map(({ gradeId, gradeName, classes: gradeClasses }) => {
                const visibleClasses = gradeClasses.filter(c => getFilteredStudents(c).length > 0)
                if (visibleClasses.length === 0) return null

                const gradeClassIds = visibleClasses.map(c => c.id)
                const isGradeExpanded = gradeClassIds.every(id => expandedClasses.has(id))
                const toggleGradeExpand = () => {
                  setExpandedClasses(prev => {
                    const next = new Set(prev)
                    if (isGradeExpanded) gradeClassIds.forEach(id => next.delete(id))
                    else gradeClassIds.forEach(id => next.add(id))
                    return next
                  })
                }

                return (
                  <div key={gradeId} data-section-key={`${subject}__${gradeId}`}>
                    <div className="flex items-center mb-1 px-1">
                      <button onClick={toggleGradeExpand} className="flex items-center gap-0.5 active:opacity-70">
                        <motion.div animate={{ rotate: isGradeExpanded ? 90 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
                          <ChevronRight className="w-3.5 h-3.5 text-[var(--text-4)]" />
                        </motion.div>
                        <span className="text-xs text-[var(--text-4)]">{gradeName}</span>
                      </button>
                    </div>
                    <div className="card overflow-hidden">
                      {visibleClasses.map(cls => {
                        const filteredStudents = getFilteredStudents(cls)
                        const studentsWithClass: StudentWithClass[] = filteredStudents.map(s => ({ ...s, class: cls }))
                        const sentCount = studentsWithClass.filter(s => billByStudent.has(s.id)).length
                        const paidCount = studentsWithClass.filter(s => billByStudent.get(s.id)?.status === 'paid').length
                        const eligibleCount = studentsWithClass.filter(s => {
                          const phone = s.parent_phone || s.phone || ''
                          const fee = getStudentFee(s, cls)
                          return phone && fee > 0 && !billByStudent.has(s.id)
                        }).length
                        const allPaid = paidCount === studentsWithClass.length && studentsWithClass.length > 0
                        const isBatching = batchSending === cls.id
                        const isClassExpanded = expandedClasses.has(cls.id)

                        return (
                          <div key={cls.id}>
                            <div
                              className="px-4 py-2.5 bg-[var(--bg-card-hover)]/70 border-b border-[var(--border)] flex items-center gap-2 cursor-pointer active:bg-[var(--bg-elevated)] select-none"
                              onClick={() => toggleClass(cls.id)}
                            >
                              <span className="text-sm font-medium text-[var(--text-3)]">{cls.name}</span>
                              <span className="text-xs text-[var(--text-4)]">{sentCount}/{studentsWithClass.length}</span>
                              {allPaid && (
                                <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: 'var(--paid-text)' }}>
                                  <Check className="w-3 h-3" /> 완료
                                </span>
                              )}
                              <span className="flex-1" />
                              {!isBatching && eligibleCount > 0 && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); sendClassBatch(cls.id, studentsWithClass) }}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--blue)] text-white hover:opacity-90 transition-opacity"
                                >
                                  <Send className="w-3 h-3" /> 일괄({eligibleCount})
                                </button>
                              )}
                              {isBatching && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); cancelBatch() }}
                                  disabled={cancelling}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[var(--red)] text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                                >
                                  {cancelling ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> 중단중</>
                                  ) : (
                                    <><Square className="w-3 h-3" fill="currentColor" /> {batchProgress?.done ?? 0}/{batchProgress?.total ?? 0}</>
                                  )}
                                </button>
                              )}
                            </div>

                            <AnimatePresence initial={false}>
                              {isClassExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                  style={{ overflow: 'hidden' }}
                                >
                                  {studentsWithClass.map((student, idx) => {
                                    const phone = student.parent_phone || student.phone || ''
                                    const fee = getStudentFee(student, cls)
                                    const status = getBillStatus(student.id)
                                    const config = statusConfig[status]
                                    const isSending = sendingIds.has(student.id)
                                    const result = results.get(student.id)
                                    const canSend = phone && fee > 0 && status === 'unsent'
                                    const dueDay = getDueDay(student)

                                    return (
                                      <div key={student.id} className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] last:border-b-0">
                                        <span className="text-[11px] font-semibold text-[var(--text-4)] w-5 text-right shrink-0 tabular-nums">{idx + 1}</span>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1">
                                            <span className="text-sm font-medium truncate">{student.name}</span>
                                            {!phone && <span className="text-[9px] px-1 py-0.5 rounded-full bg-[var(--orange-dim)] text-[var(--orange)]" title="전화번호 없음">📵</span>}
                                            {dueDay > 0 && (
                                              <span className="text-[9px] text-[var(--text-4)]">· {dueDay}일</span>
                                            )}
                                          </div>
                                          <p className="text-[11px] text-[var(--text-4)] truncate">{fee.toLocaleString()}원</p>
                                        </div>

                                        {result && (
                                          <span className={`text-[10px] font-medium ${result.ok ? 'text-[var(--paid-text)]' : 'text-[var(--red)]'}`}>
                                            {result.msg}
                                          </span>
                                        )}

                                        <span
                                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                                          style={{ backgroundColor: config.bg, color: config.text }}
                                        >
                                          {config.label}
                                        </span>

                                        {canSend && !isSending && (
                                          <button
                                            onClick={() => sendBill(student)}
                                            className="p-1.5 text-[var(--blue)] hover:bg-[var(--blue-dim)] rounded-lg transition-colors"
                                            title="개별 발송"
                                          >
                                            <Send className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        {isSending && <Loader2 className="w-4 h-4 animate-spin text-[var(--blue)]" />}
                                      </div>
                                    )
                                  })}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
      </div>

      {stats.total === 0 && (
        <div className="text-center py-12 text-[var(--text-4)]">
          {weekFilter === 'all' ? '학생 데이터가 없습니다' : '해당 기간에 결제일이 있는 학생이 없습니다'}
        </div>
      )}
    </div>
  )
}
