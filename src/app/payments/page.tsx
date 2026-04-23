'use client'

import { toast } from 'sonner'
import { useState, useCallback, useRef, useMemo, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Check, ChevronDown, ClipboardList, Download, Plus, Send, Mail, Loader2, CreditCard, Banknote, ArrowLeftRight, X, Clock } from 'lucide-react'
import type { Student, Payment, PaymentMethod, GradeWithClasses } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS, parseClassDays, DAY_LABELS } from '@/types'
import PaymentModal from '@/components/PaymentModal'
import StudentModal from '@/components/StudentModal'
import DatePickerPopup from '@/components/payments/DatePickerPopup'
import MethodPickerPopup from '@/components/payments/MethodPickerPopup'
import { getPrevMonth, getPaymentDueDay, isPaymentScheduled, getUnpaidLabelText, getActiveStudents, isWithdrawnStudent, safeMutate, decodePaymentMemo, useGrades, usePayments, revalidateGrades, revalidatePayments, getTodayString } from '@/lib/utils'
import { METHOD_OPTIONS_SHORT } from '@/lib/constants'
import { getRegularTuitionTitle, REGULAR_TUITION_MESSAGE } from '@/lib/billing-title'
import { formatKst } from '@/lib/schedule'
import { PaymentsSkeleton } from '@/components/Skeleton'
import BillSendModal from '@/components/BillSendModal'
import BulkBillSendModal, { type BulkBillTarget } from '@/components/BulkBillSendModal'
import BillActionModal from '@/components/BillActionModal'
import StudentDetailModal from '@/components/StudentDetailModal'
import AiFilterButton from '@/components/payments/AiFilterButton'
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
  resend_count?: number
  last_resend_at?: string | null
}

// BillStatus는 "이 학생에게 이번 달 청구서를 어떤 상태로 처리했는가" (청구서 레벨).
// types/index.ts 의 PaymentStatus('paid'|'partial'|'unpaid')와는 다른 도메인:
//   - BillStatus.paid = 청구서가 '완납 처리'된 상태 (청구 행위의 결과)
//   - PaymentStatus.paid = 실제 납부 합계가 수업료 이상인 상태 (납부 레벨)
// 둘 다 'paid' 문자열을 쓰지만 결코 섞지 말 것. 항상 변수 맥락으로 구분.
type BillStatus = 'unsent' | 'sent' | 'paid' | 'cancelled' | 'scheduled'

interface QueueEntry {
  id: string
  student_id: string
  billing_month: string
  send_type: 'single' | 'split' | 'reissue'
  scheduled_at: string
  is_regular_tuition: boolean
  created_at: string
}

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
  }, [anchor])

  // rect 커밋 후 다음 프레임에 show=true → 확실히 분리된 렌더 사이클로 드롭 애니메이션 발동
  useEffect(() => {
    if (!rect) return
    let id2 = 0
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setShow(true))
    })
    return () => { cancelAnimationFrame(id1); if (id2) cancelAnimationFrame(id2) }
  }, [rect])

  // 앵커 버튼 본체를 포탈이 덮음 (드롭다운 포탈이 원본 버튼을 가려야 하는 고의적 DOM 조작)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability
    anchor.style.visibility = 'hidden'
    return () => { anchor.style.visibility = '' }
  }, [anchor])

  const keys: PaymentFilter[] = ['all', 'unpaid', ...WEEK_KEYS]
  const orderedKeys = [currentFilter, ...keys.filter(k => k !== currentFilter)]

  if (!rect) return null

  const ROW_H = rect.height
  const totalH = ROW_H * orderedKeys.length
  const BORDER_R = Math.round(ROW_H / 2)
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
        initial={{
          top: rect.top,
          left: portalLeft,
          width: portalW,
          height: ROW_H,
          borderRadius: BORDER_R,
        }}
        animate={{
          top: rect.top,
          left: portalLeft,
          width: portalW,
          height: show ? totalH : ROW_H,
          borderRadius: BORDER_R,
        }}
        transition={{
          height: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
          borderRadius: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
          default: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
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
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              role="option"
              aria-selected={active}
              className={`relative w-full flex items-center text-xs font-semibold whitespace-nowrap ${bgFor(key, active)}`}
              style={{
                height: ROW_H,
                paddingLeft: alignLeft ? 28 : 0,
                justifyContent: alignLeft ? 'flex-start' : 'center',
              }}
            >
              <span>{FILTER_LABELS[key]}</span>
              {isWeek && rangeLabel && (isCurrent || show) && (
                <span className="text-[10px] opacity-60 ml-1" style={{ whiteSpace: 'nowrap' }}>
                  {rangeLabel}
                </span>
              )}
              {isCurrent && (
                <motion.div
                  className="absolute right-2 flex items-center justify-center"
                  animate={{ rotate: show ? 180 : 0 }}
                  transition={{ duration: 0.44, ease: [0.22, 1, 0.36, 1] }}
                >
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </motion.div>
              )}
            </button>
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
  const [inlineMemoFromPrev, setInlineMemoFromPrev] = useState(false)
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

  // 스와이프 — 좌측(비고)은 다중 선택, 우측(결제특이사항)은 단일
  const [selectedMemoIds, setSelectedMemoIds] = useState<Set<string>>(new Set())
  const [swipeOpenPayId, setSwipeOpenPayId] = useState<string | null>(null)
  const [editMemoValue, setEditMemoValue] = useState('')
  const [editMemoColor, setEditMemoColor] = useState<string | null>(null)
  const [editPayMemoValue, setEditPayMemoValue] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkToolbarTop, setBulkToolbarTop] = useState(8)
  const bulkToolbarRef = useRef<HTMLDivElement>(null)
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
  const [billSendTarget, setBillSendTarget] = useState<{ studentId: string; studentName: string; phone: string; amount: number; subject: string | null; className: string | null; electives: string[] } | null>(null)
  const [billActionTarget, setBillActionTarget] = useState<{ studentId: string; studentName: string; phone: string; billId: string; amount: number; status: 'sent' | 'paid' | 'cancelled' } | null>(null)
  const [bulkBillTarget, setBulkBillTarget] = useState<{ cls: ClassWithStudents | null; className: string; targets: BulkBillTarget[]; studentClsMap?: Map<string, ClassWithStudents> } | null>(null)

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

  // 타임락 예약 큐 (pending 상태 — 영업시간 외 발송 요청)
  const { data: queueEntries = [] } = useSWR<QueueEntry[]>(
    `/api/billing/queue?month=${selectedMonth}`,
    (url: string) => fetch(url).then(r => r.json()),
    { refreshInterval: 30000 }
  )
  const queueByStudent = useMemo(() => {
    const map = new Map<string, QueueEntry>()
    for (const q of queueEntries) {
      if (q.is_regular_tuition === false) continue
      if (!map.has(q.student_id)) map.set(q.student_id, q)
    }
    return map
  }, [queueEntries])

  const getBillStatus = useCallback((studentId: string): BillStatus => {
    const bill = billByStudent.get(studentId)
    if (!bill) {
      // 이력 없음 + 큐에 pending이면 예약 상태
      if (queueByStudent.has(studentId)) return 'scheduled'
      return 'unsent'
    }
    if (bill.status === 'paid') return 'paid'
    if (bill.status === 'cancelled' || bill.status === 'destroyed') return 'cancelled'
    return 'sent'
  }, [billByStudent, queueByStudent])

  // ─── 청구서 일괄발송 ───────────────────────────────────────────
  const [batchSending, setBatchSending] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [batchResultToast, setBatchResultToast] = useState<string | null>(null)
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
  const [customDay, setCustomDay] = useState<number | null>(null)
  const [monthMemo, setMonthMemo] = useState('')

  // AI 필터 (검색요정)
  const [aiFilterIds, setAiFilterIds] = useState<Set<string> | null>(null)
  const [aiFilterDesc, setAiFilterDesc] = useState('')
  const [aiFilterLoading, setAiFilterLoading] = useState(false)

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

  // 월별 메모 로드 — DB에서 (기기 간 공유)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/monthly-memo?month=${selectedMonth}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setMonthMemo(data.content ?? '')
      } catch {
        // 네트워크 실패 시 빈값 유지
      }
    })()
    return () => { cancelled = true }
  }, [selectedMonth])

  // 편집 디바운스 저장
  const memoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveMonthMemo = useCallback((content: string) => {
    if (memoSaveTimerRef.current) clearTimeout(memoSaveTimerRef.current)
    memoSaveTimerRef.current = setTimeout(() => {
      fetch('/api/monthly-memo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, content }),
      }).catch(err => console.warn('[payments] 월별 메모 자동저장 실패', err))
    }, 500)
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

  const prevMethodByStudentId = useMemo(() => {
    const map = new Map<string, PaymentMethod>()
    for (const p of prevPayments) {
      if (!map.has(p.student_id)) map.set(p.student_id, p.method as PaymentMethod)
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

  const getPrevMethod = useCallback((studentId: string): PaymentMethod | null =>
    prevMethodByStudentId.get(studentId) ?? null
  , [prevMethodByStudentId])

  const getDueDay = useCallback((student: Student): number =>
    student.payment_due_day ?? getPaymentDueDay(student)
  , [])

  function checkScheduled(student: Student, month: string): boolean {
    return isPaymentScheduled(student, month, student.payment_due_day ?? undefined)
  }

  // ─── 통합 필터 ──────────────────────────────────────────────
  const passesFilter = useCallback((s: Student, cls: ClassWithStudents): boolean => {
    // AI 필터가 적용중이면 최우선
    if (aiFilterIds !== null && !aiFilterIds.has(s.id)) return false
    // 수동 결제일 입력이 있으면 최우선 — 드롭다운 필터 무시
    if (customDay !== null) {
      const due = s.payment_due_day ?? getPaymentDueDay(s)
      return due === customDay
    }
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
  }, [aiFilterIds, customDay, paymentFilter, paymentsByStudentId, selectedMonth, weekRanges])

  const sendOneBill = useCallback(async (student: Student, cls: ClassWithStudents): Promise<'sent' | 'scheduled' | 'failed'> => {
    const phone = student.parent_phone || student.phone || ''
    const fee = getStudentFee(student, cls)
    if (!phone || fee <= 0) return 'failed'

    // 분할결제 설정된 학생은 저장된 금액 그대로 N개 발송
    if (student.split_billing_parts && student.split_billing_amounts && student.split_billing_amounts.length === student.split_billing_parts) {
      const { data } = await safeMutate<{ code?: string }>('/api/payssam/split-send', 'POST', {
        studentId: student.id,
        studentName: student.name,
        phone: phone.replace(/-/g, ''),
        billingMonth: selectedMonth,
        amounts: student.split_billing_amounts,
        persist: false,
      })
      if (data?.code === 'SCHEDULED') return 'scheduled'
      if (data?.code === '0000') return 'sent'
      return 'failed'
    }

    const { data } = await safeMutate<{ code?: string }>('/api/payssam/send', 'POST', {
      studentId: student.id,
      studentName: student.name,
      phone: phone.replace(/-/g, ''),
      amount: fee,
      productName: getRegularTuitionTitle(cls.subject, selectedMonth, cls.name, student.electives),
      message: REGULAR_TUITION_MESSAGE,
      billingMonth: selectedMonth,
    })
    if (data?.code === 'SCHEDULED') return 'scheduled'
    if (data?.code === '0000') return 'sent'
    return 'failed'
  }, [selectedMonth])

  const openBulkBillModal = useCallback((cls: ClassWithStudents) => {
    const classStudents = getActiveStudents(cls.students ?? [], selectedMonth).filter(s => passesFilter(s, cls))
    const eligible = classStudents.filter(s => {
      const phone = s.parent_phone || s.phone || ''
      const fee = getStudentFee(s, cls)
      return phone && fee > 0 && !billByStudent.has(s.id)
    })
    if (eligible.length === 0) return
    const targets: BulkBillTarget[] = eligible.map(s => ({
      studentId: s.id,
      studentName: s.name,
      className: cls.name,
      amount: getStudentFee(s, cls),
    }))
    setBulkBillTarget({ cls, className: cls.name, targets })
  }, [selectedMonth, passesFilter, billByStudent])

  const executeBulkSend = useCallback(async () => {
    if (!bulkBillTarget) return
    const { cls, targets, studentClsMap } = bulkBillTarget

    // 단일반 bulk(cls 있음) vs 필터 전체 bulk(studentClsMap 있음) 구분
    const items: Array<{ student: Student; cls: ClassWithStudents }> = []
    if (cls) {
      const eligible = (cls.students ?? []).filter(s => targets.some(t => t.studentId === s.id))
      for (const s of eligible) items.push({ student: s, cls })
    } else if (studentClsMap) {
      for (const t of targets) {
        const c = studentClsMap.get(t.studentId)
        const s = c?.students?.find(st => st.id === t.studentId)
        if (s && c) items.push({ student: s, cls: c })
      }
    }

    const batchId = cls?.id ?? '__filter__'
    setBulkBillTarget(null)

    cancelBatchRef.current = false
    setCancellingBatch(false)
    setBatchSending(batchId)
    setBatchProgress({ done: 0, total: items.length })

    const counts = { sent: 0, scheduled: 0, failed: 0 }
    for (let i = 0; i < items.length; i++) {
      if (cancelBatchRef.current) break
      const result = await sendOneBill(items[i].student, items[i].cls)
      counts[result]++
      setBatchProgress({ done: i + 1, total: items.length })
      if (cancelBatchRef.current) break
      if (i < items.length - 1) await new Promise(r => setTimeout(r, 500))
    }

    setBatchSending(null)
    setBatchProgress(null)
    setCancellingBatch(false)
    cancelBatchRef.current = false

    // 결과 토스트
    const parts: string[] = []
    if (counts.sent) parts.push(`${counts.sent}건 발송`)
    if (counts.scheduled) parts.push(`${counts.scheduled}건 예약(영업시간 외)`)
    if (counts.failed) parts.push(`${counts.failed}건 실패`)
    if (parts.length > 0) {
      setBatchResultToast(parts.join(' · '))
      setTimeout(() => setBatchResultToast(null), 4500)
    }

    mutateBills()
  }, [bulkBillTarget, sendOneBill, mutateBills])

  const cancelBatch = useCallback(() => {
    cancelBatchRef.current = true
    setCancellingBatch(true)
  }, [])

  // ─── AI 필터 (검색요정) — 납부 컨텍스트 기반 ──
  const handleAiFilter = useCallback(async (query: string) => {
    setAiFilterLoading(true)
    const allForFilter = grades.flatMap(g => g.classes.flatMap(c =>
      getActiveStudents((c as ClassWithStudents).students ?? [], selectedMonth).map(s => ({ ...s, class: c as ClassWithStudents }))
    ))

    const [prevY, prevM] = prevMonth.split('-').map(Number)
    const studentContext = allForFilter.map(s => {
      const currPays = paymentsByStudentId.get(s.id) ?? []
      const prevPays = prevPayments.filter(p => p.student_id === s.id)
      const fee = getStudentFee(s, s.class)
      const dueDay = getDueDay(s)
      const paid = currPays.reduce((sum, p) => sum + p.amount, 0)
      const status = getPaymentStatus(paid, fee)
      const currMemo = currPays.find(p => p.memo && p.memo.trim())?.memo?.trim() || null
      const prevMemo = prevPays.find(p => p.memo && p.memo.trim())?.memo?.trim() || null
      const currMethod = currPays[0]?.method || null
      const prevMethod = prevPays[0]?.method || null
      const paymentDate = currPays[0]?.payment_date ?? null
      const prevPayDate = prevPays
        .map(p => p.payment_date)
        .filter(Boolean)
        .sort()[0] || null

      // 지난달 결제일 대비 지연일수 (due_day 없으면 null)
      let prevDaysLate: number | null = null
      if (prevPayDate && dueDay) {
        const payD = new Date(prevPayDate + 'T00:00:00')
        const dueD = new Date(prevY, prevM - 1, dueDay)
        prevDaysLate = Math.floor((payD.getTime() - dueD.getTime()) / (24 * 60 * 60 * 1000))
      }

      return {
        id: s.id,
        name: s.name,
        grade: '',
        class_name: s.class?.name || '',
        subject: s.class?.subject || null,
        fee,
        due_day: dueDay,
        paid,
        status,
        payment_method: currMethod,
        payment_date: paymentDate,
        current_memo: currMemo,
        prev_memo: prevMemo,
        prev_payment_method: prevMethod,
        prev_payment_date: prevPayDate,
        prev_days_late: prevDaysLate,
        is_amount_modified: s.custom_fee != null,
        electives: s.electives ?? [],
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
      toast.error('AI 필터 처리 중 오류가 발생했습니다.')
    }
    setAiFilterLoading(false)
  }, [grades, selectedMonth, prevMonth, paymentsByStudentId, prevPayments, getDueDay])

  const clearAiFilter = useCallback(() => {
    setAiFilterIds(null)
    setAiFilterDesc('')
  }, [])

  // 현재 필터에 해당하는 모든 반의 미납 학생을 한방에 발송
  const openFilterBulkBillModal = useCallback(() => {
    const targets: BulkBillTarget[] = []
    const studentClsMap = new Map<string, ClassWithStudents>()
    for (const grade of grades) {
      for (const cls of grade.classes ?? []) {
        const classStudents = getActiveStudents(cls.students ?? [], selectedMonth).filter(s => passesFilter(s, cls as ClassWithStudents))
        for (const s of classStudents) {
          const phone = s.parent_phone || s.phone || ''
          const fee = getStudentFee(s, cls as ClassWithStudents)
          if (!phone || fee <= 0 || billByStudent.has(s.id)) continue
          targets.push({
            studentId: s.id,
            studentName: s.name,
            className: cls.name,
            amount: fee,
          })
          studentClsMap.set(s.id, cls as ClassWithStudents)
        }
      }
    }
    if (targets.length === 0) return
    setBulkBillTarget({
      cls: null,
      className: `${FILTER_LABELS[paymentFilter]} 일괄`,
      targets,
      studentClsMap,
    })
  }, [grades, selectedMonth, passesFilter, billByStudent, paymentFilter])

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

  // 반별 납부 통계 (paidCount/totalCount/isFullyPaid)
  const classStats = useMemo(() => {
    const map = new Map<string, { paidCount: number; totalCount: number; isFullyPaid: boolean }>()
    for (const g of grades) {
      for (const cls of g.classes) {
        const active = getActiveStudents(cls.students ?? [], selectedMonth)
        const filtered = active.filter(s => passesFilter(s, cls))
        const paidCount = filtered.filter(s => {
          const paid = (paymentsByStudentId.get(s.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
          return getPaymentStatus(paid, getStudentFee(s, cls)) === 'paid'
        }).length
        const totalCount = filtered.length
        map.set(cls.id, {
          paidCount,
          totalCount,
          isFullyPaid: totalCount > 0 && paidCount === totalCount,
        })
      }
    }
    return map
  }, [grades, selectedMonth, passesFilter, paymentsByStudentId])

  // 기본: 보이는 반 전부 펼침 + 전원납부 완료 반은 자동 접힘
  useEffect(() => {
    const allIds = visibleSections.flatMap(s => s.classIds)
    if (allIds.length === 0) return
    setExpandedClasses(prev => {
      const next = new Set(prev)
      for (const id of allIds) {
        const stat = classStats.get(id)
        if (stat?.isFullyPaid) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [visibleSections, classStats])

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
  const EASE_OUT = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)'
  const MEMO_W = 160  // 왼쪽 비고 패널 너비 (단일 선택: 라벨+색상테이프+저장)
  const BADGE_W = 48  // 다중 선택 시 배지만 표시하는 너비
  const PAY_W = 150   // 오른쪽 결제 특이사항 패널 너비 (헤더: 배지+저장)

  const rowOffset = useCallback((id: string): number => {
    if (selectedMemoIds.has(id)) return selectedMemoIds.size >= 2 ? BADGE_W : MEMO_W
    if (swipeOpenPayId === id) return -PAY_W
    return 0
  }, [selectedMemoIds, swipeOpenPayId])

  // 다중선택 툴바를 제일 위 선택 학생 행 위에 플로팅 — 아래쪽에서 선택해도 가깝게 뜨도록
  useLayoutEffect(() => {
    if (selectedMemoIds.size < 2) return
    let rafId: number | null = null
    const update = () => {
      rafId = null
      let topY = Infinity
      for (const id of selectedMemoIds) {
        const el = document.querySelector(`[data-student-row="${id}"]`) as HTMLElement | null
        if (!el) continue
        const rect = el.getBoundingClientRect()
        if (rect.top < topY) topY = rect.top
      }
      if (!isFinite(topY)) return
      const h = bulkToolbarRef.current?.offsetHeight ?? 50
      setBulkToolbarTop(Math.max(topY - h - 6, 8))
    }
    const schedule = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [selectedMemoIds])

  const handleTouchStart = (e: React.PointerEvent, studentId: string) => {
    if (expandedStudentId) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const el = e.currentTarget as HTMLElement
    const baseOffset = rowOffset(studentId)
    touchRef.current = {
      startX: e.clientX, startY: e.clientY, currentX: e.clientX,
      id: studentId, el, decided: false, isHorizontal: false,
      baseOffset, wasOpen: baseOffset !== 0,
    }
    try { el.setPointerCapture(e.pointerId) } catch {}
  }

  const handleTouchMove = (e: React.PointerEvent) => {
    if (!touchRef.current) return
    const dx = e.clientX - touchRef.current.startX
    const dy = e.clientY - touchRef.current.startY
    touchRef.current.currentX = e.clientX

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

    // sqrt 감쇠 — 왼쪽 한계 -PAY_W, 오른쪽 한계 +MEMO_W (다중선택 중에도 rubber-band는 MEMO_W까지)
    const rightLimit = MEMO_W
    if (raw < -PAY_W) raw = -PAY_W - Math.sqrt(Math.abs(raw + PAY_W)) * 2
    else if (raw > rightLimit) raw = rightLimit + Math.sqrt(raw - rightLimit) * 2

    touchRef.current.el.style.transition = 'none'
    touchRef.current.el.style.transform = `translateX(${raw}px)`
  }

  const animateRowTo = (id: string, x: number, transition: string = SPRING) => {
    const el = document.querySelector(`[data-swipe-row="${id}"]`) as HTMLElement | null
    if (el) { el.style.transition = transition; el.style.transform = `translateX(${x}px)` }
  }

  const handleTouchEnd = () => {
    if (!touchRef.current) return
    const { el, id, isHorizontal, startX, currentX } = touchRef.current
    const dx = currentX - startX
    const baseOffset = touchRef.current.baseOffset ?? 0
    const wasOpen = touchRef.current.wasOpen
    const wasMemoSelected = selectedMemoIds.has(id)
    const wasPayOpen = swipeOpenPayId === id
    const prevCount = selectedMemoIds.size

    el.style.transition = SPRING

    if (isHorizontal && Math.abs(dx) > 10) {
      wasSwiped.current = true
      setTimeout(() => { wasSwiped.current = false }, 200)
    }

    if (!isHorizontal) {
      el.style.transform = wasOpen ? `translateX(${baseOffset}px)` : 'translateX(0)'
      touchRef.current = null
      return
    }

    const addMemoSelection = () => {
      // 2번째 추가 시 기존 선택 행을 MEMO_W → BADGE_W 축소
      if (prevCount === 1) {
        selectedMemoIds.forEach(prevId => animateRowTo(prevId, BADGE_W))
      }
      const target = prevCount >= 1 ? BADGE_W : MEMO_W
      el.style.transform = `translateX(${target}px)`
      const student = allStudents.find(s => s.id === id)
      setSelectedMemoIds(prev => {
        const next = new Set(prev); next.add(id); return next
      })
      if (student && prevCount === 0) {
        setEditMemoValue(student.memo ?? '')
        setEditMemoColor(student.memo_color ?? null)
      }
    }

    const removeMemoSelection = () => {
      // 재스와이프로 해제 — EASE_OUT 부드러운 복귀
      el.style.transition = EASE_OUT
      el.style.transform = 'translateX(0)'
      setSelectedMemoIds(prev => {
        const next = new Set(prev); next.delete(id); return next
      })
      // 2개 → 1개 축소 시 남은 행을 BADGE_W → MEMO_W 확장
      if (prevCount === 2) {
        const remaining = Array.from(selectedMemoIds).find(sid => sid !== id)
        if (remaining) animateRowTo(remaining, MEMO_W)
      }
    }

    // 우로 밀기
    if (dx > 60) {
      if (wasPayOpen) {
        // 결제특이사항 닫고 비고 선택으로 전환
        setSwipeOpenPayId(null)
        addMemoSelection()
      } else if (!wasMemoSelected) {
        // 비고 선택에 추가
        addMemoSelection()
      } else {
        // 이미 선택됨 → 재스와이프로 해제
        removeMemoSelection()
      }
    }
    // 좌로 밀기
    else if (dx < -60) {
      if (wasMemoSelected) {
        // 비고 선택에서 해제 (해당 학생만)
        removeMemoSelection()
      } else if (selectedMemoIds.size > 0) {
        // 다른 학생이 비고 활성화 중 → 전체 해제 (EASE_OUT)
        el.style.transition = EASE_OUT
        el.style.transform = wasOpen ? `translateX(${baseOffset}px)` : 'translateX(0)'
        selectedMemoIds.forEach(prevId => animateRowTo(prevId, 0, EASE_OUT))
        setSelectedMemoIds(new Set())
        setEditMemoValue('')
        setEditMemoColor(null)
      } else if (wasPayOpen) {
        // 결제특이사항 닫기
        el.style.transition = EASE_OUT
        el.style.transform = 'translateX(0)'
        setSwipeOpenPayId(null)
      } else {
        // 결제특이사항 열기
        el.style.transform = `translateX(-${PAY_W}px)`
        setSwipeOpenPayId(id)
        const sp = paymentsByStudentId.get(id) ?? []
        const { cleanMemo } = decodePaymentMemo(sp[0]?.memo)
        setEditPayMemoValue(cleanMemo ?? '')
      }
    }
    // 임계값 미달 → 원위치
    else {
      el.style.transform = wasOpen ? `translateX(${baseOffset}px)` : 'translateX(0)'
    }

    touchRef.current = null
  }

  const closeAllMemoSelections = () => {
    selectedMemoIds.forEach(id => animateRowTo(id, 0, EASE_OUT))
    setSelectedMemoIds(new Set())
    setEditMemoValue('')
    setEditMemoColor(null)
  }

  const closeSwipeEdit = () => {
    if (swipeOpenPayId) {
      animateRowTo(swipeOpenPayId, 0, EASE_OUT)
      setSwipeOpenPayId(null)
    }
    if (selectedMemoIds.size > 0) closeAllMemoSelections()
  }

  const handleSaveMemo = async (studentId: string) => {
    const memo = editMemoValue.trim() || null
    const { error } = await safeMutate(`/api/students/${studentId}`, 'PUT', { memo, memo_color: editMemoColor })
    if (error) { toast.error('저장 실패'); return }
    closeSwipeEdit()
    await fetchData()
  }

  const handleBulkSaveMemo = async () => {
    if (selectedMemoIds.size === 0) return
    setBulkSaving(true)
    const memo = editMemoValue.trim() || null
    const ids = Array.from(selectedMemoIds)
    const results = await Promise.all(
      ids.map(id => safeMutate(`/api/students/${id}`, 'PUT', { memo, memo_color: editMemoColor }))
    )
    setBulkSaving(false)
    const failed = results.filter(r => r.error).length
    if (failed > 0) { toast.error(`${failed}건 저장 실패`); return }
    closeAllMemoSelections()
    await fetchData()
  }

  const handleSavePayMemo = async (studentId: string) => {
    const sp = paymentsByStudentId.get(studentId) ?? []
    const payment = sp[0]
    if (!payment) { toast.error('이번 달 납부 기록이 없어 결제 특이사항을 저장할 수 없습니다'); return }
    const memo = editPayMemoValue.trim() || null
    const { error } = await safeMutate(`/api/payments/${payment.id}`, 'PUT', { memo })
    if (error) { toast.error('저장 실패'); return }
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
    const prev = getPrevMemo(studentId)
    setInlineMemo(prev ?? '')
    setInlineMemoFromPrev(!!prev)
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
      toast.error(`결제 처리 실패: ${error}`)
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
    if (error) { toast.error(`납부 저장 실패: ${error}`); return }
    fetchData()
  }

  const handleUpdatePayment = async (paymentId: string, data: Partial<Payment>) => {
    const { error } = await safeMutate(`/api/payments/${paymentId}`, 'PUT', data)
    if (error) { toast.error(`수정 실패: ${error}`); return }
    fetchData()
  }

  const handleDeletePayment = async (paymentId: string) => {
    const { error } = await safeMutate(`/api/payments/${paymentId}`, 'DELETE')
    if (error) { toast.error(`삭제 실패: ${error}`); return }
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
    if (error) { toast.error(`학생 등록 실패: ${error}`); return }
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
    <div ref={containerRef} onClick={() => { if (selectedMemoIds.size > 0 || swipeOpenPayId) closeSwipeEdit() }}>
      {/* 다중 선택 툴바 — 제일 위 선택된 학생 행 위에 플로팅 */}
      <AnimatePresence>
        {selectedMemoIds.size >= 2 && (
          <motion.div
            key="bulk-toolbar"
            ref={bulkToolbarRef}
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }}
            className="fixed left-2 right-2 z-50 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-xl"
            style={{ top: bulkToolbarTop }}
            onClick={e => e.stopPropagation()}
          >
            <div className="max-w-3xl mx-auto px-3 py-2 flex items-center gap-2">
              <button
                onClick={closeAllMemoSelections}
                className="p-1.5 rounded-full hover:bg-[var(--bg-card-hover)] text-[var(--text-3)] shrink-0"
                aria-label="선택 취소"
              >
                <X className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-[var(--text-1)] tabular-nums shrink-0">
                {selectedMemoIds.size}명
              </span>
              <div className="flex items-center gap-1 shrink-0">
                {(['yellow', 'green', 'red'] as const).map(c => {
                  const bg = c === 'yellow' ? 'bg-[var(--orange-dim)]' : c === 'green' ? 'bg-[var(--paid-bg)]' : 'bg-[var(--unpaid-bg)]'
                  const active = editMemoColor === c
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditMemoColor(active ? null : c)}
                      className={`w-7 h-3.5 rounded-[2px] ${bg} ${active ? 'ring-1 ring-white/70 shadow-md' : 'opacity-60'}`}
                      style={{ transform: 'skewX(-10deg)' }}
                      aria-label={`색상 ${c}`}
                    />
                  )
                })}
              </div>
              <input
                type="text"
                value={editMemoValue}
                onChange={e => setEditMemoValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleBulkSaveMemo() }}
                placeholder="비고 (일괄 적용)"
                className="flex-1 min-w-0 px-2.5 py-1 rounded-lg text-xs border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)] placeholder-[var(--text-4)]"
              />
              <button
                onClick={handleBulkSaveMemo}
                disabled={bulkSaving}
                className="p-1.5 bg-[var(--blue)] hover:opacity-80 text-white rounded-full shrink-0 shadow-sm transition-opacity disabled:opacity-50"
                aria-label="일괄 저장"
              >
                {bulkSaving ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              saveMonthMemo(e.target.value)
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

      {/* 빈 상태 — 필터 결과 0명 */}
      {visibleSections.length === 0 && (customDay !== null || paymentFilter !== 'all') && (
        <div className="card p-6 flex flex-col items-center text-center gap-3 mb-4">
          <p className="text-sm text-[var(--text-2)] font-medium">조건에 맞는 학생이 없습니다</p>
          <div className="flex flex-wrap items-center justify-center gap-1.5 text-[11px] text-[var(--text-3)]">
            {customDay !== null && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--blue-dim)] text-[var(--blue)] font-semibold">결제일 {customDay}일</span>
            )}
            {paymentFilter !== 'all' && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-2)] font-semibold">{FILTER_LABELS[paymentFilter]}</span>
            )}
          </div>
          {customDay !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-[var(--text-4)]">다른 결제일로 변경</span>
              <input
                type="number"
                min={1}
                max={31}
                value={customDay ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '') { setCustomDay(null); return }
                  const n = parseInt(v, 10)
                  if (Number.isNaN(n)) return
                  setCustomDay(Math.min(31, Math.max(1, n)))
                }}
                aria-label="결제일 직접 입력"
                className="w-14 px-2 py-1 rounded-full text-xs font-semibold text-center shadow-sm focus:outline-none focus:ring-1 focus:ring-[var(--blue)] bg-[var(--blue-dim)] text-[var(--blue)]"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setCustomDay(null)
              setPaymentFilter('all')
            }}
            className="px-3 py-1.5 rounded-full text-xs font-bold bg-[var(--bg-elevated)] text-[var(--text-2)] hover:bg-[var(--bg-card-hover)] transition-colors"
          >
            필터 초기화
          </button>
        </div>
      )}

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
                      <div className="flex items-center gap-2">
                        <AnimatePresence initial={false}>
                          {paymentFilter !== 'all' && batchSending !== '__filter__' && (() => {
                            // 현재 필터에 걸리는 모든 반의 발송가능 인원 합산
                            let eligibleCount = 0
                            for (const grade of grades) {
                              for (const cls of grade.classes ?? []) {
                                const classStudents = getActiveStudents(cls.students ?? [], selectedMonth).filter(s => passesFilter(s, cls as ClassWithStudents))
                                for (const s of classStudents) {
                                  const phone = s.parent_phone || s.phone || ''
                                  const fee = getStudentFee(s, cls as ClassWithStudents)
                                  if (phone && fee > 0 && !billByStudent.has(s.id)) eligibleCount++
                                }
                              }
                            }
                            if (eligibleCount === 0) return null
                            return (
                              <motion.button
                                key="filter-bulk-badge"
                                type="button"
                                onClick={openFilterBulkBillModal}
                                disabled={!!batchSending}
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--red-dim)] text-[var(--unpaid-text)] shadow-sm active:opacity-70 disabled:opacity-50"
                              >
                                <Send className="w-3 h-3" />
                                <span>{FILTER_LABELS[paymentFilter]} 일괄</span>
                                <span className="tabular-nums opacity-70">{eligibleCount}</span>
                              </motion.button>
                            )
                          })()}
                          {batchSending === '__filter__' && batchProgress && (
                            <motion.div
                              key="filter-bulk-progress"
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--orange-dim)]"
                            >
                              <Loader2 className="w-3 h-3 animate-spin text-[var(--orange)]" />
                              <span className="text-[11px] font-bold text-[var(--orange)] tabular-nums">{batchProgress.done}/{batchProgress.total}</span>
                              <button
                                onClick={cancelBatch}
                                disabled={cancellingBatch}
                                className="px-1.5 py-0.5 rounded-md bg-[var(--red-dim)] text-[var(--red)] text-[10px] font-bold hover:opacity-80 disabled:opacity-50"
                              >
                                {cancellingBatch ? '중단중' : '중단'}
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        <div className="flex items-center gap-1.5">
                          <div className="relative flex items-center">
                            <input
                              type="number"
                              min={1}
                              max={31}
                              value={customDay ?? ''}
                              onChange={(e) => {
                                const v = e.target.value
                                if (v === '') { setCustomDay(null); return }
                                const n = parseInt(v, 10)
                                if (Number.isNaN(n)) return
                                setCustomDay(Math.min(31, Math.max(1, n)))
                              }}
                              placeholder="일"
                              aria-label="결제일 직접 입력"
                              className={`w-14 px-2 py-1 rounded-full text-xs font-semibold text-center shadow-sm focus:outline-none focus:ring-1 focus:ring-[var(--blue)] placeholder:text-[var(--text-4)] ${
                                customDay !== null
                                  ? 'bg-[var(--blue-dim)] text-[var(--blue)]'
                                  : 'bg-[var(--bg-elevated)] text-[var(--text-2)]'
                              }`}
                            />
                            {customDay !== null && (
                              <button
                                type="button"
                                onClick={() => setCustomDay(null)}
                                aria-label="직접 입력 해제"
                                className="absolute -right-1 -top-1 w-4 h-4 rounded-full bg-[var(--bg-elevated)] text-[var(--text-3)] text-[10px] leading-none flex items-center justify-center shadow-sm hover:text-[var(--text-1)]"
                              >
                                ×
                              </button>
                            )}
                          </div>
                          <button
                            onClick={(e) => setFilterAnchor(prev => prev === e.currentTarget ? null : e.currentTarget)}
                            disabled={customDay !== null}
                            style={{ width: 112 }}
                            className={`relative flex items-center justify-center px-3 py-1 rounded-full text-xs font-semibold transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed ${
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
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="card overflow-hidden">
                  {gradeClasses.map(cls => {
                const allClassStudents = getActiveStudents(cls.students ?? [], selectedMonth)
                let students = allClassStudents.filter(s => passesFilter(s, cls))
                // 사용자가 지정한 순서(order_index) 우선, 없으면 결제일 오름차순
                students = [...students].sort((a, b) => {
                  const ao = a.order_index ?? 0
                  const bo = b.order_index ?? 0
                  if (ao !== bo) return ao - bo
                  return getDueDay(a) - getDueDay(b)
                })

                if (students.length === 0) return null

                const paidCount = students.filter(s => {
                  const paid = (paymentsByStudentId.get(s.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
                  return getPaymentStatus(paid, getStudentFee(s, cls)) === 'paid'
                }).length
                const isFullyPaid = students.length > 0 && paidCount === students.length
                const isClassExpanded = expandedClasses.has(cls.id)

                return (
                  <div key={cls.id}>
                    <div
                      className="px-4 py-2.5 bg-[var(--bg-card-hover)]/70 border-b border-[var(--border)] flex items-center cursor-pointer active:bg-[var(--bg-elevated)] select-none"
                      onClick={() => toggleClass(cls.id)}
                    >
                      <span className="text-sm font-medium text-[var(--text-3)]">{cls.name}</span>
                      {(() => {
                        const teacherName = cls.teacher?.name
                        const days = parseClassDays(cls.class_days)
                        const dayStr = days?.length ? days.map(d => DAY_LABELS[d]).filter(Boolean).join('') : ''
                        if (!teacherName && !dayStr) return null
                        return (
                          <span className="text-[10px] text-[var(--text-4)] ml-1.5">
                            {teacherName}{teacherName && dayStr ? ' · ' : ''}{dayStr}
                          </span>
                        )
                      })()}
                      <span className="text-xs text-[var(--text-4)] ml-1.5">{cls.monthly_fee > 0 ? `${cls.monthly_fee.toLocaleString()}원` : ''}</span>
                      {isFullyPaid ? (
                        <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--paid-bg)] text-[var(--paid-text)] tracking-tight">
                          전원납부 {paidCount}/{students.length}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-4)] ml-2">{paidCount}/{students.length}</span>
                      )}
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
                                toast.error('결제일을 선택해주세요! 전체 상태에서는 일괄 발송이 불가합니다.')
                                return
                              }
                              openBulkBillModal(cls)
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
                    {students.map((student, idx) => {
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
                        // 배지는 학생의 고정 결제일 (scheduled due day) — 실제 납부일과 무관
                        const billingMonth = parseInt(selectedMonth.split('-')[1])
                        displayLabel = `${billingMonth}/${getDueDay(student)} 납부`
                      } else {
                        displayLabel = PAYMENT_STATUS_LABELS[status]
                      }
                      const prevMemo = getPrevMemo(student.id)
                      const prevMethod = getPrevMethod(student.id)
                      // 'remote'(비대면)은 이전 결제선생 레거시 표기 → payssam과 동일 취급
                      const prevMethodNonPayssam = prevMethod && prevMethod !== 'payssam' && prevMethod !== 'remote' ? prevMethod : null
                      const currentMemo = studentPayments[0]?.memo
                      const isExpanded = expandedStudentId === student.id && status === 'unpaid'
                      const isSuccess = inlineSuccess === student.id
                      const isSubmitting = inlineSubmitting === student.id
                      const { cleanMemo } = decodePaymentMemo(currentMemo)
                      const hasMemo = !!(prevMemo || cleanMemo || student.memo || prevMethodNonPayssam)
                      const isMemoSelected = selectedMemoIds.has(student.id)
                      const isPayOpen = swipeOpenPayId === student.id
                      const isSwipeOpen = isMemoSelected || isPayOpen
                      const openSide: 'left' | 'right' | null = isMemoSelected ? 'left' : isPayOpen ? 'right' : null
                      const isMultiSelect = selectedMemoIds.size >= 2
                      const isSoleMemoSelection = isMemoSelected && selectedMemoIds.size === 1
                      const memoColor = student.memo_color ?? null
                      const nameHighlight = memoColor === 'yellow' ? 'bg-[var(--orange-dim)] text-[var(--orange)] px-2 py-0.5'
                        : memoColor === 'green' ? 'bg-[var(--paid-bg)] text-[var(--paid-text)] px-2 py-0.5'
                        : memoColor === 'red' ? 'bg-[var(--unpaid-bg)] text-[var(--unpaid-text)] px-2 py-0.5'
                        : ''
                      const tornTapeStyle = memoColor ? {
                        clipPath: 'polygon(3% 0%, 12% 4%, 24% 0%, 38% 5%, 52% 0%, 66% 4%, 80% 0%, 92% 5%, 100% 12%, 96% 30%, 100% 50%, 97% 70%, 100% 88%, 94% 100%, 82% 96%, 68% 100%, 54% 95%, 40% 100%, 26% 96%, 12% 100%, 4% 94%, 0% 82%, 4% 64%, 0% 48%, 3% 30%, 0% 14%)',
                        display: 'inline-block',
                      } : undefined
                      const withdrawn = isWithdrawnStudent(student)

                      return (
                        <div key={student.id} data-student-row={student.id} className="relative">
                          {/* 위층: 행 높이 (좌/우 패널 헤더 + 메인 콘텐츠) */}
                          <div className="relative overflow-hidden">
                            {/* 왼쪽 패널 헤더 — 비고 라벨 + 색상 테이프 + 저장 (다중선택 시 배지만) */}
                            <div data-edit-panel className={`absolute inset-y-0 left-0 ${isMultiSelect ? 'w-[48px] justify-center' : 'w-[160px] gap-1.5 px-2'} flex items-center bg-[var(--bg-elevated)] transition-[width] duration-300 ease-out`} onClick={e => e.stopPropagation()}>
                              {isMultiSelect ? (
                                <div className="w-6 h-6 rounded-full bg-[var(--blue-bg)] flex items-center justify-center">
                                  <Check className="w-3.5 h-3.5 text-[var(--blue)]" strokeWidth={3} />
                                </div>
                              ) : (
                                <>
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
                                  <button onClick={() => handleSaveMemo(student.id)} className="ml-auto p-1.5 bg-[var(--blue-bg)] hover:bg-[var(--blue-dim)] text-[var(--blue)] rounded-full shrink-0 transition-colors" aria-label="저장">
                                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                                  </button>
                                </>
                              )}
                            </div>

                            {/* 오른쪽 패널 헤더 — "결제특이사항" 배지 + 저장 */}
                            <div data-edit-panel className="absolute inset-y-0 right-0 w-[150px] flex items-center justify-between gap-1.5 px-2 bg-[var(--bg-elevated)]" onClick={e => e.stopPropagation()}>
                              <span className="text-[10px] font-bold text-[var(--orange)] px-2 py-0.5 rounded-full bg-[var(--orange-dim)] shrink-0">결제특이사항</span>
                              <button onClick={() => handleSavePayMemo(student.id)} className="p-1.5 bg-[var(--blue-bg)] hover:bg-[var(--blue-dim)] text-[var(--blue)] rounded-full shrink-0 transition-colors" aria-label="저장">
                                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                              </button>
                            </div>

                            {/* 메인 콘텐츠 */}
                            <div
                              data-swipe-row={student.id}
                              className="relative bg-[var(--bg-card)] z-10"
                              onPointerDown={e => handleTouchStart(e, student.id)}
                              onPointerMove={handleTouchMove}
                              onPointerUp={handleTouchEnd}
                              onPointerCancel={handleTouchEnd}
                              style={{ transform: `translateX(${rowOffset(student.id)}px)`, transition: SPRING, touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none' }}
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
                                <span className="text-[11px] text-[var(--text-4)] mr-1 tabular-nums">{idx + 1}.</span>
                                <span className={`text-sm font-medium ${nameHighlight} ${withdrawn ? 'line-through decoration-red-500 decoration-2 text-[var(--text-4)]' : ''}`} style={tornTapeStyle}>{student.name}</span>
                                {(student.electives ?? []).length > 0 && (
                                  <span className="text-[11px] text-[var(--text-4)] ml-1.5">{(student.electives ?? []).join('/')}</span>
                                )}
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
                                      <p className="text-[11px] font-medium leading-tight mt-0.5 text-[var(--text-3)]">
                                        {student.memo}
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
                                        isSuccess ? 'bg-[var(--paid-bg)] text-[var(--paid-text)] scale-110' : isSubmitting ? 'bg-[var(--paid-bg)] text-[var(--paid-text)] opacity-60 scale-100' : 'bg-[var(--green-dim)] text-[var(--paid-text)] hover:opacity-80'
                                      }`}
                                      aria-label="납부 처리"
                                    >
                                      {isSuccess ? (
                                        <Check className="w-3.5 h-3.5 animate-[checkBounce_0.3s_ease-out]" strokeWidth={3} />
                                      ) : isSubmitting ? (
                                        <div className="w-3.5 h-3.5 border-2 border-[var(--paid-text)] border-t-transparent rounded-full animate-spin" />
                                      ) : '납부'}
                                    </button>
                                    <button
                                      onClick={() => {
                                        const parentPhone = student.parent_phone || student.phone || ''
                                        setBillSendTarget({ studentId: student.id, studentName: student.name, phone: parentPhone, amount: fee, subject: cls.subject ?? null, className: cls.name ?? null, electives: student.electives ?? [] })
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
                                  <div className="fan-item w-full relative">
                                    {inlineMemoFromPrev && inlineMemo && (
                                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 px-1 py-0.5 rounded text-[9px] font-semibold bg-[var(--orange-dim)] text-[var(--orange)] pointer-events-none">전달</span>
                                    )}
                                    <input
                                      type="text"
                                      value={inlineMemo}
                                      onChange={e => { setInlineMemo(e.target.value); setInlineMemoFromPrev(false) }}
                                      placeholder="비고"
                                      className={`w-full py-1 rounded-lg text-xs border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)] placeholder-[var(--text-4)] ${inlineMemoFromPrev && inlineMemo ? 'pl-9 pr-2.5' : 'px-2.5'}`}
                                      aria-label="비고 입력"
                                    />
                                  </div>
                                </div>
                              ) : (
                                <>
                                  {studentPayments.length > 0 && status !== 'unpaid' && (() => {
                                    const p = studentPayments[0]
                                    const { otherMethod } = decodePaymentMemo(p.memo)
                                    const methodLabel = otherMethod || PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS]
                                    // 회색 접두어는 실제 납부일
                                    const pDate = new Date(p.payment_date)
                                    return (
                                      <span className="text-[10px] text-[var(--text-4)] whitespace-nowrap">
                                        {pDate.getMonth() + 1}/{pDate.getDate()} {methodLabel}
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
                                                phone: student.parent_phone || student.phone || '',
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
                                    const queueEntry = queueByStudent.get(student.id)
                                    const scheduledAtKst = queueEntry ? formatKst(new Date(queueEntry.scheduled_at)) : null
                                    const styles: Record<BillStatus, { fg: string; bg: string; title: string }> = {
                                      unsent:    { fg: 'var(--text-4)', bg: 'var(--bg-elevated)', title: '카톡 청구서 발송' },
                                      sent:      { fg: 'var(--orange)', bg: 'var(--orange-dim)',  title: '발송됨 — 탭하여 파기' },
                                      scheduled: { fg: 'var(--orange)', bg: 'var(--orange-dim)',  title: scheduledAtKst ? `타임락 예약 — ${scheduledAtKst} KST 자동 발송` : '타임락 예약됨' },
                                      paid:      { fg: 'white',         bg: 'var(--blue)',        title: '수납 완료 — 탭하여 취소' },
                                      cancelled: { fg: 'var(--red)',    bg: 'var(--red-dim)',     title: '취소됨 — 탭하여 재발송' },
                                    }
                                    const s = styles[billStatus]
                                    const resendCount = bill?.resend_count ?? 0
                                    const showBadge = billStatus === 'sent' && resendCount > 0
                                    return (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          if (billStatus === 'scheduled') return // 예약건은 상호작용 없음 (정보 표시만)
                                          if ((billStatus === 'sent' || billStatus === 'paid') && bill) {
                                            setBillActionTarget({
                                              studentId: student.id,
                                              studentName: student.name,
                                              phone: student.parent_phone || student.phone || '',
                                              billId: bill.bill_id,
                                              amount: bill.amount,
                                              status: billStatus,
                                            })
                                          } else {
                                            const parentPhone = student.parent_phone || student.phone || ''
                                            setBillSendTarget({ studentId: student.id, studentName: student.name, phone: parentPhone, amount: fee, subject: cls.subject ?? null, className: cls.name ?? null, electives: student.electives ?? [] })
                                          }
                                        }}
                                        className="relative p-1 rounded-lg transition-colors shrink-0 hover:opacity-80 flex items-center justify-center"
                                        style={{ color: s.fg, background: s.bg }}
                                        aria-label={showBadge ? `${s.title} — 재발송 ${resendCount}회` : s.title}
                                        title={showBadge ? `${s.title} · 재발송 ${resendCount}회` : s.title}
                                      >
                                        {billStatus === 'sent' ? (
                                          <Mail className="w-3.5 h-3.5" />
                                        ) : billStatus === 'cancelled' ? (
                                          // 종이비행기 180° 회전 (앞코가 좌하단) + 대각선 취소선(╲) (inline SVG)
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                            <g opacity="0.5" transform="rotate(180 12 12)">
                                              <path d="m22 2-7 20-4-9-9-4Z" />
                                              <path d="M22 2 11 13" />
                                            </g>
                                            <line x1="3.5" y1="3.5" x2="20.5" y2="20.5" />
                                          </svg>
                                        ) : (
                                          <Send className="w-3.5 h-3.5" />
                                        )}
                                        {billStatus === 'scheduled' && (
                                          <span
                                            className="absolute -bottom-1 -right-1 w-[12px] h-[12px] rounded-full flex items-center justify-center"
                                            style={{ background: 'var(--orange)', color: 'white' }}
                                            aria-hidden
                                          >
                                            <Clock className="w-[8px] h-[8px]" strokeWidth={3} />
                                          </span>
                                        )}
                                        {showBadge && (
                                          <span
                                            className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-1 rounded-full flex items-center justify-center text-[9px] font-bold leading-none"
                                            style={{ background: 'var(--red)', color: 'white' }}
                                            aria-hidden
                                          >
                                            {resendCount}
                                          </span>
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
                                  {prevMethodNonPayssam && (
                                    <p className="text-[11px] text-[var(--orange)] leading-tight">
                                      지난달: {PAYMENT_METHOD_LABELS[prevMethodNonPayssam]}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                            </div>
                          </div>
                          {/* 아래층: 입력 공간 — 단일 선택일 때만 (다중선택은 상단 툴바) */}
                          {/* 비고 입력 — framer-motion height:auto (iOS Safari 포함 전브라우저 호환) */}
                          <AnimatePresence initial={false}>
                            {isSoleMemoSelection && (
                              <motion.div
                                key="memo-input"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  height: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                                  opacity: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                                }}
                                style={{ overflow: 'hidden' }}
                              >
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
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {/* 결제특이사항 입력 — 동일 패턴 */}
                          <AnimatePresence initial={false}>
                            {isSwipeOpen && openSide === 'right' && (
                              <motion.div
                                key="pay-memo-input"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{
                                  height: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
                                  opacity: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                                }}
                                style={{ overflow: 'hidden' }}
                              >
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
                              </motion.div>
                            )}
                          </AnimatePresence>
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
          className={billSendTarget.className}
          billingMonth={selectedMonth}
          electives={billSendTarget.electives}
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
          studentId={billActionTarget.studentId}
          studentName={billActionTarget.studentName}
          phone={billActionTarget.phone}
          billId={billActionTarget.billId}
          amount={billActionTarget.amount}
          status={billActionTarget.status}
          billingMonth={selectedMonth}
          onClose={() => setBillActionTarget(null)}
          onSuccess={() => { fetchData(); mutateBills() }}
        />
      )}

      {bulkBillTarget && (
        <BulkBillSendModal
          className={bulkBillTarget.className}
          targets={bulkBillTarget.targets}
          onClose={() => setBulkBillTarget(null)}
          onConfirm={executeBulkSend}
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

      {/* 일괄발송 결과 토스트 */}
      {batchResultToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-3 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-lg text-sm font-medium text-[var(--text-1)] max-w-md">
          {batchResultToast}
        </div>
      )}

      <AiFilterButton
        aiFilterIds={aiFilterIds}
        aiFilterDesc={aiFilterDesc}
        onFilter={handleAiFilter}
        onClear={clearAiFilter}
        loading={aiFilterLoading}
      />
    </div>
  )
}
