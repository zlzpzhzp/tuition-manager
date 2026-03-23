'use client'

import { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Check, ClipboardList, Download, Plus } from 'lucide-react'
import type { Grade, Class, Student, Payment, PaymentMethod, GradeWithClasses } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/types'
import PaymentModal from '@/components/PaymentModal'
import StudentModal from '@/components/StudentModal'
import DatePickerPopup from '@/components/payments/DatePickerPopup'
import MethodPickerPopup from '@/components/payments/MethodPickerPopup'
import AiFilterButton from '@/components/payments/AiFilterButton'
import { getPrevMonth, formatMonth, getPaymentDueDay, isPaymentScheduled, getUnpaidLabelText, getActiveStudents, isWithdrawnStudent, safeMutate, decodePaymentMemo, useGrades, usePayments, revalidateGrades, revalidatePayments } from '@/lib/utils'
import { METHOD_OPTIONS_SHORT } from '@/lib/constants'

export default function PaymentsPage() {
  const today = new Date().toISOString().split('T')[0]

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
  const [inlineDate, setInlineDate] = useState(today)
  const [inlineMethod, setInlineMethod] = useState<PaymentMethod>('remote')
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null)
  const [showMethodPicker, setShowMethodPicker] = useState(false)
  const [inlineMemo, setInlineMemo] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [datePickerPos, setDatePickerPos] = useState({ top: 0, left: 0 })
  const [methodPickerPos, setMethodPickerPos] = useState({ top: 0, right: 0 })
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
  const [editFeeValue, setEditFeeValue] = useState('')
  const [editDueDayValue, setEditDueDayValue] = useState('')
  const touchRef = useRef<{
    startX: number; startY: number; currentX: number
    id: string; el: HTMLElement
    decided: boolean; isHorizontal: boolean
  } | null>(null)
  const wasSwiped = useRef(false)

  // 학생 추가 모달
  const [showStudentModal, setShowStudentModal] = useState(false)
  const [addStudentClassId, setAddStudentClassId] = useState<string | null>(null)

  // 반 접기/펼치기 (기본: 접힘)
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const toggleClass = (classId: string) => {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      next.has(classId) ? next.delete(classId) : next.add(classId)
      return next
    })
  }

  // 미납 필터
  const [showUnpaidOnly, setShowUnpaidOnly] = useState(false)

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

  const summaryStats = useMemo(() => {
    const totalFee = allStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
    const unpaidStudents = allStudents.filter(s => {
      const paid = (paymentsByStudentId.get(s.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
      return getPaymentStatus(paid, getStudentFee(s, s.class)) === 'unpaid'
    })
    const unpaidCount = unpaidStudents.filter(s => !checkScheduled(s, selectedMonth)).length
    const scheduledCount = unpaidStudents.filter(s => checkScheduled(s, selectedMonth)).length
    return { totalFee, totalPaid, unpaidCount, scheduledCount }
  }, [allStudents, payments, paymentsByStudentId, selectedMonth])

  // ─── Helpers ──────────────────────────────────────────────────
  const navigateMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const getStudentPayments = useCallback((studentId: string) =>
    paymentsByStudentId.get(studentId) ?? []
  , [paymentsByStudentId])

  const getPrevMemo = useCallback((studentId: string): string | null => {
    const prev = prevPayments.find(p => p.student_id === studentId)
    return prev?.memo || null
  }, [prevPayments])

  const getDueDay = useCallback((student: Student): number =>
    student.payment_due_day ?? getPaymentDueDay(student)
  , [])

  function checkScheduled(student: Student, month: string): boolean {
    return isPaymentScheduled(student, month, student.payment_due_day ?? undefined)
  }

  // ─── Discuss ────────────────────────────────────────────────
  const [discussInputId, setDiscussInputId] = useState<string | null>(null)
  const [discussMemoValue, setDiscussMemoValue] = useState('')

  const toggleDiscuss = async (id: string) => {
    const student = allStudents.find(s => s.id === id)
    if (!student) return
    if (student.has_discuss) {
      // 해제: discuss off + memo 제거
      await safeMutate(`/api/students/${id}`, 'PUT', { has_discuss: false, memo: null })
      setDiscussInputId(null)
      fetchData()
    } else {
      // 켜기: discuss on + 이유 입력 칸 열기
      await safeMutate(`/api/students/${id}`, 'PUT', { has_discuss: true })
      fetchData()
      setDiscussInputId(id)
      setDiscussMemoValue('')
    }
  }

  const saveDiscussMemo = async (id: string) => {
    if (!discussMemoValue.trim()) {
      setDiscussInputId(null)
      return
    }
    await safeMutate(`/api/students/${id}`, 'PUT', { memo: discussMemoValue.trim() })
    setDiscussInputId(null)
    fetchData()
  }

  // ─── Swipe handlers ──────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent, studentId: string) => {
    if (expandedStudentId) return
    const touch = e.touches[0]
    const el = e.currentTarget as HTMLElement
    touchRef.current = {
      startX: touch.clientX, startY: touch.clientY, currentX: touch.clientX,
      id: studentId, el, decided: false, isHorizontal: false,
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
    const clamped = Math.max(-160, Math.min(100, dx))
    touchRef.current.el.style.transform = `translateX(${clamped}px)`
    touchRef.current.el.style.transition = 'none'
  }

  const handleTouchEnd = () => {
    if (!touchRef.current) return
    const { el, id, isHorizontal, startX, currentX } = touchRef.current
    const dx = currentX - startX
    el.style.transition = 'transform 0.3s ease'

    if (isHorizontal && Math.abs(dx) > 10) {
      wasSwiped.current = true
      setTimeout(() => { wasSwiped.current = false }, 200)
    }

    if (isHorizontal) {
      if (dx > 60) {
        toggleDiscuss(id)
        el.style.transform = 'translateX(0)'
        if (swipeOpenId === id) setSwipeOpenId(null)
      } else if (dx < -60) {
        if (swipeOpenId && swipeOpenId !== id) {
          const prevEl = document.querySelector(`[data-swipe-row="${swipeOpenId}"]`) as HTMLElement | null
          if (prevEl) { prevEl.style.transition = 'transform 0.3s ease'; prevEl.style.transform = 'translateX(0)' }
        }
        el.style.transform = 'translateX(-150px)'
        const student = allStudents.find(s => s.id === id)
        if (student) {
          setSwipeOpenId(id)
          setEditFeeValue(String(Math.round(getStudentFee(student, student.class) / 10000)))
          setEditDueDayValue(String(getDueDay(student)))
        }
      } else {
        el.style.transform = swipeOpenId === id ? 'translateX(-150px)' : 'translateX(0)'
      }
    } else {
      el.style.transform = swipeOpenId === id ? 'translateX(-150px)' : 'translateX(0)'
    }
    touchRef.current = null
  }

  const closeSwipeEdit = () => {
    if (swipeOpenId) {
      const el = document.querySelector(`[data-swipe-row="${swipeOpenId}"]`) as HTMLElement | null
      if (el) { el.style.transition = 'transform 0.3s ease'; el.style.transform = 'translateX(0)' }
      setSwipeOpenId(null)
    }
  }

  const handleSaveEdit = async (studentId: string) => {
    const feeNum = parseFloat(editFeeValue)
    const dayNum = parseInt(editDueDayValue)

    const updates: Record<string, unknown> = {}
    if (!isNaN(feeNum) && feeNum >= 0) updates.custom_fee = Math.round(feeNum * 10000)
    if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) updates.payment_due_day = dayNum

    if (Object.keys(updates).length > 0) {
      const { error } = await safeMutate(`/api/students/${studentId}`, 'PUT', updates)
      if (error) { alert('수정 실패'); return }
    }

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
    setInlineMethod(prevPayment?.method as PaymentMethod || 'remote')
    setShowMethodPicker(false)
    setShowDatePicker(false)
    setInlineMemo('')
  }

  const handleInlineSubmit = async (studentId: string, fee: number) => {
    if (inlineSuccess) return
    const { error } = await safeMutate('/api/payments', 'POST', {
      student_id: studentId, amount: fee, method: inlineMethod,
      payment_date: inlineDate, billing_month: selectedMonth,
      ...(inlineMemo.trim() ? { memo: inlineMemo.trim() } : {}),
    })
    if (error) {
      alert(`결제 처리 실패: ${error}`)
      return
    }
    setInlineSuccess(studentId)
    setTimeout(async () => {
      await fetchData()
      setInlineSuccess(null)
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
        has_discuss: s.has_discuss ?? false,
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
  if (loading) return (
    <div className="animate-pulse" style={{ padding: '0 16px' }}>
      <div className="flex items-center justify-center gap-3 py-6">
        <div className="w-10 h-10 rounded-lg" style={{ background: '#E5E7EB' }}></div>
        <div className="h-10 rounded w-56 sm:w-72" style={{ background: '#E5E7EB' }}></div>
        <div className="w-10 h-10 rounded-lg" style={{ background: '#E5E7EB' }}></div>
      </div>
      {[...Array(2)].map((_, gi) => (
        <div key={gi} className="mb-4">
          <div className="h-4 rounded w-20 mb-2" style={{ background: '#E5E7EB' }}></div>
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', overflow: 'hidden' }}>
            {[...Array(4)].map((_, si) => (
              <div key={si} className="flex items-center gap-2" style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--separator)' }}>
                <div className="h-4 rounded w-14 flex-1" style={{ background: '#E5E7EB' }}></div>
                <div className="h-5 rounded-full w-16" style={{ background: '#E5E7EB' }}></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  if (error) return (
    <div className="text-center py-12">
      <p style={{ color: 'var(--color-red)' }} className="mb-4">{error?.message || '데이터 로딩 실패'}</p>
      <button onClick={fetchData} className="ios-tap" style={{ background: 'var(--accent)', color: '#fff', padding: '10px 20px', borderRadius: 8 }}>다시 시도</button>
    </div>
  )

  return (
    <div ref={containerRef} onClick={() => { if (swipeOpenId) closeSwipeEdit() }}>
      {/* 월 선택 헤더 */}
      <div className="sticky top-0 z-30" style={{ background: 'var(--bg-primary)', paddingTop: 8, paddingBottom: 8 }}>
        {/* Pull-to-refresh 인디케이터 */}
        <div
          className="flex items-center justify-center overflow-hidden"
          style={{ height: pullDistance > 0 ? `${pullDistance}px` : '0px', transition: 'height 0.2s ease-out' }}
        >
          <div className={isRefreshing ? 'animate-spin' : ''}
            style={{ transform: `rotate(${Math.min(pullDistance / PULL_THRESHOLD, 1) * 360}deg)`, transition: 'transform 0.2s' }}
          >
            <svg className="w-6 h-6" style={{ color: 'var(--text-secondary)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
        </div>
        <div className="flex items-center justify-center gap-3 mb-1">
          <button onClick={() => navigateMonth(-1)} className="ios-tap" style={{ padding: 8, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="이전 달">
            <ChevronLeft style={{ width: 24, height: 24, color: 'var(--text-secondary)' }} />
          </button>
          <h1 style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.2, textAlign: 'center', color: 'var(--text-primary)' }}>
            {selectedMonth.split('-')[0]}년 {parseInt(selectedMonth.split('-')[1])}월
          </h1>
          <button onClick={() => navigateMonth(1)} className="ios-tap" style={{ padding: 8, minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-label="다음 달">
            <ChevronRight style={{ width: 24, height: 24, color: 'var(--text-secondary)' }} />
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
            className="ios-tap"
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 13, fontWeight: 400, color: 'var(--color-blue)' }}
          >
            <Download style={{ width: 12, height: 12 }} />
            <span>내보내기</span>
          </button>
        </div>
      </div>

      {/* 과목별 → 학년별 납부 현황 */}
      {subjectGradeGroups.map(({ subject, grades: subjectGrades }, groupIndex) => {
        // 과목 전체에 표시할 학생이 있는지 확인
        const hasVisibleStudents = subjectGrades.some(({ classes: gradeClasses }) =>
          gradeClasses.some(cls => {
            let students = aiFilterIds
              ? getActiveStudents(cls.students ?? [], selectedMonth).filter(s => aiFilterIds.has(s.id))
              : getActiveStudents(cls.students ?? [], selectedMonth)
            if (showUnpaidOnly) {
              students = students.filter(s => {
                const paid = (paymentsByStudentId.get(s.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
                const status = getPaymentStatus(paid, getStudentFee(s, cls))
                if (status === 'paid') return false
                if (status === 'unpaid' && checkScheduled(s, selectedMonth)) return false
                return true
              })
            }
            return students.length > 0
          })
        )
        if (!hasVisibleStudents) return null

        return (
          <div key={subject} style={{ marginBottom: 24 }}>
            <div style={{ padding: '0 16px', marginBottom: 8 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: 'var(--text-primary)' }}>{subject}</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(() => { let isFirstVisibleGrade = groupIndex === 0; return subjectGrades.map(({ gradeId, gradeName, classes: gradeClasses }) => {
              // 이 학년에 표시할 학생이 있는지
              const hasGradeStudents = gradeClasses.some(cls => {
                let students = aiFilterIds
                  ? getActiveStudents(cls.students ?? [], selectedMonth).filter(s => aiFilterIds.has(s.id))
                  : getActiveStudents(cls.students ?? [], selectedMonth)
                if (showUnpaidOnly) {
                  students = students.filter(s => {
                    const paid = (paymentsByStudentId.get(s.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
                    const status = getPaymentStatus(paid, getStudentFee(s, cls))
                    if (status === 'paid') return false
                    if (status === 'unpaid' && checkScheduled(s, selectedMonth)) return false
                    return true
                  })
                }
                return students.length > 0
              })
              if (!hasGradeStudents) return null

              const showFilter = isFirstVisibleGrade
              if (isFirstVisibleGrade) isFirstVisibleGrade = false

              return (
                <div key={gradeId}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.3, color: 'var(--text-secondary)' }}>{gradeName}</span>
                    <div style={{ flex: 1 }} />
                    {showFilter && (
                      <button
                        onClick={() => {
                          setShowUnpaidOnly(prev => {
                            if (!prev) {
                              const allClassIds = new Set(grades.flatMap(g => g.classes.map(c => c.id)))
                              setExpandedClasses(allClassIds)
                            } else {
                              setExpandedClasses(new Set())
                            }
                            return !prev
                          })
                        }}
                        className="ios-tap"
                        style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-blue)' }}
                      >
                        {showUnpaidOnly ? '미납' : '전체'}
                      </button>
                    )}
                  </div>
                  <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', margin: '0 16px', overflow: 'hidden' }}>
                  {gradeClasses.map(cls => {
                const allClassStudents = getActiveStudents(cls.students ?? [], selectedMonth)
                let students = aiFilterIds ? allClassStudents.filter(s => aiFilterIds.has(s.id)) : allClassStudents
                if (showUnpaidOnly) {
                  students = students.filter(s => {
                    const paid = (paymentsByStudentId.get(s.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
                    const status = getPaymentStatus(paid, getStudentFee(s, cls))
                    if (status === 'paid') return false
                    if (status === 'unpaid' && checkScheduled(s, selectedMonth)) return false
                    return true
                  })
                }
                if (students.length === 0) return null

                const paidCount = students.filter(s => {
                  const paid = (paymentsByStudentId.get(s.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
                  return getPaymentStatus(paid, getStudentFee(s, cls)) === 'paid'
                }).length
                const isClassExpanded = expandedClasses.has(cls.id)

                return (
                  <div key={cls.id}>
                    <div
                      className="ios-tap select-none"
                      style={{
                        display: 'flex', alignItems: 'center', minHeight: 44,
                        padding: '0 16px', cursor: 'pointer',
                        borderBottom: '0.5px solid var(--separator)',
                      }}
                      onClick={() => toggleClass(cls.id)}
                    >
                      <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4, color: 'var(--text-primary)' }}>{cls.name}</span>
                      <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>
                        {cls.monthly_fee > 0 ? `${cls.monthly_fee.toLocaleString()}원` : ''}
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>{paidCount}/{students.length}</span>
                      <span style={{ flex: 1 }} />
                      <ChevronRight style={{ width: 16, height: 16, color: 'var(--text-tertiary)', transform: isClassExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAddStudent(cls.id) }}
                        className="ios-tap"
                        style={{ padding: 4, color: 'var(--text-secondary)', marginLeft: 4 }}
                        aria-label={`${cls.name}에 학생 추가`}
                      >
                        <Plus style={{ width: 16, height: 16 }} />
                      </button>
                    </div>
                    <div
                      className="grid transition-[grid-template-rows] duration-300 ease-in-out overflow-hidden"
                      style={{ gridTemplateRows: isClassExpanded ? '1fr' : '0fr' }}
                    >
                    <div className="min-h-0">
                    {students.map(student => {
                      const fee = getStudentFee(student, cls)
                      const studentPayments = getStudentPayments(student.id)
                      const paid = studentPayments.reduce((s, p) => s + p.amount, 0)
                      const status = getPaymentStatus(paid, fee)
                      const scheduled = status === 'unpaid' && checkScheduled(student, selectedMonth)
                      const displayColors = scheduled ? { bg: '#FEF3C7', text: '#92400E' } : PAYMENT_STATUS_COLORS[status]
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
                      const { cleanMemo } = decodePaymentMemo(currentMemo)
                      const hasMemo = !!(prevMemo || cleanMemo)
                      const hasDiscuss = student.has_discuss ?? false
                      const isSwipeOpen = swipeOpenId === student.id
                      const withdrawn = isWithdrawnStudent(student)

                      return (
                        <div key={student.id} className="relative overflow-hidden">
                          {/* 왼쪽 스와이프 액션 */}
                          <div className={`absolute inset-y-0 left-0 w-24 flex items-center justify-center ${hasDiscuss ? 'bg-gray-300' : 'bg-rose-200'}`}>
                            <span className={`font-bold text-xs ${hasDiscuss ? 'text-gray-500' : 'text-rose-500'}`}>{hasDiscuss ? '해제' : 'DISCUSS'}</span>
                          </div>

                          {/* 오른쪽 수정 패널 */}
                          <div className="absolute inset-y-0 right-0 w-[150px] flex items-center gap-1.5 px-2 bg-violet-50" onClick={e => e.stopPropagation()}>
                            <div className="flex flex-col items-center">
                              <label htmlFor={`dueday-${student.id}`} className="text-[8px] text-violet-400 mb-0.5 font-medium">결제일</label>
                              <input
                                id={`dueday-${student.id}`}
                                type="number"
                                value={isSwipeOpen ? editDueDayValue : ''}
                                onChange={e => setEditDueDayValue(e.target.value)}
                                className="w-10 px-1 py-1 text-xs border border-violet-200 rounded-lg text-center bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                                min={1} max={31}
                              />
                            </div>
                            <div className="flex flex-col items-center">
                              <label htmlFor={`fee-${student.id}`} className="text-[8px] text-violet-400 mb-0.5 font-medium">원비(만)</label>
                              <input
                                id={`fee-${student.id}`}
                                type="number"
                                value={isSwipeOpen ? editFeeValue : ''}
                                onChange={e => setEditFeeValue(e.target.value)}
                                className="w-12 px-1 py-1 text-xs border border-violet-200 rounded-lg text-center bg-white focus:outline-none focus:ring-1 focus:ring-violet-300"
                              />
                            </div>
                            <button onClick={() => handleSaveEdit(student.id)} className="p-1.5 bg-violet-400 hover:bg-violet-500 text-white rounded-full shrink-0 shadow-sm transition-colors" aria-label="저장">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* 메인 콘텐츠 */}
                          <div
                            data-swipe-row={student.id}
                            className="relative z-10"
                            style={{ background: 'var(--bg-card)', ...(isSwipeOpen ? { transform: 'translateX(-150px)', transition: 'transform 0.3s ease' } : {}) }}
                            onTouchStart={e => handleTouchStart(e, student.id)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                          >
                            <div
                              className={`${status === 'unpaid' && !isExpanded && !withdrawn ? 'ios-tap cursor-pointer' : ''}`}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: hasMemo && !isExpanded ? '6px 16px 2px' : '6px 16px',
                                minHeight: 44,
                                borderBottom: '0.5px solid var(--separator)',
                                opacity: withdrawn ? 0.5 : 1,
                              }}
                              onClick={status === 'unpaid' && !isExpanded && !withdrawn ? () => handleExpand(student.id) : undefined}
                            >
                              {hasDiscuss && (
                                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(175,82,222,0.12)', color: 'var(--color-purple)', fontWeight: 700, flexShrink: 0 }}>DISCUSS</span>
                              )}
                              <Link
                                href={`/students/${student.id}`}
                                style={{ flex: 1, minWidth: 0 }}
                                onClick={e => { if (wasSwiped.current) e.preventDefault(); e.stopPropagation() }}
                              >
                                <span style={{
                                  fontSize: 17, fontWeight: 600, lineHeight: 1.4,
                                  ...(withdrawn ? { textDecoration: 'line-through', color: 'var(--text-tertiary)' } : {}),
                                }}>{student.name}</span>
                                {withdrawn && <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 6 }}>퇴원</span>}
                                {hasDiscuss && student.memo && (
                                  <p style={{ fontSize: 12, color: 'var(--color-purple)', fontWeight: 600, lineHeight: 1.3 }}>
                                    {student.memo}
                                  </p>
                                )}
                              </Link>

                              {isExpanded ? (
                                <div className="flex flex-col items-end gap-1" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      ref={dateButtonRef}
                                      type="button"
                                      onClick={() => {
                                        if (!showDatePicker && dateButtonRef.current) {
                                          const rect = dateButtonRef.current.getBoundingClientRect()
                                          setDatePickerPos({ top: rect.bottom + 4, left: Math.max(8, rect.left) })
                                        }
                                        setShowDatePicker(!showDatePicker)
                                        setShowMethodPicker(false)
                                      }}
                                      className="fan-item ios-tap"
                                      style={{ padding: '3px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, background: 'rgba(255,149,0,0.12)', color: 'var(--color-orange)', whiteSpace: 'nowrap' }}
                                      aria-label="결제일 선택"
                                    >
                                      {(() => { const d = new Date(inlineDate); return `${d.getMonth()+1}/${d.getDate()}` })()}
                                      <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 2 }}>▼</span>
                                    </button>
                                    <button
                                      ref={methodButtonRef}
                                      type="button"
                                      onClick={() => {
                                        if (!showMethodPicker && methodButtonRef.current) {
                                          const rect = methodButtonRef.current.getBoundingClientRect()
                                          setMethodPickerPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                                        }
                                        setShowMethodPicker(!showMethodPicker)
                                        setShowDatePicker(false)
                                      }}
                                      className="fan-item ios-tap"
                                      style={{ padding: '3px 8px', borderRadius: 6, fontSize: 13, fontWeight: 600, background: 'rgba(0,122,255,0.12)', color: 'var(--color-blue)', display: 'flex', alignItems: 'center', gap: 2, whiteSpace: 'nowrap' }}
                                      aria-label="결제수단 선택"
                                    >
                                      {METHOD_OPTIONS_SHORT.find(([v]) => v === inlineMethod)?.[1]}
                                      <span style={{ fontSize: 9, opacity: 0.5 }}>▼</span>
                                    </button>
                                    <button
                                      onClick={() => handleInlineSubmit(student.id, fee)}
                                      disabled={!!inlineSuccess}
                                      className="fan-item ios-tap"
                                      style={{
                                        padding: '3px 10px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                                        background: isSuccess ? 'var(--color-green)' : 'var(--accent)',
                                        color: '#fff',
                                        height: 44,
                                        transition: 'all 0.15s',
                                      }}
                                      aria-label="납부 처리"
                                    >
                                      {isSuccess ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : '납부'}
                                    </button>
                                    <button
                                      onClick={() => handleOpenModal(student.id, fee)}
                                      className="fan-item ios-tap"
                                      style={{ padding: 4, color: 'var(--accent)' }}
                                      aria-label="상세 납부 기록"
                                    >
                                      <ClipboardList style={{ width: 16, height: 16 }} />
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={inlineMemo}
                                    onChange={e => setInlineMemo(e.target.value)}
                                    placeholder="비고"
                                    className="fan-item"
                                    style={{ width: '100%', padding: '6px 10px', borderRadius: 8, fontSize: 13, border: '0.5px solid var(--separator)', outline: 'none', background: 'var(--bg-card)' }}
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
                                      <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                        {parseInt(selectedMonth.split('-')[1])}/{getDueDay(student)} {methodLabel}
                                      </span>
                                    )
                                  })()}
                                  {(() => {
                                    let badgeBg: string, badgeColor: string
                                    if (status === 'paid') {
                                      badgeBg = 'rgba(52,199,89,0.12)'; badgeColor = 'var(--color-green)'
                                    } else if (status === 'partial') {
                                      badgeBg = 'rgba(255,149,0,0.12)'; badgeColor = 'var(--color-orange)'
                                    } else if (scheduled) {
                                      badgeBg = 'rgba(255,149,0,0.12)'; badgeColor = 'var(--color-orange)'
                                    } else {
                                      badgeBg = 'rgba(255,59,48,0.12)'; badgeColor = 'var(--color-red)'
                                    }
                                    return status !== 'unpaid' ? (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); handleOpenModal(student.id, fee) }}
                                        className="ios-tap"
                                        style={{ padding: '4px 8px', borderRadius: 12, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', background: badgeBg, color: badgeColor }}
                                        role="status"
                                      >
                                        {displayLabel}
                                      </button>
                                    ) : (
                                      <span
                                        style={{ padding: '4px 8px', borderRadius: 12, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', background: badgeBg, color: badgeColor }}
                                        role="status"
                                      >
                                        {displayLabel}
                                      </span>
                                    )
                                  })()}
                                </>
                              )}
                            </div>
                            {!isExpanded && hasMemo && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 16px 4px' }}>
                                <div style={{ textAlign: 'right' }}>
                                  {cleanMemo && <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.3 }}>{cleanMemo}</p>}
                                  {prevMemo && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>지난달: {prevMemo}</p>}
                                </div>
                              </div>
                            )}
                            {discussInputId === student.id && (
                              <div style={{ display: 'flex', gap: 6, padding: '0 16px 8px' }}>
                                <input
                                  type="text"
                                  value={discussMemoValue}
                                  onChange={e => setDiscussMemoValue(e.target.value)}
                                  placeholder="사유 입력 (예: 수강료 조정 논의)"
                                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: 13, border: '0.5px solid var(--color-purple)', outline: 'none', background: 'rgba(175,82,222,0.04)' }}
                                  autoFocus
                                  onKeyDown={e => { if (e.key === 'Enter') saveDiscussMemo(student.id) }}
                                />
                                <button
                                  onClick={() => saveDiscussMemo(student.id)}
                                  className="ios-tap"
                                  style={{ padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: 'rgba(175,82,222,0.12)', color: 'var(--color-purple)', flexShrink: 0 }}
                                >
                                  저장
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    </div>
                    </div>
                  </div>
                )
              })}
                  </div>
                </div>
              )
            }) })()}
            </div>
          </div>
        )
      })}

      {allStudents.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-tertiary)', fontSize: 15 }}>등록된 학생이 없습니다</div>
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

      {showDatePicker && (
        <DatePickerPopup
          inlineDate={inlineDate}
          onDateChange={setInlineDate}
          position={datePickerPos}
          onClose={() => setShowDatePicker(false)}
        />
      )}

      {showMethodPicker && (
        <MethodPickerPopup
          currentMethod={inlineMethod}
          onMethodChange={setInlineMethod}
          position={methodPickerPos}
          onClose={() => setShowMethodPicker(false)}
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
