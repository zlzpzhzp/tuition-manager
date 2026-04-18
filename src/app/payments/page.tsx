'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Check, ChevronDown, ClipboardList, Download, Plus, Send, Mail, Loader2 } from 'lucide-react'
import type { Student, Payment, PaymentMethod, GradeWithClasses } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/types'
import PaymentModal from '@/components/PaymentModal'
import StudentModal from '@/components/StudentModal'
import DatePickerPopup from '@/components/payments/DatePickerPopup'
import MethodPickerPopup from '@/components/payments/MethodPickerPopup'
import AiFilterButton from '@/components/payments/AiFilterButton'
import { getPrevMonth, getPaymentDueDay, isPaymentScheduled, getUnpaidLabelText, getActiveStudents, isWithdrawnStudent, safeMutate, decodePaymentMemo, useGrades, usePayments, revalidateGrades, revalidatePayments, getTodayString } from '@/lib/utils'
import { METHOD_OPTIONS_SHORT } from '@/lib/constants'
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
  const [billSendTarget, setBillSendTarget] = useState<{ studentId: string; studentName: string; phone: string; amount: number } | null>(null)
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
  const [filterOpen, setFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
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

  // AI 필터
  const [aiFilterIds, setAiFilterIds] = useState<Set<string> | null>(null)
  const [aiFilterDesc, setAiFilterDesc] = useState('')
  const [aiFilterLoading, setAiFilterLoading] = useState(false)

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
      productName: `${selectedMonth.replace('-', '년 ')}월 수업료`,
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
          let students = aiFilterIds ? active.filter(s => aiFilterIds.has(s.id)) : active
          students = students.filter(s => passesFilter(s, cls))
          if (students.length > 0) classIds.push(cls.id)
        }
        if (classIds.length === 0) continue
        list.push({ key: `${subject}__${gradeId}`, classIds })
      }
    }
    return list
  }, [subjectGradeGroups, selectedMonth, aiFilterIds, passesFilter])

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
  useEffect(() => {
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
      document.documentElement.style.removeProperty('--grade-sticky-top')
    }
  }, [])

  // 필터 드롭다운 외부 클릭 닫기
  useEffect(() => {
    if (!filterOpen) return
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [filterOpen])

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

  // ─── Swipe handlers (swipe-action-guide.md 기반) ──────────────
  const SPRING = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
  const MEMO_W = 200  // 왼쪽 비고 입력 패널 너비 (컬러 피커 포함)
  const PAY_W = 150   // 오른쪽 결제 특이사항 입력 패널 너비

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

  // ─── AI filter ────────────────────────────────────────────────
  const handleAiFilter = async (query: string) => {
    setAiFilterLoading(true)
    const studentContext = allStudents.map(s => {
      const sp = getStudentPayments(s.id)
      const fee = getStudentFee(s, s.class)
      const paid = sp.reduce((sum, p) => sum + p.amount, 0)
      return {
        id: s.id, name: s.name, grade: '', class_name: s.class?.name || '',
        fee, paid, status: getPaymentStatus(paid, fee),
        due_day: getDueDay(s), payment_method: sp[0]?.method || null,
        payment_date: sp[0]?.payment_date || null,
        current_memo: sp[0]?.memo || null, prev_memo: getPrevMemo(s.id),
      }
    })

    try {
      const res = await fetch('/api/agent/filter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    } catch { alert('AI 필터 처리 중 오류가 발생했습니다.') }
    setAiFilterLoading(false)
  }

  const clearAiFilter = () => { setAiFilterIds(null); setAiFilterDesc('') }

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
      clearAiFilter()
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
      {/* 월 네비게이션 — sticky 고정 */}
      <div data-sticky-header className="sticky top-14 z-30 bg-[var(--bg)] -mx-4 px-4 pt-3 pb-1 -mt-6">
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

      {/* 월별 메모 */}
      <div className="mb-4">
        <textarea
          value={monthMemo}
          onChange={e => {
            setMonthMemo(e.target.value)
            localStorage.setItem(`payment_memo_${selectedMonth}`, e.target.value)
          }}
          placeholder="메모..."
          className="w-full px-4 py-3 text-sm card resize-none focus:outline-none focus:ring-2 focus:ring-[var(--blue)] placeholder-[var(--text-4)]"
          rows={3}
        />
      </div>

      {/* 통합 필터 — 학년 레이블(중1)과 같은 Y좌표, 스크롤해도 따라다님 */}
      <div
        className="sticky z-30 pointer-events-none flex justify-end -mx-4 px-5 py-1.5 mb-1"
        style={{ top: 'var(--grade-sticky-top, 140px)' }}
      >
        <div ref={filterRef} className="relative pointer-events-auto">
          <button
            onClick={() => setFilterOpen(v => !v)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold transition-colors shadow-sm ${
              paymentFilter === 'unpaid'
                ? 'bg-[var(--red-dim)] text-[var(--unpaid-text)]'
                : paymentFilter !== 'all'
                  ? 'bg-[var(--blue-dim)] text-[var(--blue)]'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-2)] hover:bg-[var(--bg-card-hover)]'
            }`}
          >
            <span>{FILTER_LABELS[paymentFilter]}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          <AnimatePresence>
            {filterOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full mt-1 min-w-[140px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl overflow-hidden"
              >
                {(['all', 'unpaid', ...WEEK_KEYS] as PaymentFilter[]).map((key) => {
                  const active = paymentFilter === key
                  const isWeek = WEEK_KEYS.includes(key)
                  const range = isWeek ? weekRanges[key as Exclude<PaymentFilter, 'all' | 'unpaid'>] : null
                  const rangeLabel = range
                    ? range[0] > range[1] ? '-' : range[0] === range[1] ? `${range[0]}일` : `${range[0]}~${range[1]}`
                    : ''
                  return (
                    <button
                      key={key}
                      onClick={() => { setPaymentFilter(key); setFilterOpen(false) }}
                      className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors ${
                        active ? 'bg-[var(--blue)]/20 text-[var(--blue)]' : 'text-[var(--text-2)] hover:bg-[var(--bg-elevated)]'
                      }`}
                    >
                      <span>{FILTER_LABELS[key]}</span>
                      {rangeLabel && <span className="text-[10px] opacity-60 ml-2">{rangeLabel}</span>}
                    </button>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 과목별 → 학년별 납부 현황 */}
      {subjectGradeGroups.map(({ subject, grades: subjectGrades }) => {
        // 과목 전체에 표시할 학생이 있는지 확인
        const hasVisibleStudents = subjectGrades.some(({ classes: gradeClasses }) =>
          gradeClasses.some(cls => {
            let students = aiFilterIds
              ? getActiveStudents(cls.students ?? [], selectedMonth).filter(s => aiFilterIds.has(s.id))
              : getActiveStudents(cls.students ?? [], selectedMonth)
            students = students.filter(s => passesFilter(s, cls))
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
                let students = aiFilterIds
                  ? getActiveStudents(cls.students ?? [], selectedMonth).filter(s => aiFilterIds.has(s.id))
                  : getActiveStudents(cls.students ?? [], selectedMonth)
                students = students.filter(s => passesFilter(s, cls))
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

              return (
                <div key={gradeId} data-section-key={`${subject}__${gradeId}`}>
                  <div
                    className="sticky z-20 bg-[var(--bg)] -mx-4 px-5 py-1.5 mb-1"
                    style={{ top: 'var(--grade-sticky-top, 140px)' }}
                  >
                    <button
                      onClick={toggleGradeExpand}
                      className="flex items-center gap-0.5 active:opacity-70"
                    >
                      <motion.div animate={{ rotate: isGradeExpanded ? 90 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
                        <ChevronRight className="w-3.5 h-3.5 text-[var(--text-4)]" />
                      </motion.div>
                      <span className="text-xs text-[var(--text-4)]">{gradeName}</span>
                    </button>
                  </div>
                  <div className="card overflow-hidden">
                  {gradeClasses.map(cls => {
                const allClassStudents = getActiveStudents(cls.students ?? [], selectedMonth)
                let students = aiFilterIds ? allClassStudents.filter(s => aiFilterIds.has(s.id)) : allClassStudents
                students = students.filter(s => passesFilter(s, cls))
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
                        return (
                          <button
                            onClick={(e) => { e.stopPropagation(); sendClassBatch(cls) }}
                            disabled={!!batchSending}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--orange-dim)] text-[var(--orange)] hover:opacity-80 disabled:opacity-40 mr-1"
                            aria-label={`${cls.name} 일괄 청구서 발송`}
                            title={`미발송 ${eligibleCount}명 일괄 발송`}
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
                      const memoHighlight = memoColor === 'yellow' ? 'bg-yellow-400/20 text-yellow-200 px-1 rounded'
                        : memoColor === 'green' ? 'bg-green-400/20 text-green-200 px-1 rounded'
                        : memoColor === 'red' ? 'bg-red-400/20 text-red-200 px-1 rounded'
                        : 'text-[var(--text-3)]'
                      const withdrawn = isWithdrawnStudent(student)

                      return (
                        <div key={student.id} data-student-row={student.id} className="relative overflow-hidden">
                          {/* 왼쪽에서 끌어 → 비고 입력 + 색상 */}
                          <div data-edit-panel className="absolute inset-y-0 left-0 w-[200px] flex items-center gap-1.5 px-2 bg-[var(--bg-elevated)]" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={openSide === 'left' ? editMemoValue : ''}
                              onChange={e => setEditMemoValue(e.target.value)}
                              placeholder="비고"
                              className="flex-1 min-w-0 px-2 py-1 text-xs border border-[var(--border)] rounded-lg bg-[var(--bg-card)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveMemo(student.id) }}
                            />
                            <div className="flex items-center gap-1 shrink-0">
                              {(['yellow', 'green', 'red'] as const).map(c => {
                                const dot = c === 'yellow' ? 'bg-yellow-400' : c === 'green' ? 'bg-green-400' : 'bg-red-400'
                                const active = editMemoColor === c
                                return (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => setEditMemoColor(active ? null : c)}
                                    className={`w-4 h-4 rounded-full ${dot} ${active ? 'ring-2 ring-white/80' : 'opacity-60'}`}
                                    aria-label={`색상 ${c}`}
                                  />
                                )
                              })}
                            </div>
                            <button onClick={() => handleSaveMemo(student.id)} className="p-1.5 bg-[var(--blue)] hover:opacity-80 text-white rounded-full shrink-0 shadow-sm transition-opacity" aria-label="저장">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* 오른쪽에서 끌어 → 결제 특이사항 */}
                          <div data-edit-panel className="absolute inset-y-0 right-0 w-[150px] flex items-center gap-1.5 px-2 bg-[var(--bg-elevated)]" onClick={e => e.stopPropagation()}>
                            <input
                              type="text"
                              value={openSide === 'right' ? editPayMemoValue : ''}
                              onChange={e => setEditPayMemoValue(e.target.value)}
                              placeholder="결제메모"
                              className="flex-1 min-w-0 px-2 py-1 text-xs border border-[var(--border)] rounded-lg bg-[var(--bg-card)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
                              onKeyDown={e => { if (e.key === 'Enter') handleSavePayMemo(student.id) }}
                            />
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
                                {student.memo && (
                                  <p className="text-[11px] font-medium leading-tight mt-0.5">
                                    <span className={memoHighlight}>{student.memo}</span>
                                  </p>
                                )}
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
                                        setBillSendTarget({ studentId: student.id, studentName: student.name, phone: parentPhone, amount: fee })
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
                                  {!withdrawn && (student.parent_phone || student.phone) && (() => {
                                    const billStatus = getBillStatus(student.id)
                                    const bill = billByStudent.get(student.id)
                                    const styles: Record<BillStatus, { fg: string; bg: string; title: string }> = {
                                      unsent:    { fg: 'var(--text-4)', bg: 'var(--bg-elevated)', title: '카톡 청구서 발송' },
                                      sent:      { fg: 'var(--orange)', bg: 'var(--orange-dim)',  title: '발송됨 — 탭하여 파기' },
                                      paid:      { fg: 'white',         bg: 'var(--blue)',        title: '수납 완료 — 탭하여 취소' },
                                      cancelled: { fg: 'var(--red)',    bg: 'var(--red-dim)',     title: '취소됨 — 탭하여 재발송' },
                                    }
                                    const s = styles[billStatus]
                                    const isPaid = billStatus === 'paid'
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
                                            setBillSendTarget({ studentId: student.id, studentName: student.name, phone: parentPhone, amount: fee })
                                          }
                                        }}
                                        className={`${isPaid ? 'px-2 py-0.5' : 'p-1'} rounded-lg transition-colors shrink-0 hover:opacity-80 flex items-center justify-center`}
                                        style={{ color: s.fg, background: s.bg }}
                                        aria-label={s.title}
                                        title={s.title}
                                      >
                                        {billStatus === 'sent' ? (
                                          <Mail className="w-3.5 h-3.5" />
                                        ) : billStatus === 'paid' ? (
                                          <span className="text-[10px] font-bold leading-none">수납</span>
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
