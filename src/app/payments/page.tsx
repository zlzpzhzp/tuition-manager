'use client'

import { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Check, ChevronDown, ClipboardList, Download, Plus, Send, Mail, Loader2, CreditCard, Banknote, ArrowLeftRight } from 'lucide-react'
import type { Student, Payment, PaymentMethod, GradeWithClasses } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/types'
import PaymentModal from '@/components/PaymentModal'
import StudentModal from '@/components/StudentModal'
import DatePickerPopup from '@/components/payments/DatePickerPopup'
import MethodPickerPopup from '@/components/payments/MethodPickerPopup'
import { getPrevMonth, getPaymentDueDay, isPaymentScheduled, getUnpaidLabelText, getActiveStudents, isWithdrawnStudent, safeMutate, decodePaymentMemo, useGrades, usePayments, revalidateGrades, revalidatePayments, getTodayString } from '@/lib/utils'
import { METHOD_OPTIONS_SHORT } from '@/lib/constants'
import { getRegularTuitionTitle, REGULAR_TUITION_MESSAGE } from '@/lib/billing-title'
import { PaymentsSkeleton } from '@/components/Skeleton'
import BillSendModal from '@/components/BillSendModal'
import BillActionModal from '@/components/BillActionModal'
import StudentDetailModal from '@/components/StudentDetailModal'
import { motion, AnimatePresence } from 'framer-motion'
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
  is_regular_tuition?: boolean
}

type BillStatus = 'unsent' | 'sent' | 'paid' | 'cancelled'

type PaymentFilter = 'all' | 'unpaid' | 'day1' | 'week1' | 'week2' | 'week3' | 'week4'

const FILTER_LABELS: Record<PaymentFilter, string> = {
  all: '전체',
  unpaid: '미납',
  day1: '1일',
  week1: '첫째주',
  week2: '둘째주',
  week3: '셋째주',
  week4: '넷째주',
}

const WEEK_KEYS: PaymentFilter[] = ['day1', 'week1', 'week2', 'week3', 'week4']

function FilterDropdownPortal({
  anchor,
  currentFilter,
  weekRanges,
  onSelect,
  onClose,
}: {
  anchor: HTMLElement
  currentFilter: PaymentFilter
  weekRanges: Record<Exclude<PaymentFilter, 'all' | 'unpaid'>, [number, number]>
  onSelect: (key: PaymentFilter) => void
  onClose: () => void
}) {
  const [show, setShow] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const r = anchor.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    requestAnimationFrame(() => setShow(true))
  }, [anchor])

  // 앵커 버튼 본체를 포탈이 덮음
  useEffect(() => {
    anchor.style.visibility = 'hidden'
    return () => { anchor.style.visibility = '' }
  }, [anchor])

  const keys: PaymentFilter[] = ['all', 'unpaid', ...WEEK_KEYS]
  const orderedKeys = [currentFilter, ...keys.filter(k => k !== currentFilter)]

  if (!rect) return null

  const ROW_H = rect.height
  const totalH = ROW_H * orderedKeys.length
  const BORDER_R = Math.round(ROW_H / 2)
  // 알약과 동일한 폭 유지 — 좌우 여백 없애기
  const OPEN_W = rect.width
  const portalLeft = rect.left
  const portalW = rect.width

  const bgFor = (key: PaymentFilter, active: boolean) => {
    if (!active) return 'bg-[var(--bg-elevated)] text-[var(--text-2)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-1)]'
    if (key === 'unpaid') return 'bg-[var(--red-dim)] text-[var(--unpaid-text)]'
    if (key === 'all') return 'bg-[var(--bg-elevated)] text-[var(--text-1)]'
    return 'bg-[var(--blue-dim)] text-[var(--blue)]'
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <motion.div
        data-filter-portal
        className="fixed z-[61] overflow-hidden shadow-xl bg-[var(--bg-elevated)]"
        initial={false}
        animate={{
          top: rect.top,
          left: portalLeft,
          width: portalW,
          height: show ? totalH : ROW_H,
          borderRadius: BORDER_R,
        }}
        transition={{
          height: { type: 'spring', stiffness: 320, damping: 32, mass: 0.6 },
          default: { type: 'spring', stiffness: 320, damping: 32, mass: 0.6 },
        }}
        role="listbox"
        aria-label="납부 필터"
      >
        {orderedKeys.map((key, i) => {
          const active = currentFilter === key
          const isWeek = (WEEK_KEYS as PaymentFilter[]).includes(key) && key !== 'day1'
          const range = isWeek ? weekRanges[key as Exclude<PaymentFilter, 'all' | 'unpaid' | 'day1'>] : null
          const rangeLabel = range && range[0] <= range[1]
            ? range[0] === range[1] ? `${range[0]}일` : `${range[0]}~${range[1]}`
            : ''
          const isCurrent = i === 0
          // 주차 행은 펼침 시 좌측 정렬 (첫글자 x좌표 통일), 비주차/현재행은 중앙 정렬
          const alignLeft = isWeek && show
          return (
            <motion.button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              role="option"
              aria-selected={active}
              className={`relative w-full flex items-center text-xs font-semibold whitespace-nowrap transition-colors ${bgFor(key, active)}`}
              animate={{
                opacity: isCurrent ? 1 : show ? 1 : 0,
                y: isCurrent ? 0 : show ? 0 : -4,
                paddingLeft: alignLeft ? 16 : 0,
                justifyContent: alignLeft ? 'flex-start' : 'center',
              }}
              transition={{
                opacity: { duration: 0.18, ease: [0.4, 0, 0.2, 1], delay: isCurrent ? 0 : show ? i * 0.025 : 0 },
                y: { type: 'spring', stiffness: 420, damping: 30, delay: isCurrent ? 0 : show ? i * 0.025 : 0 },
                paddingLeft: { type: 'spring', stiffness: 320, damping: 32, mass: 0.6 },
                justifyContent: { duration: 0 },
              }}
              style={{ height: ROW_H }}
            >
              <span>{FILTER_LABELS[key]}</span>
              <AnimatePresence initial={false}>
                {isWeek && rangeLabel && show && (
                  <motion.span
                    key="range"
                    className="text-[10px] opacity-60 ml-1"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 0.6, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}
                  >
                    {rangeLabel}
                  </motion.span>
                )}
              </AnimatePresence>
              {isCurrent && (
                <motion.div
                  className="absolute right-2 flex items-center justify-center"
                  animate={{ rotate: show ? 180 : 0 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                >
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </motion.div>
              )}
            </motion.button>
          )
        })}
      </motion.div>
    </>,
    document.body,
  )
}

export default function PaymentsPage() {
  const today = getTodayString()

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const prevMonth = getPrevMonth(selectedMonth)
  const { data: grades = [], error: gradesError, isLoading: gradesLoading } = useGrades<GradeWithClasses[]>()
  const { data: payments = [], error: paymentsError, isLoading: paymentsLoading } = usePayments<Payment[]>(selectedMonth)
  const { data: prevPayments = [] } = usePayments<Payment[]>(prevMonth)

  const loading = gradesLoading || paymentsLoading
  const error = gradesError || paymentsError

  // 인라인 납부 폼
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
const [detailStudentId, setDetailStudentId] = useState<string | null>(null)
  const [inlineDate, setInlineDate] = useState(today)
  const [inlineMethod, setInlineMethod] = useState<PaymentMethod>('payssam')
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null)
  const [inlineSubmitting, setInlineSubmitting] = useState<string | null>(null)
  const [inlineSlideOut, setInlineSlideOut] = useState<string | null>(null)
  const [showMethodPicker, setShowMethodPicker] = useState(false)
  const [inlineMemo, setInlineMemo] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const dateButtonRef = useRef<HTMLButtonElement>(null)
  const methodButtonRef = useRef<HTMLButtonElement>(null)

  // 모달
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedStudentFee, setSelectedStudentFee] = useState(0)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [selectedPrevMemo, setSelectedPrevMemo] = useState<string | null>(null)
  const [selectedPrevMethod, setSelectedPrevMethod] = useState<PaymentMethod | null>(null)

  // 스와이프
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null)
  const [swipeOpenSide, setSwipeOpenSide] = useState<'left' | 'right' | null>(null)
  const [editMemoValue, setEditMemoValue] = useState('')
  const [editMemoColor, setEditMemoColor] = useState<string | null>(null)
  const [editPayMemoValue, setEditPayMemoValue] = useState('')
  const touchRef = useRef<{
    startX: number; startY: number; currentX: number
    id: string; el: HTMLElement
    decided: boolean; isHorizontal: boolean
    baseOffset: number; wasOpen: boolean
  } | null>(null)
  const wasSwiped = useRef(false)

  // 학생 추가 모달
  const [showStudentModal, setShowStudentModal] = useState(false)
  const [addStudentClassId, setAddStudentClassId] = useState<string | null>(null)

  // 청구서 발송 모달
  const [billSendTarget, setBillSendTarget] = useState<{ studentId: string; studentName: string; phone: string; amount: number; subject: string | null } | null>(null)
  const [billActionTarget, setBillActionTarget] = useState<{ studentId: string; studentName: string; billId: string; amount: number; status: 'sent' | 'paid' | 'cancelled' } | null>(null)

  // 청구서 현황 (결제선생 발송/결제/취소 상태)
  const { data: bills = [], mutate: mutateBills } = useSWR<BillRecord[]>(
    `/api/billing?month=${selectedMonth}`,
    (url: string) => fetch(url).then(r => r.json()),
    { refreshInterval: 30000 }
  )
  const billByStudent = useMemo(() => {
    const map = new Map<string, BillRecord>()
    // 정규 원비 청구서만 고려 (비정규 결제는 결제선생 탭에서만 다룸)
    for (const b of bills) {
      if (b.is_regular_tuition === false) continue
      if (!map.has(b.student_id)) map.set(b.student_id, b)
    }
    return map
  }, [bills])
  const getBillStatus = useCallback((studentId: string): BillStatus => {
    const bill = billByStudent.get(studentId)
    if (!bill) return 'unsent'
    if (bill.status === 'paid') return 'paid'
    if (bill.status === 'cancelled' || bill.status === 'destroyed') return 'cancelled'
    return 'sent'
  }, [billByStudent])

  // ─── 청구서 일괄발송 ───────────────────────────────────────────
  const [batchSending, setBatchSending] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [cancellingBatch, setCancellingBatch] = useState(false)
  const cancelBatchRef = useRef(false)

  // 반 접기/펼치기 (기본: 접힘)
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const toggleClass = (classId: string) => {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      if (next.has(classId)) next.delete(classId); else next.add(classId)
      return next
    })
  }

  // 통합 필터 (전체/미납/1일/첫째주~넷째주)
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all')
  const [filterAnchor, setFilterAnchor] = useState<HTMLButtonElement | null>(null)
  const [monthMemo, setMonthMemo] = useState('')

  // Sun~Sat 기준 주차 범위 (billing page와 동일)
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

  // 월별 메모 로드
  useEffect(() => {
    setMonthMemo(localStorage.getItem(`payment_memo_${selectedMonth}`) ?? '')
  }, [selectedMonth])

  // 월별 메모 스크롤 연동 (스크롤 시 1줄 축소)
  const [memoScrolled, setMemoScrolled] = useState(false)
  const [memoFocused, setMemoFocused] = useState(false)
  const memoCompact = memoScrolled && !memoFocused

  // 메모 자연 높이 측정 (확장 상태에서의 target height)
  const memoSizerRef = useRef<HTMLDivElement>(null)
  const [memoNaturalH, setMemoNaturalH] = useState(82)
  useLayoutEffect(() => {
    if (!memoSizerRef.current) return
    const h = memoSizerRef.current.scrollHeight
    setMemoNaturalH(Math.min(400, Math.max(82, h)))
  }, [monthMemo])

  useEffect(() => {
    const onScroll = () => setMemoScrolled(window.scrollY > 80)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const fetchData = useCallback(() => {
    revalidateGrades()
    revalidatePayments(selectedMonth)
    revalidatePayments(prevMonth)
  }, [selectedMonth, prevMonth])

  // ─── Memoized data ────────────────────────────────────────────
  const allStudents = useMemo(() =>
    grades.flatMap(g => g.classes.flatMap(c =>
      getActiveStudents(c.students ?? [], selectedMonth).map(s => ({ ...s, class: c }))
    )), [grades, selectedMonth])

  // 과목별 → 학년별 그룹핑
  type ClassWithStudents = GradeWithClasses['classes'][number]
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

  const paymentsByStudentId = useMemo(() => {
    const map = new Map<string, Payment[]>()
    for (const p of payments) {
      const arr = map.get(p.student_id) ?? []
      arr.push(p)
      map.set(p.student_id, arr)
    }
    return map
  }, [payments])

  const prevMemoByStudentId = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const p of prevPayments) {
      if (!map.has(p.student_id)) map.set(p.student_id, p.memo || null)
    }
    return map
  }, [prevPayments])

  // ─── Helpers ──────────────────────────────────────────────────
  const navigateMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const getStudentPayments = useCallback((studentId: string) =>
    paymentsByStudentId.get(studentId) ?? []
  , [paymentsByStudentId])

  const getPrevMemo = useCallback((studentId: string): string | null =>
    prevMemoByStudentId.get(studentId) ?? null
  , [prevMemoByStudentId])

  const getDueDay = useCallback((student: Student): number =>
    student.payment_due_day ?? getPaymentDueDay(student)
  , [])

  function checkScheduled(student: Student, month: string): boolean {
    return isPaymentScheduled(student, month, student.payment_due_day ?? undefined)
  }

  // ─── 통합 필터 ──────────────────────────────────────────────
  const passesFilter = useCallback((s: Student, cls: ClassWithStudents): boolean => {
    if (paymentFilter === 'all') return true
    if (paymentFilter === 'unpaid') {
      const paid = (paymentsByStudentId.get(s.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
      const status = getPaymentStatus(paid, getStudentFee(s, cls))
      if (status === 'paid') return false
      if (status === 'unpaid' && isPaymentScheduled(s, selectedMonth, s.payment_due_day ?? undefined)) return false
      return true
    }
    // week filters
    const due = s.payment_due_day ?? getPaymentDueDay(s)
    if (!due) return false
    const [start, end] = weekRanges[paymentFilter]
    if (start > end) return false
    return due >= start && due <= end
  }, [paymentFilter, paymentsByStudentId, selectedMonth, weekRanges])

  const sendOneBill = useCallback(async (student: Student, cls: ClassWithStudents) => {
    const phone = student.parent_phone || student.phone || ''
    const fee = getStudentFee(student, cls)
    if (!phone || fee <= 0) return
    await safeMutate('/api/payssam/send', 'POST', {
      studentId: student.id,
      studentName: student.name,
      phone: phone.replace(/-/g, ''),
      amount: fee,
      productName: getRegularTuitionTitle(cls.subject, selectedMonth),
      message: REGULAR_TUITION_MESSAGE,
      billingMonth: selectedMonth,
    })
  }, [selectedMonth])

  const sendClassBatch = useCallback(async (cls: ClassWithStudents) => {
    const classStudents = getActiveStudents(cls.students ?? [], selectedMonth).filter(s => passesFilter(s, cls))
    const eligible = classStudents.filter(s => {
      const phone = s.parent_phone || s.phone || ''
      const fee = getStudentFee(s, cls)
      return phone && fee > 0 && !billByStudent.has(s.id)
    })
    if (eligible.length === 0) return

    const confirmed = window.confirm(`${cls.name} · ${eligible.length}건 청구서를 일괄 발송합니다.\n\n계속하시겠습니까?`)
    if (!confirmed) return

    cancelBatchRef.current = false
    setCancellingBatch(false)
    setBatchSending(cls.id)
    setBatchProgress({ done: 0, total: eligible.length })

    for (let i = 0; i < eligible.length; i++) {
      if (cancelBatchRef.current) break
      await sendOneBill(eligible[i], cls)
      setBatchProgress({ done: i + 1, total: eligible.length })
      if (cancelBatchRef.current) break
      if (i < eligible.length - 1) await new Promise(r => setTimeout(r, 500))
    }

    setBatchSending(null)
    setBatchProgress(null)
    setCancellingBatch(false)
    cancelBatchRef.current = false
    mutateBills()
  }, [selectedMonth, passesFilter, billByStudent, sendOneBill, mutateBills])

  const cancelBatch = useCallback(() => {
    cancelBatchRef.current = true
    setCancellingBatch(true)
  }, [])

  // ─── Visible sections (스크롤 아코디언용) ───────────────────────
  type SectionRef = { key: string; classIds: string[] }
  const visibleSections = useMemo<SectionRef[]>(() => {
    const list: SectionRef[] = []
    for (const { subject, grades: sgs } of subjectGradeGroups) {
      for (const { gradeId, classes: gcs } of sgs) {
        const classIds: string[] = []
        for (const cls of gcs) {
          const active = getActiveStudents(cls.students ?? [], selectedMonth)
          const students = active.filter(s => passesFilter(s, cls))
          if (students.length > 0) classIds.push(cls.id)
        }
        if (classIds.length === 0) continue
        list.push({ key: `${subject}__${gradeId}`, classIds })
      }
    }
    return list
  }, [subjectGradeGroups, selectedMonth, passesFilter])

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

  // 스티키 헤더 높이를 CSS 변수로 주입 → 학년 헤더가 그 아래로 스틱
  // memoCompact 전환 시 페인트 전 동기 갱신 → 학년바와 메모 사이 gap 차단
  useLayoutEffect(() => {
    const update = () => {
      const el = document.querySelector('[data-sticky-header]') as HTMLElement | null
      if (!el) return
      const h = el.getBoundingClientRect().height
      document.documentElement.style.setProperty('--grade-sticky-top', `${Math.max(0, h + 56)}px`)
    }
    update()
    const el = document.querySelector('[data-sticky-header]')
    const ro = el ? new ResizeObserver(update) : null
    if (el && ro) ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [memoCompact])

  // 학생 행 펼침 시 자동 스크롤 — 우측 아이콘(Send/Mail/수납)이 화면 밖으로 밀리지 않게
  useEffect(() => {
    if (!expandedStudentId) return
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-student-row="${expandedStudentId}"]`) as HTMLElement | null
      if (!el) return
      const rect = el.getBoundingClientRect()
      const viewportH = window.innerHeight
      const isMobile = !window.matchMedia('(min-width: 640px)').matches
      const bottomNavH = isMobile ? 80 : 0
      const desiredBottom = viewportH - bottomNavH
      const margin = 8
      if (rect.bottom > desiredBottom) {
        window.scrollBy({ top: rect.bottom - desiredBottom + margin, behavior: 'smooth' })
      }
    }, 120)
    return () => clearTimeout(timer)
  }, [expandedStudentId])

  // 펼쳐진 팬(fan) 외부 클릭 시 닫기 — 단, 날짜/결제수단 피커 포탈은 제외
  useEffect(() => {
    if (!expandedStudentId) return
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest(`[data-student-row="${expandedStudentId}"]`)) return
      // 포탈로 뜨는 피커 내부 클릭이면 무시 (피커는 자체 backdrop으로 닫힘)
      if (target.closest('[data-picker-portal]')) return
      setExpandedStudentId(null)
      setShowDatePicker(false)
      setShowMethodPicker(false)
    }
    // 팬이 열린 프레임에 즉시 닫히는 것 방지
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onPointerDown)
      document.addEventListener('touchstart', onPointerDown, { passive: true })
    }, 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [expandedStudentId])

  // ─── Swipe handlers (swipe-action-guide.md 기반) ──────────────
  const SPRING = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  const MEMO_W = 160  // 왼쪽 비고 패널 너비 (헤더: 라벨+색상테이프+저장)
  const PAY_W = 150   // 오른쪽 결제 특이사항 패널 너비 (헤더: 배지+저장)

  const openOffset = (id: string): number => {
    if (swipeOpenId !== id) return 0
    return swipeOpenSide === 'left' ? MEMO_W : swipeOpenSide === 'right' ? -PAY_W : 0
  }

  const handleTouchStart = (e: React.TouchEvent, studentId: string) => {
    if (expandedStudentId) return
    const touch = e.touches[0]
    const el = e.currentTarget as HTMLElement
    const baseOffset = openOffset(studentId)
    touchRef.current = {
      startX: touch.clientX, startY: touch.clientY, currentX: touch.clientX,
      id: studentId, el, decided: false, isHorizontal: false,
      baseOffset, wasOpen: swipeOpenId === studentId,
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchRef.current) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchRef.current.startX
    const dy = touch.clientY - touchRef.current.startY
    touchRef.current.currentX = touch.clientX

    if (!touchRef.current.decided) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        touchRef.current.decided = true
        touchRef.current.isHorizontal = Math.abs(dx) > Math.abs(dy)
      }
      return
    }
    if (!touchRef.current.isHorizontal) return

    const baseOffset = touchRef.current.baseOffset ?? 0
    let raw = baseOffset + dx

    // sqrt 감쇠 — 왼쪽 한계 -PAY_W, 오른쪽 한계 +MEMO_W
    if (raw < -PAY_W) raw = -PAY_W - Math.sqrt(Math.abs(raw + PAY_W)) * 2
    else if (raw > MEMO_W) raw = MEMO_W + Math.sqrt(raw - MEMO_W) * 2

    touchRef.current.el.style.transition = 'none'
    touchRef.current.el.style.transform = `translateX(${raw}px)`
  }

  const handleTouchEnd = () => {
    if (!touchRef.current) return
    const { el, id, isHorizontal, startX, currentX } = touchRef.current
    const dx = currentX - startX
    const baseOffset = touchRef.current.baseOffset ?? 0
    const wasOpen = touchRef.current.wasOpen
    const finalPos = baseOffset + dx

    el.style.transition = SPRING

    if (isHorizontal && Math.abs(dx) > 10) {
      wasSwiped.current = true
      setTimeout(() => { wasSwiped.current = false }, 200)
    }

    const snapClosed = () => {
      el.style.transform = 'translateX(0)'
      setSwipeOpenId(null)
      setSwipeOpenSide(null)
    }

    if (!isHorizontal) {
      el.style.transform = wasOpen ? `translateX(${baseOffset}px)` : 'translateX(0)'
      touchRef.current = null
      return
    }

    // 열린 상태에서 닫기 — 중심 근처로 돌아오면 닫기
    if (wasOpen && Math.abs(finalPos) < 60) {
      snapClosed()
      touchRef.current = null
      return
    }

    // 우로 밀기 → 왼쪽 패널(비고) 열기
    if (!wasOpen && dx > 60) {
      if (swipeOpenId && swipeOpenId !== id) {
        const prevEl = document.querySelector(`[data-swipe-row="${swipeOpenId}"]`) as HTMLElement | null
        if (prevEl) { prevEl.style.transition = SPRING; prevEl.style.transform = 'translateX(0)' }
      }
      el.style.transform = `translateX(${MEMO_W}px)`
      const student = allStudents.find(s => s.id === id)
      if (student) {
        setSwipeOpenId(id)
        setSwipeOpenSide('left')
        setEditMemoValue(student.memo ?? '')
        setEditMemoColor(student.memo_color ?? null)
      }
    }
    // 좌로 밀기 → 오른쪽 패널(결제 특이사항) 열기
    else if (!wasOpen && dx < -60) {
      if (swipeOpenId && swipeOpenId !== id) {
        const prevEl = document.querySelector(`[data-swipe-row="${swipeOpenId}"]`) as HTMLElement | null
        if (prevEl) { prevEl.style.transition = SPRING; prevEl.style.transform = 'translateX(0)' }
      }
      el.style.transform = `translateX(-${PAY_W}px)`
      setSwipeOpenId(id)
      setSwipeOpenSide('right')
      const sp = paymentsByStudentId.get(id) ?? []
      const { cleanMemo } = decodePaymentMemo(sp[0]?.memo)
      setEditPayMemoValue(cleanMemo ?? '')
    }
    // 임계값 미달 → 원위치
    else {
      el.style.transform = wasOpen ? `translateX(${baseOffset}px)` : 'translateX(0)'
    }

    touchRef.current = null
  }

  const closeSwipeEdit = () => {
    if (swipeOpenId) {
      const el = document.querySelector(`[data-swipe-row="${swipeOpenId}"]`) as HTMLElement | null
      if (el) { el.style.transition = SPRING; el.style.transform = 'translateX(0)' }
      setSwipeOpenId(null)
      setSwipeOpenSide(null)
    }
  }

  const handleSaveMemo = async (studentId: string) => {
    const memo = editMemoValue.trim() || null
    const { error } = await safeMutate(`/api/students/${studentId}`, 'PUT', { memo, memo_color: editMemoColor })
    if (error) { alert('저장 실패'); return }
    closeSwipeEdit()
    await fetchData()
  }

  const handleSavePayMemo = async (studentId: string) => {
    const sp = paymentsByStudentId.get(studentId) ?? []
    const payment = sp[0]
    if (!payment) { alert('이번 달 납부 기록이 없어 결제 특이사항을 저장할 수 없습니다'); return }
    const memo = editPayMemoValue.trim() || null
    const { error } = await safeMutate(`/api/payments/${payment.id}`, 'PUT', { memo })
    if (error) { alert('저장 실패'); return }
    closeSwipeEdit()
    await fetchData()
  }

  // ─── Inline payment ──────────────────────────────────────────
  const handleExpand = (studentId: string) => {
    if (wasSwiped.current) return
    closeSwipeEdit()
    if (expandedStudentId === studentId) { setExpandedStudentId(null); return }
    setExpandedStudentId(studentId)
    setInlineDate(today)
    const prevPayment = prevPayments.find(p => p.student_id === studentId)
    setInlineMethod(prevPayment?.method as PaymentMethod || 'payssam')
    setShowMethodPicker(false)
    setShowDatePicker(false)
    setInlineMemo('')
  }

  const handleInlineSubmit = async (studentId: string, fee: number) => {
    if (inlineSuccess || inlineSubmitting) return
    setInlineSubmitting(studentId)
    const { error } = await safeMutate('/api/payments', 'POST', {
      student_id: studentId, amount: fee, method: inlineMethod,
      payment_date: inlineDate, billing_month: selectedMonth,
      ...(inlineMemo.trim() ? { memo: inlineMemo.trim() } : {}),
    })
    setInlineSubmitting(null)
    if (error) {
      alert(`결제 처리 실패: ${error}`)
      return
    }
    setInlineSuccess(studentId)
    // 체크 표시 후 우측으로 슬라이드하며 접힘
    setTimeout(() => {
      setInlineSlideOut(studentId)
    }, 400)
    setTimeout(async () => {
      await fetchData()
      setInlineSuccess(null)
      setInlineSlideOut(null)
      setExpandedStudentId(null)
    }, 1000)
  }

  // ─── Modal handlers ───────────────────────────────────────────
  const handleOpenModal = (studentId: string, fee: number) => {
    if (wasSwiped.current) return
    const existing = payments.find(p => p.student_id === studentId)
    setSelectedStudentId(studentId)
    setSelectedStudentFee(fee)
    setSelectedPayment(existing || null)
    setSelectedPrevMemo(getPrevMemo(studentId))
    const prevPayment = prevPayments.find(p => p.student_id === studentId)
    setSelectedPrevMethod(prevPayment?.method as PaymentMethod || null)
    setShowPaymentModal(true)
  }

  const handleSavePayment = async (data: Partial<Payment>) => {
    const { error } = await safeMutate('/api/payments', 'POST', data)
    if (error) { alert(`납부 저장 실패: ${error}`); return }
    fetchData()
  }

  const handleUpdatePayment = async (paymentId: string, data: Partial<Payment>) => {
    const { error } = await safeMutate(`/api/payments/${paymentId}`, 'PUT', data)
    if (error) { alert(`수정 실패: ${error}`); return }
    fetchData()
  }

  const handleDeletePayment = async (paymentId: string) => {
    const { error } = await safeMutate(`/api/payments/${paymentId}`, 'DELETE')
    if (error) { alert(`삭제 실패: ${error}`); return }
    setShowPaymentModal(false)
    setSelectedPayment(null)
    fetchData()
  }

  // ─── Pull-to-refresh ──────────────────────────────────────
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const pullRef = useRef<{ startY: number; pulling: boolean } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const PULL_THRESHOLD = 60

  const handlePullStart = useCallback((e: TouchEvent) => {
    if (isRefreshing) return
    // 스크롤이 최상단일 때만 pull-to-refresh 시작
    const scrollTop = window.scrollY || document.documentElement.scrollTop
    if (scrollTop > 0) return
    pullRef.current = { startY: e.touches[0].clientY, pulling: false }
  }, [isRefreshing])

  const handlePullMove = useCallback((e: TouchEvent) => {
    if (!pullRef.current || isRefreshing) return
    const dy = e.touches[0].clientY - pullRef.current.startY
    if (dy > 0) {
      pullRef.current.pulling = true
      // 감속 효과 (당길수록 저항 증가)
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
      setPullDistance(40) // 새로고침 중 표시 위치
      await fetchData()
      // 약간의 딜레이로 새로고침 느낌
      await new Promise(r => setTimeout(r, 500))
      setIsRefreshing(false)
    }
    setPullDistance(0)
  }, [pullDistance, isRefreshing, fetchData])

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

  // ─── Student add ────────────────────────────────────────────
  const handleAddStudent = (classId: string) => {
    setAddStudentClassId(classId)
    setShowStudentModal(true)
  }

  const handleSaveStudent = async (data: Partial<Student>) => {
    const { error } = await safeMutate('/api/students', 'POST', data)
    if (error) { alert(`학생 등록 실패: ${error}`); return }
    setShowStudentModal(false)
    fetchData()
  }

  // ─── Render ───────────────────────────────────────────────────
  if (loading) return <PaymentsSkeleton />

  if (error) return (
    <div className="text-center py-12">
      <p className="text-[var(--red)] mb-4">{error?.message || '데이터 로딩 실패'}</p>
      <button onClick={fetchData} className="px-4 py-2 bg-[var(--blue)] text-white rounded-lg hover:opacity-90">다시 시도</button>
    </div>
  )

  return (
    <div ref={containerRef} onClick={() => { if (swipeOpenId) closeSwipeEdit() }}>
      {/* 월 네비게이션 — 스크롤하면 사라짐 */}
      <div className="-mx-4 px-4 pt-3 pb-1 -mt-6">
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
        <div className="flex justify-center">
          <button
            onClick={() => {
              const a = document.createElement('a')
              a.href = `/api/payments/export?billing_month=${selectedMonth}`
              a.download = ''
              a.click()
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-[var(--text-4)] hover:text-[var(--text-3)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <Download className="w-3 h-3" />
            <span>내보내기</span>
          </button>
        </div>

      </div>

      {/* 월별 메모 — sticky. 축소 시 1줄 프리뷰가 textarea를 가려 2번째 줄 흘러보임 방지 */}
      <div data-sticky-header className="sticky top-14 z-30 bg-[var(--bg)] -mx-4 px-4 pt-2 pb-2">
        <motion.div
          animate={{ height: memoCompact ? 38 : memoNaturalH }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-xl bg-[var(--bg-elevated)]"
        >
          <motion.textarea
            value={monthMemo}
            onChange={e => {
              setMonthMemo(e.target.value)
              localStorage.setItem(`payment_memo_${selectedMonth}`, e.target.value)
            }}
            onFocus={() => setMemoFocused(true)}
            onBlur={() => setMemoFocused(false)}
            placeholder="메모..."
            animate={{ opacity: memoCompact ? 0 : 1 }}
            transition={{ duration: memoCompact ? 0.12 : 0.35, ease: 'easeOut', delay: memoCompact ? 0 : 0.15 }}
            className="absolute inset-0 w-full h-full resize-none bg-transparent rounded-xl px-3 py-2 text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)] leading-[22px] overflow-y-auto"
          />
          {/* compact 프리뷰 — 1줄로 고정, 2번째 줄 가림막 역할 */}
          <motion.div
            aria-hidden
            animate={{ opacity: memoCompact ? 1 : 0 }}
            transition={{ duration: memoCompact ? 0.2 : 0.12, ease: 'easeOut', delay: memoCompact ? 0.05 : 0 }}
            className="absolute inset-0 px-3 py-2 text-sm leading-[22px] text-[var(--text-1)] whitespace-nowrap overflow-hidden bg-[var(--bg-elevated)] pointer-events-none"
          >
            {monthMemo ? monthMemo.split('\n')[0] : <span className="text-[var(--text-4)]">메모...</span>}
          </motion.div>
          {/* 숨겨진 sizer — 자연 높이 측정용 */}
          <div
            ref={memoSizerRef}
            aria-hidden
            className="absolute inset-0 invisible pointer-events-none whitespace-pre-wrap break-words px-3 py-2 text-sm leading-[22px]"
          >
            {monthMemo + '\n'}
          </div>
        </motion.div>
      </div>

      {/* 과목별 → 학년별 납부 현황 */}
      {subjectGradeGroups.map(({ subject, grades: subjectGrades }) => {
        // 과목 전체에 표시할 학생이 있는지 확인
        const hasVisibleStudents = subjectGrades.some(({ classes: gradeClasses }) =>
          gradeClasses.some(cls => {
            const students = getActiveStudents(cls.students ?? [], selectedMonth).filter(s => passesFilter(s, cls))
            return students.length > 0
          })
        )
        if (!hasVisibleStudents) return null

        return (
          <div key={subject} className="mb-6">
            <div className="flex items-center mb-2 px-1">
              <h2 className="text-sm font-semibold text-[var(--text-3)]">{subject}</h2>
              <div className="flex-1" />
            </div>
            <div className="space-y-2">
            {subjectGrades.map(({ gradeId, gradeName, classes: gradeClasses }) => {
              // 이 학년에 표시할 학생이 있는지
              const hasGradeStudents = gradeClasses.some(cls => {
                const students = getActiveStudents(cls.students ?? [], selectedMonth).filter(s => passesFilter(s, cls))
                return students.length > 0
              })
              if (!hasGradeStudents) return null

              const gradeClassIds = gradeClasses.map(c => c.id)
              const isGradeExpanded = gradeClassIds.every(id => expandedClasses.has(id))

              const toggleGradeExpand = () => {
                setExpandedClasses(prev => {
                  const next = new Set(prev)
                  if (isGradeExpanded) gradeClassIds.forEach(id => next.delete(id))
                  else gradeClassIds.forEach(id => next.add(id))
                  return next
                })
              }

              const isFirstGrade = visibleSections[0]?.key === `${subject}__${gradeId}`

              return (
                <div key={gradeId} data-section-key={`${subject}__${gradeId}`}>
                  <div
                    className="sticky z-20 bg-[var(--bg)] -mx-4 px-5 pt-1.5 pb-1.5 mb-1 flex items-center justify-between gap-3"
                    style={{ top: 'var(--grade-sticky-top, 140px)' }}
                  >
                    <button
                      onClick={toggleGradeExpand}
                      className="flex items-center gap-1 active:opacity-70"
                    >
                      <motion.div animate={{ rotate: isGradeExpanded ? 90 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
                        <ChevronRight className="w-4 h-4 text-[var(--text-3)]" />
                      </motion.div>
                      <span className="text-[15px] font-bold text-[var(--text-1)] tracking-tight">{gradeName}</span>
                    </button>
                    {isFirstGrade && (
                      <button
                        onClick={(e) => setFilterAnchor(prev => prev === e.currentTarget ? null : e.currentTarget)}
                        style={{ width: 112 }}
                        className={`relative flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold transition-colors shadow-sm ${
                          paymentFilter === 'unpaid'
                            ? 'bg-[var(--red-dim)] text-[var(--unpaid-text)]'
                            : paymentFilter !== 'all'
                              ? 'bg-[var(--blue-dim)] text-[var(--blue)]'
                              : 'bg-[var(--bg-elevated)] text-[var(--text-2)] hover:bg-[var(--bg-card-hover)]'
                        }`}
                      >
                        <span>{FILTER_LABELS[paymentFilter]}</span>
                        <ChevronDown className={`absolute right-2 w-3 h-3 opacity-60 transition-transform ${filterAnchor ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                  <div className="card overflow-hidden">
                  {gradeClasses.map(cls => {
                const allClassStudents = getActiveStudents(cls.students ?? [], selectedMonth)
                let students = allClassStudents.filter(s => passesFilter(s, cls))
                // 결제일 오름차순 정렬
                students = [...students].sort((a, b) => getDueDay(a) - getDueDay(b))

                if (students.length === 0) return null

                const paidCount = students.filter(s => {
                  const paid = (paymentsByStudentId.get(s.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
                  return getPaymentStatus(paid, getStudentFee(s, cls)) === 'paid'
                }).length
                const isClassExpanded = expandedClasses.has(cls.id)

                return (
                  <div key={cls.id}>
                    <div
                      className="px-4 py-2.5 bg-[var(--bg-card-hover)]/70 border-b border-[var(--border)] flex items-center cursor-pointer active:bg-[var(--bg-elevated)] select-none"
                      onClick={() => toggleClass(cls.id)}
                    >
                      <span className="text-sm font-medium text-[var(--text-3)]">{cls.name}</span>
                      <span className="text-xs text-[var(--text-4)] ml-1">{cls.monthly_fee > 0 ? `${cls.monthly_fee.toLocaleString()}원` : ''}</span>
                      <span className="text-xs text-[var(--text-4)] ml-2">{paidCount}/{students.length}</span>
                      <span className="flex-1" />
                      {(() => {
                        const eligibleCount = students.filter(s => {
                          const phone = s.parent_phone || s.phone || ''
                          const fee = getStudentFee(s, cls)
                          return phone && fee > 0 && !billByStudent.has(s.id)
                        }).length
                        const isBatchSending = batchSending === cls.id
                        if (isBatchSending && batchProgress) {
                          return (
                            <div className="flex items-center gap-1.5 mr-1" onClick={e => e.stopPropagation()}>
                              <Loader2 className="w-3 h-3 animate-spin text-[var(--orange)]" />
                              <span className="text-[10px] font-bold text-[var(--orange)] tabular-nums">{batchProgress.done}/{batchProgress.total}</span>
                              <button
                                onClick={cancelBatch}
                                disabled={cancellingBatch}
                                className="px-1.5 py-0.5 rounded-md bg-[var(--red-dim)] text-[var(--red)] text-[10px] font-bold hover:opacity-80 disabled:opacity-50"
                              >
                                {cancellingBatch ? '중단중' : '중단'}
                              </button>
                            </div>
                          )
                        }
                        if (eligibleCount === 0) return null
                        const isAllFilter = paymentFilter === 'all'
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (isAllFilter) {
                                alert('결제일을 선택해주세요! 전체 상태에서는 일괄 발송이 불가합니다.')
                                return
                              }
                              sendClassBatch(cls)
                            }}
                            disabled={!!batchSending}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mr-1 ${
                              isAllFilter
                                ? 'bg-[var(--bg-elevated)] text-[var(--text-4)] opacity-60 cursor-not-allowed'
                                : 'bg-[var(--orange-dim)] text-[var(--orange)] hover:opacity-80 disabled:opacity-40'
                            }`}
                            aria-label={`${cls.name} 일괄 청구서 발송`}
                            title={isAllFilter ? '결제일을 선택하세요' : `미발송 ${eligibleCount}명 일괄 발송`}
                          >
                            <Send className="w-3 h-3" />
                            <span>일괄 {eligibleCount}</span>
                          </button>
                        )
                      })()}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAddStudent(cls.id) }}
                        className="p-0.5 text-[var(--text-4)] hover:text-[var(--blue)] transition-colors"
                        aria-label={`${cls.name}에 학생 추가`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
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
                    {students.map((student) => {
                      const fee = getStudentFee(student, cls)
                      const studentPayments = getStudentPayments(student.id)
                      const paid = studentPayments.reduce((s, p) => s + p.amount, 0)
                      const status = getPaymentStatus(paid, fee)
                      const scheduled = status === 'unpaid' && checkScheduled(student, selectedMonth)
                      const displayColors = scheduled ? { bg: 'var(--scheduled-bg)', text: 'var(--scheduled-text)' } : PAYMENT_STATUS_COLORS[status]
                      let displayLabel = ''
                      if (status === 'unpaid') {
                        displayLabel = getUnpaidLabelText(student, selectedMonth, student.payment_due_day ?? undefined)
                      } else if (studentPayments.length > 0) {
                        const pDate = new Date(studentPayments[0].payment_date)
                        displayLabel = `${pDate.getMonth() + 1}/${pDate.getDate()} 납부`
                      } else {
                        displayLabel = PAYMENT_STATUS_LABELS[status]
                      }
                      const prevMemo = getPrevMemo(student.id)
                      const currentMemo = studentPayments[0]?.memo
                      const isExpanded = expandedStudentId === student.id && status === 'unpaid'
                      const isSuccess = inlineSuccess === student.id
                      const isSubmitting = inlineSubmitting === student.id
                      const { cleanMemo } = decodePaymentMemo(currentMemo)
                      const hasMemo = !!(prevMemo || cleanMemo)
                      const isSwipeOpen = swipeOpenId === student.id
                      const openSide = isSwipeOpen ? swipeOpenSide : null
                      const memoColor = student.memo_color ?? null
                      const memoHighlight = memoColor === 'yellow' ? 'bg-[var(--orange-dim)] text-[var(--orange)] px-1.5 py-0.5 rounded-full font-bold'
                        : memoColor === 'green' ? 'bg-[var(--paid-bg)] text-[var(--paid-text)] px-1.5 py-0.5 rounded-full font-bold'
                        : memoColor === 'red' ? 'bg-[var(--unpaid-bg)] text-[var(--unpaid-text)] px-1.5 py-0.5 rounded-full font-bold'
                        : 'text-[var(--text-3)]'
                      const withdrawn = isWithdrawnStudent(student)

                      return (
                        <div key={student.id} data-student-row={student.id} className="relative">
                          {/* 위층: 행 높이 (좌/우 패널 헤더 + 메인 콘텐츠) */}
                          <div className="relative overflow-hidden">
                            {/* 왼쪽 패널 헤더 — 비고 라벨 + 색상 테이프 + 저장 */}
                            <div data-edit-panel className="absolute inset-y-0 left-0 w-[160px] flex items-center gap-1.5 px-2 bg-[var(--bg-elevated)]" onClick={e => e.stopPropagation()}>
                              <span className="text-[10px] font-bold text-[var(--text-3)] shrink-0">비고</span>
                              <div className="flex items-center gap-1 shrink-0">
                                {(['yellow', 'green', 'red'] as const).map(c => {
                                  const bg = c === 'yellow' ? 'bg-[var(--orange-dim)]' : c === 'green' ? 'bg-[var(--paid-bg)]' : 'bg-[var(--unpaid-bg)]'
                                  const active = editMemoColor === c
                                  return (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => setEditMemoColor(active ? null : c)}
                                      className={`w-6 h-3 rounded-[2px] ${bg} ${active ? 'ring-1 ring-white/70 shadow-md' : 'opacity-60'}`}
                                      style={{ transform: 'skewX(-10deg)' }}
                                      aria-label={`색상 ${c}`}
                                    />
                                  )
                                })}
                              </div>
                              <button onClick={() => handleSaveMemo(student.id)} className="ml-auto p-1.5 bg-[var(--blue)] hover:opacity-80 text-white rounded-full shrink-0 shadow-sm transition-opacity" aria-label="저장">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* 오른쪽 패널 헤더 — "결제특이사항" 배지 + 저장 */}
                            <div data-edit-panel className="absolute inset-y-0 right-0 w-[150px] flex items-center justify-between gap-1.5 px-2 bg-[var(--bg-elevated)]" onClick={e => e.stopPropagation()}>
                              <span className="text-[10px] font-bold text-[var(--orange)] px-2 py-0.5 rounded-full bg-[var(--orange-dim)] shrink-0">결제특이사항</span>
                              <button onClick={() => handleSavePayMemo(student.id)} className="p-1.5 bg-[var(--blue)] hover:opacity-80 text-white rounded-full shrink-0 shadow-sm transition-opacity" aria-label="저장">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* 메인 콘텐츠 */}
                            <div
                              data-swipe-row={student.id}
                              className="relative bg-[var(--bg-card)] z-10"
                              onTouchStart={e => handleTouchStart(e, student.id)}
                              onTouchMove={handleTouchMove}
                              onTouchEnd={handleTouchEnd}
                              style={isSwipeOpen ? { transform: `translateX(${openSide === 'left' ? MEMO_W : -PAY_W}px)`, transition: SPRING } : undefined}
                            >
                            <div className={`flex items-center gap-2 px-4 ${hasMemo && !isExpanded ? 'pt-1.5 pb-0.5' : 'py-1.5'} ${
                              status === 'unpaid' && !isExpanded && !withdrawn ? 'cursor-pointer active:bg-[var(--bg-card-hover)]' : ''
                            } ${withdrawn ? 'opacity-60' : ''}`}
                              onClick={status === 'unpaid' && !isExpanded && !withdrawn ? () => handleExpand(student.id) : undefined}
                            >
                              <button
                                type="button"
                                className="flex-1 min-w-0 text-left"
                                onClick={e => {
                                  e.stopPropagation()
                                  if (wasSwiped.current) return
                                  setDetailStudentId(student.id)
                                }}
                              >
                                <span className={`text-sm font-medium ${withdrawn ? 'line-through decoration-red-500 decoration-2 text-[var(--text-4)]' : ''}`}>{student.name}</span>
                                {!withdrawn && !student.parent_phone && (
                                  <span className="text-[9px] ml-1 px-1 py-0.5 rounded-full bg-[var(--orange-dim)] text-[var(--orange)] font-bold" title="보호자 연락처 미등록">📵</span>
                                )}
                                {withdrawn && student.withdrawal_date && (() => {
                                  const d = new Date(student.withdrawal_date)
                                  return <span className="text-[10px] text-[var(--red)] ml-1.5">퇴원 {d.getMonth() + 1}/{d.getDate()}</span>
                                })()}
                                {!withdrawn && student.enrollment_date?.startsWith(selectedMonth) && (
                                  <span className="text-[9px] ml-1.5 px-1.5 py-0.5 rounded-full bg-[var(--blue-bg)] text-[var(--blue)] font-bold">신규</span>
                                )}
                                <AnimatePresence initial={false}>
                                  {student.memo && (
                                    <motion.div
                                      key="memo"
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                                      style={{ overflow: 'hidden' }}
                                    >
                                      <p className="text-[11px] font-medium leading-tight mt-0.5">
                                        <span className={memoHighlight}>{student.memo}</span>
                                      </p>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </button>

                              {isExpanded ? (
                                <div
                                  className="flex flex-col items-end gap-1 transition-all duration-500 ease-in-out"
                                  style={inlineSlideOut === student.id ? { transform: 'translateX(100px)', opacity: 0 } : undefined}
                                  onClick={e => e.stopPropagation()}
                                >
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      ref={dateButtonRef}
                                      type="button"
                                      onClick={() => {
                                        setShowDatePicker(!showDatePicker)
                                        setShowMethodPicker(false)
                                      }}
                                      className="fan-item px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--orange-dim)] text-[var(--orange)] whitespace-nowrap"
                                      aria-label="결제일 선택"
                                    >
                                      {(() => { const d = new Date(inlineDate); return `${d.getMonth()+1}/${d.getDate()}` })()}
                                      <span className="text-[9px] opacity-50 ml-0.5">▼</span>
                                    </button>
                                    <button
                                      ref={methodButtonRef}
                                      type="button"
                                      onClick={() => {
                                        setShowMethodPicker(!showMethodPicker)
                                        setShowDatePicker(false)
                                      }}
                                      className="fan-item px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--blue-dim)] text-[var(--blue)] whitespace-nowrap"
                                      aria-label="결제수단 선택"
                                    >
                                      {METHOD_OPTIONS_SHORT.find(([v]) => v === inlineMethod)?.[1]}
                                    </button>
                                    <button
                                      onClick={() => handleInlineSubmit(student.id, fee)}
                                      disabled={!!inlineSuccess || !!inlineSubmitting}
                                      className={`fan-item px-2.5 py-0.5 rounded-full text-xs font-medium transition-all duration-300 ${
                                        isSuccess ? 'bg-[var(--green)] text-white scale-110' : isSubmitting ? 'bg-[var(--green)] text-white opacity-60 scale-100' : 'bg-[var(--green-dim)] text-[var(--paid-text)] hover:opacity-80'
                                      }`}
                                      aria-label="납부 처리"
                                    >
                                      {isSuccess ? (
                                        <Check className="w-3.5 h-3.5 animate-[checkBounce_0.3s_ease-out]" strokeWidth={3} />
                                      ) : isSubmitting ? (
                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                      ) : '납부'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        const parentPhone = student.parent_phone || student.phone || ''
                                        setBillSendTarget({ studentId: student.id, studentName: student.name, phone: parentPhone, amount: fee, subject: cls.subject ?? null })
                                      }}
                                      className="fan-item p-1 text-[var(--orange)] hover:opacity-70"
                                      aria-label="청구서 발송"
                                      title="카톡 청구서 발송"
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleOpenModal(student.id, fee)}
                                      className="fan-item p-1 text-[var(--blue)] hover:opacity-70"
                                      aria-label="상세 납부 기록"
                                    >
                                      <ClipboardList className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={inlineMemo}
                                    onChange={e => setInlineMemo(e.target.value)}
                                    placeholder="비고"
                                    className="fan-item w-full px-2.5 py-1 rounded-lg text-xs border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)] placeholder-[var(--text-4)]"
                                    aria-label="비고 입력"
                                  />
                                </div>
                              ) : (
                                <>
                                  {studentPayments.length > 0 && status !== 'unpaid' && (() => {
                                    const p = studentPayments[0]
                                    const { otherMethod } = decodePaymentMemo(p.memo)
                                    const methodLabel = otherMethod || PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS]
                                    return (
                                      <span className="text-[10px] text-[var(--text-4)] whitespace-nowrap">
                                        {parseInt(selectedMonth.split('-')[1])}/{getDueDay(student)} {methodLabel}
                                      </span>
                                    )
                                  })()}
                                  {status !== 'unpaid' ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleOpenModal(student.id, fee) }}
                                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity"
                                      style={{ backgroundColor: displayColors.bg, color: displayColors.text }}
                                      role="status"
                                    >
                                      {displayLabel}
                                    </button>
                                  ) : (
                                    <span
                                      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                                      style={{ backgroundColor: displayColors.bg, color: displayColors.text }}
                                      role="status"
                                    >
                                      {displayLabel}
                                    </span>
                                  )}
                                  {!withdrawn && (() => {
                                    // 납부 완료 → 결제수단별 아이콘 (배경 전부 파란색으로 통일, 심볼만 다르게)
                                    if (status === 'paid' && studentPayments.length > 0) {
                                      const method = studentPayments[0].method
                                      const bill = billByStudent.get(student.id)
                                      const methodSymbol: Record<string, { Icon: typeof Check; rotate?: number; title: string }> = {
                                        payssam:  { Icon: Send,          rotate: 180, title: '결제선생 완료 — 탭하여 취소' },
                                        card:     { Icon: CreditCard,                 title: '카드결제 — 탭하여 편집' },
                                        cash:     { Icon: Banknote,                   title: '현금결제 — 탭하여 편집' },
                                        transfer: { Icon: ArrowLeftRight,             title: '계좌이체 — 탭하여 편집' },
                                      }
                                      const s = methodSymbol[method] ?? { Icon: Check, title: '납부 완료 — 탭하여 편집' }
                                      const IconComp = s.Icon
                                      return (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (method === 'payssam' && bill?.status === 'paid') {
                                              setBillActionTarget({
                                                studentId: student.id,
                                                studentName: student.name,
                                                billId: bill.bill_id,
                                                amount: bill.amount,
                                                status: 'paid',
                                              })
                                            } else {
                                              handleOpenModal(student.id, fee)
                                            }
                                          }}
                                          className="p-1 rounded-lg transition-colors shrink-0 hover:opacity-80 flex items-center justify-center"
                                          style={{ color: 'var(--blue)', background: 'var(--blue-dim)' }}
                                          aria-label={s.title}
                                          title={s.title}
                                        >
                                          <IconComp className="w-3.5 h-3.5" style={s.rotate ? { transform: `rotate(${s.rotate}deg)` } : undefined} />
                                        </button>
                                      )
                                    }

                                    // 미납/부분납 → 결제선생 발송/파기 플로우 (전화번호 있을 때만)
                                    if (!(student.parent_phone || student.phone)) return null
                                    const billStatus = getBillStatus(student.id)
                                    const bill = billByStudent.get(student.id)
                                    const styles: Record<BillStatus, { fg: string; bg: string; title: string }> = {
                                      unsent:    { fg: 'var(--text-4)', bg: 'var(--bg-elevated)', title: '카톡 청구서 발송' },
                                      sent:      { fg: 'var(--orange)', bg: 'var(--orange-dim)',  title: '발송됨 — 탭하여 파기' },
                                      paid:      { fg: 'white',         bg: 'var(--blue)',        title: '수납 완료 — 탭하여 취소' },
                                      cancelled: { fg: 'var(--red)',    bg: 'var(--red-dim)',     title: '취소됨 — 탭하여 재발송' },
                                    }
                                    const s = styles[billStatus]
                                    return (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if ((billStatus === 'sent' || billStatus === 'paid') && bill) {
                                            setBillActionTarget({
                                              studentId: student.id,
                                              studentName: student.name,
                                              billId: bill.bill_id,
                                              amount: bill.amount,
                                              status: billStatus,
                                            })
                                          } else {
                                            const parentPhone = student.parent_phone || student.phone || ''
                                            setBillSendTarget({ studentId: student.id, studentName: student.name, phone: parentPhone, amount: fee, subject: cls.subject ?? null })
                                          }
                                        }}
                                        className="p-1 rounded-lg transition-colors shrink-0 hover:opacity-80 flex items-center justify-center"
                                        style={{ color: s.fg, background: s.bg }}
                                        aria-label={s.title}
                                        title={s.title}
                                      >
                                        {billStatus === 'sent' ? (
                                          <Mail className="w-3.5 h-3.5" />
                                        ) : (
                                          <Send className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    )
                                  })()}
                                </>
                              )}
                            </div>
                            {!isExpanded && hasMemo && (
                              <div className="flex justify-end px-4 pb-1">
                                <div className="text-right">
                                  {cleanMemo && <p className="text-[11px] text-[var(--text-3)] leading-tight">{cleanMemo}</p>}
                                  {prevMemo && <p className="text-[11px] text-[var(--text-4)] leading-tight">지난달: {prevMemo}</p>}
                                </div>
                              </div>
                            )}
                            </div>
                          </div>
                          {/* 아래층: 입력 공간 (스와이프 열렸을 때만) */}
                          {isSwipeOpen && openSide === 'left' && (
                            <div className="px-3 py-2 bg-[var(--bg-elevated)] border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
                              <textarea
                                value={editMemoValue}
                                onChange={e => setEditMemoValue(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSaveMemo(student.id) }
                                }}
                                placeholder="비고 내용 (⌘Enter 저장)"
                                rows={3}
                                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-card)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)] resize-none leading-relaxed"
                              />
                            </div>
                          )}
                          {isSwipeOpen && openSide === 'right' && (
                            <div className="px-3 py-2 bg-[var(--bg-elevated)] border-t border-[var(--border)]" onClick={e => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editPayMemoValue}
                                onChange={e => setEditPayMemoValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSavePayMemo(student.id) }}
                                placeholder="결제 특이사항"
                                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-card)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
                              />
                            </div>
                          )}
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

      {allStudents.length === 0 && (
        <div className="text-center py-12 text-[var(--text-4)]">등록된 학생이 없습니다</div>
      )}

      {showPaymentModal && selectedStudentId && (
        <PaymentModal
          payment={selectedPayment}
          studentId={selectedStudentId}
          defaultBillingMonth={selectedMonth}
          defaultAmount={selectedStudentFee}
          prevMemo={selectedPrevMemo}
          prevMethod={selectedPrevMethod}
          onSave={handleSavePayment}
          onUpdate={handleUpdatePayment}
          onDelete={handleDeletePayment}
          onClose={() => { setShowPaymentModal(false); setSelectedPayment(null); setExpandedStudentId(null) }}
        />
      )}


      {showStudentModal && (
        <StudentModal
          grades={grades}
          defaultClassId={addStudentClassId}
          onSave={handleSaveStudent}
          onClose={() => setShowStudentModal(false)}
        />
      )}

      {billSendTarget && (
        <BillSendModal
          studentId={billSendTarget.studentId}
          studentName={billSendTarget.studentName}
          phone={billSendTarget.phone}
          amount={billSendTarget.amount}
          subject={billSendTarget.subject}
          billingMonth={selectedMonth}
          onClose={() => setBillSendTarget(null)}
          onSuccess={() => { fetchData(); mutateBills() }}
        />
      )}

      {detailStudentId && (
        <StudentDetailModal
          studentId={detailStudentId}
          onClose={() => setDetailStudentId(null)}
          onChange={fetchData}
        />
      )}

      {billActionTarget && (
        <BillActionModal
          studentName={billActionTarget.studentName}
          billId={billActionTarget.billId}
          amount={billActionTarget.amount}
          status={billActionTarget.status}
          onClose={() => setBillActionTarget(null)}
          onSuccess={() => { fetchData(); mutateBills() }}
        />
      )}

      {showDatePicker && (
        <DatePickerPopup
          inlineDate={inlineDate}
          onDateChange={setInlineDate}
          onClose={() => setShowDatePicker(false)}
          anchorRef={dateButtonRef}
        />
      )}

      {showMethodPicker && (
        <MethodPickerPopup
          currentMethod={inlineMethod}
          onMethodChange={setInlineMethod}
          onClose={() => setShowMethodPicker(false)}
          anchorRef={methodButtonRef}
        />
      )}

      {/* 필터 드롭다운 — 단일 포탈, 업로더식 텍스트 필 + 스태거 애니메이션 */}
      {filterAnchor && <FilterDropdownPortal
        anchor={filterAnchor}
        currentFilter={paymentFilter}
        weekRanges={weekRanges}
        onSelect={(key) => { setPaymentFilter(key); setFilterAnchor(null) }}
        onClose={() => setFilterAnchor(null)}
      />}
    </div>
  )
}
