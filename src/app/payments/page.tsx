'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ChevronDown, Check, ClipboardList, Download, Plus } from 'lucide-react'
import type { Grade, Class, Student, Payment, PaymentMethod, GradeWithClasses } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, PAYMENT_METHOD_LABELS } from '@/types'
import PaymentModal from '@/components/PaymentModal'
import StudentModal from '@/components/StudentModal'
import DatePickerPopup from '@/components/payments/DatePickerPopup'
import MethodPickerPopup from '@/components/payments/MethodPickerPopup'
import AiFilterButton from '@/components/payments/AiFilterButton'
import { getPrevMonth, formatMonth, getPaymentDueDay, isPaymentScheduled, getUnpaidLabelText, getActiveStudents, safeMutate, decodePaymentMemo, useGrades, usePayments, revalidateGrades, revalidatePayments } from '@/lib/utils'

const INLINE_METHODS: [PaymentMethod, string][] = [
  ['remote', '결제선생'],
  ['card', '카드'],
  ['transfer', '이체'],
  ['cash', '현금'],
  ['other', '기타'],
]

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
  const [inlineOtherMemo, setInlineOtherMemo] = useState('')
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
      getActiveStudents(c.students ?? []).map(s => ({ ...s, class: c }))
    )), [grades])

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

  // ─── Discuss toggle ───────────────────────────────────────────
  const toggleDiscuss = async (id: string) => {
    const student = allStudents.find(s => s.id === id)
    if (!student) return
    await safeMutate(`/api/students/${id}`, 'PUT', { has_discuss: !student.has_discuss })
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
    setInlineOtherMemo('')
  }

  const handleInlineSubmit = async (studentId: string, fee: number) => {
    if (inlineSuccess) return
    if (inlineMethod === 'other' && !inlineOtherMemo.trim()) {
      alert('기타 결제수단 선택 시 내용을 입력해주세요.')
      return
    }
    const { error } = await safeMutate('/api/payments', 'POST', {
      student_id: studentId, amount: fee, method: inlineMethod,
      payment_date: inlineDate, billing_month: selectedMonth,
      ...(inlineMethod === 'other' && inlineOtherMemo.trim() ? { memo: inlineOtherMemo.trim() } : {}),
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
    <div className="animate-pulse">
      <div className="flex items-center justify-center gap-3 mb-3">
        <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
        <div className="h-10 bg-gray-200 rounded w-56 sm:w-72"></div>
        <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
      </div>
      {[...Array(2)].map((_, gi) => (
        <div key={gi} className="mb-4">
          <div className="h-4 bg-gray-200 rounded w-20 mb-2 ml-1"></div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b"><div className="h-3 bg-gray-200 rounded w-24"></div></div>
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

  if (error) return (
    <div className="text-center py-12">
      <p className="text-red-500 mb-4">{error}</p>
      <button onClick={fetchData} className="px-4 py-2 bg-[#1e2d6f] text-white rounded-lg hover:opacity-90">다시 시도</button>
    </div>
  )

  return (
    <div onClick={() => { if (swipeOpenId) closeSwipeEdit() }}>
      {/* 월 네비게이션 */}
      <div className="flex items-center justify-center gap-3 mb-3">
        <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="이전 달">
          <ChevronLeft className="w-7 h-7" />
        </button>
        <h1 className="font-extrabold tracking-tight text-center">
          <span className="text-[2.6rem] sm:text-[3.2rem] leading-none">{selectedMonth.split('-')[0]}</span>
          <span className="text-[1.8rem] sm:text-[2.2rem] text-gray-600">년 </span>
          <span className="text-5xl sm:text-6xl">{parseInt(selectedMonth.split('-')[1])}</span>
          <span className="text-[1.8rem] sm:text-[2.2rem] text-gray-600">월</span>
        </h1>
        <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="다음 달">
          <ChevronRight className="w-7 h-7" />
        </button>
      </div>

      {/* 학생별 납부 현황 */}
      {grades.map((grade, gradeIndex) => {
        const gradeStudentsAll = grade.classes.flatMap(c =>
          getActiveStudents(c.students ?? []).map(s => ({ ...s, class: c }))
        )
        let gradeStudents = aiFilterIds ? gradeStudentsAll.filter(s => aiFilterIds.has(s.id)) : gradeStudentsAll
        if (showUnpaidOnly) {
          gradeStudents = gradeStudents.filter(s => {
            const paid = (paymentsByStudentId.get(s.id) ?? []).reduce((sum, p) => sum + p.amount, 0)
            const status = getPaymentStatus(paid, getStudentFee(s, s.class))
            if (status === 'paid') return false
            if (status === 'unpaid' && checkScheduled(s, selectedMonth)) return false
            return true
          })
        }
        if (gradeStudents.length === 0) return null

        return (
          <div key={grade.id} className="mb-4">
            <div className="flex items-center mb-2 px-1">
              <h2 className="text-sm font-semibold text-gray-500">{grade.name}</h2>
              {gradeIndex === 0 && (
                <>
                  <div className="flex-1 flex justify-center">
                    <button
                      onClick={() => {
                        const a = document.createElement('a')
                        a.href = `/api/payments/export?billing_month=${selectedMonth}`
                        a.download = ''
                        a.click()
                      }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      <span>내보내기</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setShowUnpaidOnly(prev => !prev)}
                    className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      showUnpaidOnly
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {showUnpaidOnly ? '미납' : '전체'}
                  </button>
                </>
              )}
              {gradeIndex !== 0 && <div className="flex-1" />}
            </div>
            <div className="bg-white rounded-xl border overflow-hidden">
              {grade.classes.map(cls => {
                const allClassStudents = getActiveStudents(cls.students ?? [])
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
                      className="px-4 py-2 bg-gray-50 border-b flex items-center cursor-pointer active:bg-gray-100 select-none"
                      onClick={() => toggleClass(cls.id)}
                    >
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 mr-1.5 transition-transform ${isClassExpanded ? '' : '-rotate-90'}`} />
                      <span className="text-xs font-medium text-gray-500">{cls.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{paidCount}/{students.length}</span>
                      <span className="flex-1" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAddStudent(cls.id) }}
                        className="p-0.5 text-gray-400 hover:text-[#1e2d6f] transition-colors"
                        aria-label={`${cls.name}에 학생 추가`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {isClassExpanded && students.map(student => {
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

                      return (
                        <div key={student.id} className="relative overflow-hidden">
                          {/* 왼쪽 스와이프 액션 */}
                          <div className={`absolute inset-y-0 left-0 w-24 flex items-center justify-center ${hasDiscuss ? 'bg-gray-400' : 'bg-red-500'}`}>
                            <span className="text-white font-bold text-xs">{hasDiscuss ? '해제' : 'DISCUSS'}</span>
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
                                      aria-label="결제일 선택"
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
                                      aria-label="결제수단 선택"
                                    >
                                      {INLINE_METHODS.find(([v]) => v === inlineMethod)?.[1]}
                                      <span className="text-[9px] opacity-50">▼</span>
                                    </button>
                                    <button
                                      onClick={() => handleInlineSubmit(student.id, fee)}
                                      disabled={!!inlineSuccess}
                                      className={`fan-item px-2.5 py-0.5 rounded-full text-xs font-medium transition-all ${
                                        isSuccess ? 'bg-green-500 text-white scale-105' : 'bg-[#DEF7EC] text-[#03543F] hover:opacity-80'
                                      }`}
                                      aria-label="납부 처리"
                                    >
                                      {isSuccess ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : '납부'}
                                    </button>
                                    <button
                                      onClick={() => handleOpenModal(student.id, fee)}
                                      className="fan-item p-1 text-[#1e2d6f] hover:opacity-70"
                                      aria-label="상세 납부 기록"
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
                                      aria-label="기타 결제수단 입력"
                                    />
                                  )}
                                </div>
                              ) : (
                                <>
                                  {studentPayments.length > 0 && status !== 'unpaid' && (() => {
                                    const p = studentPayments[0]
                                    const { otherMethod } = decodePaymentMemo(p.memo)
                                    const methodLabel = otherMethod || PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS]
                                    return (
                                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                        {methodLabel} 결제일{parseInt(selectedMonth.split('-')[1])}/{getDueDay(student)}
                                      </span>
                                    )
                                  })()}
                                  {status !== 'unpaid' ? (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleOpenModal(student.id, fee) }}
                                      className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity"
                                      style={{ backgroundColor: displayColors.bg, color: displayColors.text }}
                                      role="status"
                                    >
                                      {displayLabel}
                                    </button>
                                  ) : (
                                    <span
                                      className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
                                      style={{ backgroundColor: displayColors.bg, color: displayColors.text }}
                                      role="status"
                                    >
                                      {displayLabel}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                            {!isExpanded && hasMemo && (
                              <div className="px-4 pb-2">
                                {cleanMemo && <p className="text-[11px] text-gray-500 leading-tight">{cleanMemo}</p>}
                                {prevMemo && <p className="text-[11px] text-gray-400 leading-tight">지난달: {prevMemo}</p>}
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
