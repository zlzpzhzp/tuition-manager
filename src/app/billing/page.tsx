'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
import { ChevronLeft, ChevronRight, Send, Check, Loader2, Square } from 'lucide-react'
import type { Student, GradeWithClasses } from '@/types'
import { getStudentFee } from '@/types'
import { useGrades, safeMutate, getActiveStudents } from '@/lib/utils'
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

export default function BillingPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const { data: grades = [], isLoading: gradesLoading } = useGrades<GradeWithClasses[]>()
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

  // Sending states
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const [batchSending, setBatchSending] = useState<number | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [results, setResults] = useState<Map<string, { ok: boolean; msg: string }>>(new Map())
  const cancelBatchRef = useRef(false)

  const navigateMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // All active students with class info
  const allStudents = useMemo(() =>
    grades.flatMap(g => g.classes.flatMap(c =>
      getActiveStudents(c.students ?? [], selectedMonth).map(s => ({ ...s, class: c }))
    )), [grades, selectedMonth])

  type StudentWithClass = Student & { class: { name: string; monthly_fee: number } }

  // Group by payment_due_day
  const dayGroups = useMemo(() => {
    const map = new Map<number, StudentWithClass[]>()
    for (const s of allStudents) {
      const day = s.payment_due_day ?? 0
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(s)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [allStudents])

  // Bill lookup by student_id
  const billByStudent = useMemo(() => {
    const map = new Map<string, BillRecord>()
    for (const b of bills) map.set(b.student_id, b)
    return map
  }, [bills])

  // Stats
  const stats = useMemo(() => {
    const total = allStudents.length
    const sent = allStudents.filter(s => billByStudent.has(s.id)).length
    const paid = allStudents.filter(s => billByStudent.get(s.id)?.status === 'paid').length
    const noPhone = allStudents.filter(s => !s.parent_phone).length
    return { total, sent, paid, unsent: total - sent, noPhone }
  }, [allStudents, billByStudent])

  // Send individual bill
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

    // Clear result after 3s
    setTimeout(() => setResults(prev => { const n = new Map(prev); n.delete(student.id); return n }), 3000)
  }, [selectedMonth, mutateBills])

  // Batch send for a day group
  const sendBatch = useCallback(async (day: number, students: (StudentWithClass)[]) => {
    const eligible = students.filter(s => {
      const phone = s.parent_phone || s.phone || ''
      const fee = getStudentFee(s, s.class)
      const bill = billByStudent.get(s.id)
      return phone && fee > 0 && !bill // not yet sent
    })

    if (eligible.length === 0) return
    cancelBatchRef.current = false
    setCancelling(false)
    setBatchSending(day)
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

  const formatMonth = (m: string) => {
    const [y, mo] = m.split('-')
    return `${y}년 ${parseInt(mo)}월`
  }

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

  return (
    <div>
      {/* 테스트 모드 배너 */}
      {isTestMode && (
        <div className="flex items-center gap-2 px-4 py-2 mb-2 rounded-xl bg-[var(--orange-dim)] border border-[var(--orange)]">
          <span className="text-base">🔒</span>
          <div>
            <p className="text-sm font-bold text-[var(--orange)]">테스트 모드</p>
            <p className="text-[11px] text-[var(--text-3)]">실제 발송되지 않습니다. 버튼을 눌러도 시뮬레이션만 됩니다.</p>
          </div>
        </div>
      )}

      {/* 월 네비게이션 */}
      <div className="sticky -top-6 z-30 bg-[var(--bg)] -mx-4 px-4 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-[var(--bg-card-hover)] rounded-lg transition-colors">
            <ChevronLeft className="w-5 h-5 text-[var(--text-3)]" />
          </button>
          <h2 className="text-lg font-bold tracking-tight">{formatMonth(selectedMonth)}</h2>
          <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-[var(--bg-card-hover)] rounded-lg transition-colors">
            <ChevronRight className="w-5 h-5 text-[var(--text-3)]" />
          </button>
        </div>

        {/* 요약 카드 */}
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
      </div>

      {/* 결제일별 그룹 */}
      <div className="space-y-3 mt-2">
        {dayGroups.map(([day, students]) => {
          const eligible = students.filter(s => {
            const phone = s.parent_phone || s.phone
            const fee = getStudentFee(s, s.class)
            return phone && fee > 0 && !billByStudent.has(s.id)
          })
          const allSent = students.every(s => billByStudent.has(s.id))
          const allPaid = students.every(s => billByStudent.get(s.id)?.status === 'paid')
          const isBatching = batchSending === day

          return (
            <div key={day} className="card overflow-hidden">
              {/* 그룹 헤더 */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{day === 0 ? '미지정' : `${day}일`}</span>
                  <span className="text-xs text-[var(--text-4)]">{students.length}명</span>
                </div>
                {!allSent && eligible.length > 0 && !isBatching && (
                  <button
                    onClick={() => sendBatch(day, students)}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--blue)] text-white hover:opacity-90 transition-opacity"
                  >
                    <Send className="w-3 h-3" /> 일괄 발송 ({eligible.length})
                  </button>
                )}
                {isBatching && (
                  <button
                    onClick={cancelBatch}
                    disabled={cancelling}
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--red)] text-white hover:opacity-90 disabled:opacity-60 transition-opacity"
                  >
                    {cancelling ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> 중단 중...</>
                    ) : (
                      <><Square className="w-3 h-3" fill="currentColor" /> 중단 ({batchProgress?.done ?? 0}/{batchProgress?.total ?? 0})</>
                    )}
                  </button>
                )}
                {allPaid && (
                  <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--paid-text)' }}>
                    <Check className="w-3.5 h-3.5" /> 전원 완료
                  </span>
                )}
              </div>

              {/* 학생 리스트 */}
              <div className="divide-y divide-[var(--border)]">
                {students.map(student => {
                  const phone = student.parent_phone || student.phone || ''
                  const fee = getStudentFee(student, student.class)
                  const status = getBillStatus(student.id)
                  const config = statusConfig[status]
                  const isSending = sendingIds.has(student.id)
                  const result = results.get(student.id)
                  const bill = billByStudent.get(student.id)
                  const canSend = phone && fee > 0 && status === 'unsent'

                  return (
                    <div key={student.id} className="flex items-center gap-2 px-4 py-2">
                      {/* 이름 + 반 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-medium truncate">{student.name}</span>
                          {!phone && <span className="text-[9px] px-1 py-0.5 rounded-full bg-[var(--orange-dim)] text-[var(--orange)]" title="전화번호 없음">📵</span>}
                        </div>
                        <p className="text-[11px] text-[var(--text-4)] truncate">
                          {student.class?.name} · {fee.toLocaleString()}원
                        </p>
                      </div>

                      {/* 결과 메시지 */}
                      {result && (
                        <span className={`text-[10px] font-medium ${result.ok ? 'text-[var(--paid-text)]' : 'text-[var(--red)]'}`}>
                          {result.msg}
                        </span>
                      )}

                      {/* 상태 배지 */}
                      <span
                        className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                        style={{ backgroundColor: config.bg, color: config.text }}
                      >
                        {config.label}
                      </span>

                      {/* 발송 버튼 */}
                      {canSend && !isSending && (
                        <button
                          onClick={() => sendBill(student)}
                          className="p-1.5 text-[var(--blue)] hover:bg-[var(--blue-dim)] rounded-lg transition-colors"
                          title="개별 발송"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isSending && (
                        <Loader2 className="w-4 h-4 animate-spin text-[var(--blue)]" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {dayGroups.length === 0 && (
          <div className="text-center py-12 text-[var(--text-4)]">
            학생 데이터가 없습니다
          </div>
        )}
      </div>
    </div>
  )
}
