'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Check, ClipboardList, Download, Sparkles, X, Loader2, ArrowRight } from 'lucide-react'
import type { Grade, Class, Student, Payment, PaymentMethod } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/types'
import PaymentModal from '@/components/PaymentModal'

type GradeWithClasses = Grade & { classes: (Class & { students: Student[] })[] }

const INLINE_METHODS: [PaymentMethod, string][] = [
  ['remote', '결제선생'],
  ['card', '카드'],
  ['transfer', '이체'],
  ['cash', '현금'],
  ['other', '기타'],
]

function getPrevMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** 학생의 결제 예정일 (등록일 기준 매월 같은 날) */
function getPaymentDueDay(student: Student): number {
  return new Date(student.enrollment_date).getDate()
}

export default function PaymentsPage() {
  const today = new Date().toISOString().split('T')[0]

  const [grades, setGrades] = useState<GradeWithClasses[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [prevPayments, setPrevPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // 인라인 납부 폼
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  const [inlineDate, setInlineDate] = useState(today)
  const [inlineMethod, setInlineMethod] = useState<PaymentMethod>('remote')
  const [inlineSuccess, setInlineSuccess] = useState<string | null>(null)
  const [showMethodPicker, setShowMethodPicker] = useState(false)
  const [inlineOtherMemo, setInlineOtherMemo] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [datePickerPos, setDatePickerPos] = useState({ top: 0, left: 0 })
  const [methodPickerPos, setMethodPickerPos] = useState({ top: 0, right: 0 })
  const dateButtonRef = useRef<HTMLButtonElement>(null)
  const methodButtonRef = useRef<HTMLButtonElement>(null)

  // 모달 (고급 옵션 / 납부 상세보기)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedStudentFee, setSelectedStudentFee] = useState(0)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [selectedPrevMemo, setSelectedPrevMemo] = useState<string | null>(null)

  // 스와이프: 상담 라벨 + 인라인 수정
  const [discussSet, setDiscussSet] = useState<Set<string>>(new Set())
  const [dueDayOverrides, setDueDayOverrides] = useState<Record<string, number>>({})
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null)
  const [editFeeValue, setEditFeeValue] = useState('')
  const [editDueDayValue, setEditDueDayValue] = useState('')
  const touchRef = useRef<{
    startX: number; startY: number; currentX: number
    id: string; el: HTMLElement
    decided: boolean; isHorizontal: boolean
  } | null>(null)
  const wasSwiped = useRef(false)

  // AI 필터
  const [aiFilterOpen, setAiFilterOpen] = useState(false)
  const [aiFilterQuery, setAiFilterQuery] = useState('')
  const [aiFilterLoading, setAiFilterLoading] = useState(false)
  const [aiFilterIds, setAiFilterIds] = useState<Set<string> | null>(null)
  const [aiFilterDesc, setAiFilterDesc] = useState('')
  const aiInputRef = useRef<HTMLInputElement>(null)

  const fetchData = useCallback(async () => {
    const prevMonth = getPrevMonth(selectedMonth)
    const [gradesRes, paymentsRes, prevPaymentsRes] = await Promise.all([
      fetch('/api/grades'),
      fetch(`/api/payments?billing_month=${selectedMonth}`),
      fetch(`/api/payments?billing_month=${prevMonth}`),
    ])
    const [gradesData, paymentsData, prevPaymentsData] = await Promise.all([
      gradesRes.json(),
      paymentsRes.json(),
      prevPaymentsRes.json(),
    ])
    setGrades(gradesData)
    setPayments(paymentsData)
    setPrevPayments(prevPaymentsData)
    setLoading(false)
  }, [selectedMonth])

  useEffect(() => { fetchData() }, [fetchData])

  // localStorage에서 상담/결제일 로드
  useEffect(() => {
    try {
      const d = localStorage.getItem('tuition_discuss')
      if (d) setDiscussSet(new Set(JSON.parse(d)))
      const dd = localStorage.getItem('tuition_due_days')
      if (dd) setDueDayOverrides(JSON.parse(dd))
    } catch { /* ignore */ }
  }, [])

  const navigateMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const formatMonth = (month: string) => {
    const [y, m] = month.split('-')
    return `${y}년 ${parseInt(m)}월`
  }

  const getStudentPayments = (studentId: string) =>
    payments.filter(p => p.student_id === studentId)

  const getPrevMemo = (studentId: string): string | null => {
    const prev = prevPayments.find(p => p.student_id === studentId)
    return prev?.memo || null
  }

  // 결제일 (오버라이드 포함)
  const getDueDay = useCallback((student: Student): number =>
    dueDayOverrides[student.id] ?? getPaymentDueDay(student)
  , [dueDayOverrides])

  // 결제일이 지났는지 확인
  const checkScheduled = useCallback((student: Student, month: string): boolean => {
    const paymentDay = getDueDay(student)
    const t = new Date()
    const currentMonth = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
    if (month < currentMonth) return false
    if (month > currentMonth) return true
    return t.getDate() < paymentDay
  }, [getDueDay])

  // 미납/예정 라벨
  const getUnpaidLabelText = useCallback((student: Student, month: string): string => {
    const day = getDueDay(student)
    const m = parseInt(month.split('-')[1])
    const scheduled = checkScheduled(student, month)
    return `${m}/${day} ${scheduled ? '예정' : '미납'}`
  }, [getDueDay, checkScheduled])

  // 상담 라벨 토글
  const toggleDiscuss = (id: string) => {
    setDiscussSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      localStorage.setItem('tuition_discuss', JSON.stringify([...next]))
      return next
    })
  }

  // 스와이프 터치 핸들러
  const handleTouchStart = (e: React.TouchEvent, studentId: string) => {
    if (expandedStudentId) return
    const touch = e.touches[0]
    const el = e.currentTarget as HTMLElement
    touchRef.current = {
      startX: touch.clientX, startY: touch.clientY, currentX: touch.clientX,
      id: studentId, el,
      decided: false, isHorizontal: false,
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
        // 오른쪽 스와이프 → 상담 토글
        toggleDiscuss(id)
        el.style.transform = 'translateX(0)'
        if (swipeOpenId === id) setSwipeOpenId(null)
      } else if (dx < -60) {
        // 왼쪽 스와이프 → 수정 패널 열기
        // 기존에 열린 다른 row 닫기
        if (swipeOpenId && swipeOpenId !== id) {
          const prevEl = document.querySelector(`[data-swipe-row="${swipeOpenId}"]`) as HTMLElement | null
          if (prevEl) {
            prevEl.style.transition = 'transform 0.3s ease'
            prevEl.style.transform = 'translateX(0)'
          }
        }
        el.style.transform = 'translateX(-150px)'
        const allSt = grades.flatMap(g => g.classes.flatMap(c =>
          (c.students ?? []).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
        ))
        const student = allSt.find(s => s.id === id)
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

  // 스와이프 수정 패널 닫기
  const closeSwipeEdit = () => {
    if (swipeOpenId) {
      const el = document.querySelector(`[data-swipe-row="${swipeOpenId}"]`) as HTMLElement | null
      if (el) {
        el.style.transition = 'transform 0.3s ease'
        el.style.transform = 'translateX(0)'
      }
      setSwipeOpenId(null)
    }
  }

  // 인라인 수정 저장 (원비 + 결제일)
  const handleSaveEdit = async (studentId: string) => {
    const feeNum = parseFloat(editFeeValue)
    const dayNum = parseInt(editDueDayValue)

    // 원비 수정 (custom_fee)
    if (!isNaN(feeNum) && feeNum >= 0) {
      await fetch(`/api/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ custom_fee: Math.round(feeNum * 10000) }),
      })
    }

    // 결제일 수정 (localStorage)
    if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
      setDueDayOverrides(prev => {
        const next = { ...prev, [studentId]: dayNum }
        localStorage.setItem('tuition_due_days', JSON.stringify(next))
        return next
      })
    }

    closeSwipeEdit()
    await fetchData()
  }

  // 미납 학생 인라인 확장 (이전 달 결제방법 자동 유지)
  const handleExpand = (studentId: string) => {
    if (wasSwiped.current) return
    closeSwipeEdit()
    if (expandedStudentId === studentId) {
      setExpandedStudentId(null)
      return
    }
    setExpandedStudentId(studentId)
    setInlineDate(today)
    const prevPayment = prevPayments.find(p => p.student_id === studentId)
    setInlineMethod(prevPayment?.method as PaymentMethod || 'remote')
    setShowMethodPicker(false)
    setShowDatePicker(false)
    setInlineOtherMemo('')
  }

  // 인라인 납부 제출
  const handleInlineSubmit = async (studentId: string, fee: number) => {
    if (inlineSuccess) return
    if (inlineMethod === 'other' && !inlineOtherMemo.trim()) {
      alert('기타 결제수단 선택 시 내용을 입력해주세요.')
      return
    }
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: studentId,
        amount: fee,
        method: inlineMethod,
        payment_date: inlineDate,
        billing_month: selectedMonth,
        ...(inlineMethod === 'other' && inlineOtherMemo.trim() ? { memo: inlineOtherMemo.trim() } : {}),
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(`결제 처리 실패: ${err.error || '알 수 없는 오류'}`)
      return
    }
    setInlineSuccess(studentId)
    setTimeout(async () => {
      await fetchData()
      setInlineSuccess(null)
      setExpandedStudentId(null)
    }, 1000)
  }

  // 모달 열기 (납부 상세보기 또는 고급 옵션)
  const handleOpenModal = (studentId: string, fee: number) => {
    if (wasSwiped.current) return
    const existing = payments.find(p => p.student_id === studentId)
    setSelectedStudentId(studentId)
    setSelectedStudentFee(fee)
    setSelectedPayment(existing || null)
    setSelectedPrevMemo(getPrevMemo(studentId))
    setShowPaymentModal(true)
  }

  const handleSavePayment = async (data: Partial<Payment>) => {
    await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    fetchData()
  }

  const handleDeletePayment = async (paymentId: string) => {
    await fetch(`/api/payments/${paymentId}`, { method: 'DELETE' })
    setShowPaymentModal(false)
    setSelectedPayment(null)
    fetchData()
  }

  // AI 필터 실행
  const handleAiFilter = async () => {
    if (!aiFilterQuery.trim() || aiFilterLoading) return
    setAiFilterLoading(true)

    const allSt = grades.flatMap(g => g.classes.flatMap(c =>
      (c.students ?? []).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c, _grade: g }))
    ))

    const studentContext = allSt.map(s => {
      const sp = getStudentPayments(s.id)
      const fee = getStudentFee(s, s.class)
      const paid = sp.reduce((sum, p) => sum + p.amount, 0)
      return {
        id: s.id,
        name: s.name,
        grade: s._grade.name,
        class_name: s.class?.name || '',
        fee,
        paid,
        status: getPaymentStatus(paid, fee),
        due_day: getDueDay(s),
        payment_method: sp[0]?.method || null,
        payment_date: sp[0]?.payment_date || null,
        current_memo: sp[0]?.memo || null,
        prev_memo: getPrevMemo(s.id),
        has_discuss: discussSet.has(s.id),
      }
    })

    try {
      const res = await fetch('/api/agent/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: aiFilterQuery,
          context: { students: studentContext, billing_month: selectedMonth },
        }),
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
    setAiFilterOpen(false)
  }

  const clearAiFilter = () => {
    setAiFilterIds(null)
    setAiFilterDesc('')
    setAiFilterQuery('')
  }

  // Summary stats
  const allStudents = grades.flatMap(g => g.classes.flatMap(c =>
    (c.students ?? []).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
  ))
  const totalFee = allStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const unpaidStudents = allStudents.filter(s => {
    const paid = getStudentPayments(s.id).reduce((sum, p) => sum + p.amount, 0)
    return getPaymentStatus(paid, getStudentFee(s, s.class)) === 'unpaid'
  })
  const unpaidCount = unpaidStudents.filter(s => !checkScheduled(s, selectedMonth)).length
  const scheduledCount = unpaidStudents.filter(s => checkScheduled(s, selectedMonth)).length

  if (loading) return (
    <div className="animate-pulse">
      <div className="flex items-center justify-center gap-4 mb-6">
        <div className="w-9 h-9 bg-gray-200 rounded-lg"></div>
        <div className="h-6 bg-gray-200 rounded w-32"></div>
        <div className="w-9 h-9 bg-gray-200 rounded-lg"></div>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl border p-3 sm:p-4 text-center">
            <div className="h-3 bg-gray-200 rounded w-10 mx-auto mb-2"></div>
            <div className="h-5 bg-gray-200 rounded w-16 mx-auto"></div>
          </div>
        ))}
      </div>
      {[...Array(2)].map((_, gi) => (
        <div key={gi} className="mb-4">
          <div className="h-4 bg-gray-200 rounded w-20 mb-2 ml-1"></div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b">
              <div className="h-3 bg-gray-200 rounded w-24"></div>
            </div>
            {[...Array(4)].map((_, si) => (
              <div key={si} className="flex items-center gap-2 px-4 py-3 border-b last:border-b-0">
                <div className="h-4 bg-gray-200 rounded w-14 flex-1"></div>
                <div className="h-5 bg-gray-200 rounded-full w-16"></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div onClick={() => { if (swipeOpenId) closeSwipeEdit() }}>
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">{formatMonth(selectedMonth)}</h1>
        <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight className="w-5 h-5" />
        </button>
        <button
          onClick={() => {
            const a = document.createElement('a')
            a.href = `/api/payments/export?billing_month=${selectedMonth}`
            a.download = ''
            a.click()
          }}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-gray-700"
          title="엑셀 다운로드"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-6">
        <div className="bg-white rounded-xl border p-2 sm:p-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-400">총 원비</p>
          <p className="text-[11px] sm:text-lg font-bold mt-1">{(totalFee / 10000).toFixed(0)}<span className="text-[10px] sm:text-xs text-gray-400">만</span></p>
        </div>
        <div className="bg-white rounded-xl border p-2 sm:p-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-400">납부 완료</p>
          <p className="text-[11px] sm:text-lg font-bold mt-1 text-green-700">{(totalPaid / 10000).toFixed(0)}<span className="text-[10px] sm:text-xs text-gray-400">만</span></p>
        </div>
        <div className="bg-white rounded-xl border p-2 sm:p-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-400">미납</p>
          <p className="text-sm sm:text-lg font-bold mt-1 text-red-700">{unpaidCount}<span className="text-[10px] sm:text-xs text-gray-400">명</span></p>
        </div>
        <div className="bg-white rounded-xl border p-2 sm:p-4 text-center">
          <p className="text-[10px] sm:text-xs text-gray-400">예정</p>
          <p className="text-sm sm:text-lg font-bold mt-1 text-amber-600">{scheduledCount}<span className="text-[10px] sm:text-xs text-gray-400">명</span></p>
        </div>
      </div>

      {/* 학생별 납부 현황 */}
      {grades.map(grade => {
        const gradeStudentsAll = grade.classes.flatMap(c =>
          (c.students ?? []).filter(s => !s.withdrawal_date).map(s => ({ ...s, class: c }))
        )
        const gradeStudents = aiFilterIds ? gradeStudentsAll.filter(s => aiFilterIds.has(s.id)) : gradeStudentsAll
        if (gradeStudents.length === 0) return null

        return (
          <div key={grade.id} className="mb-4">
            <h2 className="text-sm font-semibold text-gray-500 mb-2 px-1">{grade.name}</h2>
            <div className="bg-white rounded-xl border overflow-hidden">
              {grade.classes.map(cls => {
                const allClassStudents = (cls.students ?? []).filter(s => !s.withdrawal_date)
                const students = aiFilterIds ? allClassStudents.filter(s => aiFilterIds.has(s.id)) : allClassStudents
                if (students.length === 0) return null

                return (
                  <div key={cls.id}>
                    <div className="px-4 py-2 bg-gray-50 border-b">
                      <span className="text-xs font-medium text-gray-500">{cls.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{cls.monthly_fee.toLocaleString()}원</span>
                    </div>
                    {students.map(student => {
                      const fee = getStudentFee(student, cls)
                      const studentPayments = getStudentPayments(student.id)
                      const paid = studentPayments.reduce((s, p) => s + p.amount, 0)
                      const status = getPaymentStatus(paid, fee)
                      const scheduled = status === 'unpaid' && checkScheduled(student, selectedMonth)
                      const displayColors = scheduled
                        ? { bg: '#FEF3C7', text: '#92400E' }
                        : PAYMENT_STATUS_COLORS[status]
                      let displayLabel = ''
                      if (status === 'unpaid') {
                        displayLabel = getUnpaidLabelText(student, selectedMonth)
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
                      const hasMemo = !!(prevMemo || currentMemo)
                      const hasDiscuss = discussSet.has(student.id)
                      const isSwipeOpen = swipeOpenId === student.id

                      return (
                        <div key={student.id} className="relative overflow-hidden">
                          {/* 왼쪽 스와이프 액션 (상담 토글) */}
                          <div className={`absolute inset-y-0 left-0 w-24 flex items-center justify-center ${
                            hasDiscuss ? 'bg-gray-400' : 'bg-red-500'
                          }`}>
                            <span className="text-white font-bold text-xs">{hasDiscuss ? '해제' : 'DISCUSS'}</span>
                          </div>

                          {/* 오른쪽 수정 패널 */}
                          <div className="absolute inset-y-0 right-0 w-[150px] flex items-center gap-1.5 px-2 bg-slate-50 border-l" onClick={e => e.stopPropagation()}>
                            <div className="flex-1 flex flex-col gap-1.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-gray-400 w-8 shrink-0">결제일</span>
                                <input
                                  type="number"
                                  value={isSwipeOpen ? editDueDayValue : ''}
                                  onChange={e => setEditDueDayValue(e.target.value)}
                                  className="w-10 px-1 py-0.5 text-xs border rounded text-center"
                                  min={1} max={31}
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-gray-400 w-8 shrink-0">원비</span>
                                <div className="flex items-center">
                                  <input
                                    type="number"
                                    value={isSwipeOpen ? editFeeValue : ''}
                                    onChange={e => setEditFeeValue(e.target.value)}
                                    className="w-12 px-1 py-0.5 text-xs border rounded text-center"
                                  />
                                  <span className="text-[9px] text-gray-400 ml-0.5">만</span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => handleSaveEdit(student.id)}
                              className="p-1.5 bg-[#1e2d6f] text-white rounded-lg shrink-0"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* 슬라이드 가능한 메인 콘텐츠 */}
                          <div
                            data-swipe-row={student.id}
                            className="relative bg-white z-10"
                            onTouchStart={e => handleTouchStart(e, student.id)}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            style={isSwipeOpen ? { transform: 'translateX(-150px)', transition: 'transform 0.3s ease' } : undefined}
                          >
                            <div className={`flex items-center gap-2 px-4 ${hasMemo && !isExpanded ? 'pt-3 pb-1' : 'py-3'} ${
                              status === 'unpaid' && !isExpanded ? 'cursor-pointer active:bg-gray-50' : ''
                            }`}
                              onClick={status === 'unpaid' && !isExpanded ? () => handleExpand(student.id) : undefined}
                            >
                              {/* 상담 라벨 */}
                              {hasDiscuss && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-bold shrink-0">DISCUSS</span>
                              )}

                              <Link
                                href={`/students/${student.id}`}
                                className="flex-1 min-w-0"
                                onClick={e => { if (wasSwiped.current) e.preventDefault(); e.stopPropagation() }}
                              >
                                <span className="text-sm font-medium">{student.name}</span>
                              </Link>

                              {isExpanded ? (
                                /* 인라인 납부: 미납 뱃지 자리에서 왼쪽으로 펼쳐짐 */
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
                                      className="fan-item px-2 py-0.5 rounded-full text-xs font-medium bg-[#FEF3C7] text-[#92400E] whitespace-nowrap"
                                    >
                                      {(() => { const d = new Date(inlineDate); return `${d.getMonth()+1}/${d.getDate()}` })()}
                                      <span className="text-[9px] opacity-50 ml-0.5">▼</span>
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
                                      className="fan-item px-2 py-0.5 rounded-full text-xs font-medium bg-[#E0E7FF] text-[#3730A3] flex items-center gap-0.5 whitespace-nowrap"
                                    >
                                      {INLINE_METHODS.find(([v]) => v === inlineMethod)?.[1]}
                                      <span className="text-[9px] opacity-50">▼</span>
                                    </button>
                                    <button
                                      onClick={() => handleInlineSubmit(student.id, fee)}
                                      disabled={!!inlineSuccess}
                                      className={`fan-item px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${
                                        isSuccess
                                          ? 'bg-green-500 text-white scale-105'
                                          : 'bg-[#DEF7EC] text-[#03543F] hover:opacity-80'
                                      }`}
                                    >
                                      {isSuccess ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : '납부'}
                                    </button>
                                    <button
                                      onClick={() => handleOpenModal(student.id, fee)}
                                      className="fan-item p-1 text-[#1e2d6f] hover:opacity-70"
                                    >
                                      <ClipboardList className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {inlineMethod === 'other' && (
                                    <input
                                      type="text"
                                      value={inlineOtherMemo}
                                      onChange={e => setInlineOtherMemo(e.target.value)}
                                      placeholder="결제수단 입력 (예: 서울페이)"
                                      className="fan-item w-full px-2.5 py-1 rounded-lg text-xs border border-gray-300 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                    />
                                  )}
                                </div>
                              ) : (
                                /* 기본 상태: 뱃지 + 상세 버튼 */
                                <>
                                  {studentPayments.length > 0 && status !== 'unpaid' && (
                                    <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                      {PAYMENT_METHOD_LABELS[studentPayments[0].method as keyof typeof PAYMENT_METHOD_LABELS]}
                                      {' '}결제일{parseInt(selectedMonth.split('-')[1])}/{getDueDay(student)}
                                    </span>
                                  )}
                                  {status !== 'unpaid' ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleOpenModal(student.id, fee) }}
                                      className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity"
                                      style={{ backgroundColor: displayColors.bg, color: displayColors.text }}
                                    >
                                      {displayLabel}
                                    </button>
                                  ) : (
                                    <span
                                      className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                                      style={{ backgroundColor: displayColors.bg, color: displayColors.text }}
                                    >
                                      {displayLabel}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                            {/* 비고 서브행 */}
                            {!isExpanded && hasMemo && (
                              <div className="px-4 pb-2">
                                {currentMemo && (
                                  <p className="text-[11px] text-gray-500 leading-tight">{currentMemo}</p>
                                )}
                                {prevMemo && (
                                  <p className="text-[11px] text-gray-400 leading-tight">지난달: {prevMemo}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {allStudents.length === 0 && (
        <div className="text-center py-12 text-gray-400">등록된 학생이 없습니다</div>
      )}

      {showPaymentModal && selectedStudentId && (
        <PaymentModal
          payment={selectedPayment}
          studentId={selectedStudentId}
          defaultBillingMonth={selectedMonth}
          defaultAmount={selectedStudentFee}
          prevMemo={selectedPrevMemo}
          onSave={handleSavePayment}
          onDelete={handleDeletePayment}
          onClose={() => { setShowPaymentModal(false); setSelectedPayment(null); setExpandedStudentId(null) }}
        />
      )}

      {/* 커스텀 날짜선택기 (fixed로 overflow-hidden 무시) */}
      {showDatePicker && (() => {
        const selDate = new Date(inlineDate)
        const year = selDate.getFullYear()
        const month = selDate.getMonth()
        const firstDay = new Date(year, month, 1).getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const cells: (number | null)[] = []
        for (let i = 0; i < firstDay; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) cells.push(d)
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowDatePicker(false)} />
            <div
              className="fixed z-50 bg-white border rounded-lg shadow-lg p-2"
              style={{ top: datePickerPos.top, left: datePickerPos.left, width: '220px' }}
            >
              <div className="flex items-center justify-between mb-1.5 px-1">
                <button type="button" onClick={() => {
                  const nd = new Date(year, month - 1, 1)
                  setInlineDate(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(Math.min(selDate.getDate(), new Date(nd.getFullYear(), nd.getMonth()+1, 0).getDate())).padStart(2,'0')}`)
                }} className="text-gray-400 hover:text-gray-600 text-xs p-0.5">◀</button>
                <span className="text-xs font-medium">{year}년 {month+1}월</span>
                <button type="button" onClick={() => {
                  const nd = new Date(year, month + 1, 1)
                  setInlineDate(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(Math.min(selDate.getDate(), new Date(nd.getFullYear(), nd.getMonth()+1, 0).getDate())).padStart(2,'0')}`)
                }} className="text-gray-400 hover:text-gray-600 text-xs p-0.5">▶</button>
              </div>
              <div className="grid grid-cols-7 gap-0 text-center">
                {['일','월','화','수','목','금','토'].map(d => (
                  <span key={d} className="text-[9px] text-gray-400 py-0.5">{d}</span>
                ))}
                {cells.map((day, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={!day}
                    onClick={() => {
                      if (day) {
                        setInlineDate(`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`)
                        setShowDatePicker(false)
                      }
                    }}
                    className={`text-[11px] py-1 rounded ${
                      !day ? '' :
                      day === selDate.getDate() ? 'bg-[#1e2d6f] text-white font-bold' :
                      'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    {day || ''}
                  </button>
                ))}
              </div>
            </div>
          </>
        )
      })()}

      {/* 결제수단 드롭다운 (fixed로 overflow-hidden 무시) */}
      {showMethodPicker && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMethodPicker(false)} />
          <div
            className="fixed z-50 bg-white border rounded-lg shadow-lg overflow-hidden min-w-[90px]"
            style={{ top: methodPickerPos.top, right: methodPickerPos.right }}
          >
            {INLINE_METHODS.map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => { setInlineMethod(val); setShowMethodPicker(false) }}
                className={`block w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 whitespace-nowrap ${
                  inlineMethod === val ? 'text-[#3730A3] bg-indigo-50' : 'text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* AI 필터 플로팅 버튼 */}
      <div className="fixed left-0 z-30" style={{ top: '38%' }}>
        {aiFilterIds !== null ? (
          /* 필터 활성 상태 */
          <div className="flex items-center gap-1 bg-[#1e2d6f] text-white pl-2.5 pr-1.5 py-2 rounded-r-full shadow-lg">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-medium max-w-[100px] truncate">{aiFilterDesc}</span>
            <button onClick={clearAiFilter} className="p-0.5 hover:bg-white/20 rounded-full ml-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : aiFilterOpen ? (
          /* 입력창 열림 */
          <div className="flex items-center bg-white shadow-lg border rounded-r-2xl pl-3 pr-1 py-1.5 gap-1.5">
            <Sparkles className="w-4 h-4 text-[#1e2d6f] shrink-0" />
            <input
              ref={aiInputRef}
              autoFocus
              value={aiFilterQuery}
              onChange={e => setAiFilterQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAiFilter()
                if (e.key === 'Escape') { setAiFilterOpen(false); setAiFilterQuery('') }
              }}
              placeholder="예: 미납학생, 결제일 15일..."
              className="text-xs w-44 sm:w-56 outline-none bg-transparent"
            />
            <button
              onClick={handleAiFilter}
              disabled={aiFilterLoading}
              className="p-1.5 bg-[#1e2d6f] text-white rounded-full shrink-0 disabled:opacity-50"
            >
              {aiFilterLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => { setAiFilterOpen(false); setAiFilterQuery('') }}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          /* 기본 버튼 */
          <button
            onClick={() => { setAiFilterOpen(true); setTimeout(() => aiInputRef.current?.focus(), 100) }}
            className="bg-[#1e2d6f] text-white p-2.5 rounded-r-full shadow-lg hover:bg-[#2a3d8f] transition-colors"
          >
            <Sparkles className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
