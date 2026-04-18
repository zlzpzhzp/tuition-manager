'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, AlertTriangle, Check, Loader2, Search, PhoneOff } from 'lucide-react'
import type { Student, GradeWithClasses } from '@/types'
import { getStudentFee } from '@/types'

type ClassWithStudents = GradeWithClasses['classes'][number]
type StudentWithClass = Student & { class: ClassWithStudents }

interface Props {
  students: StudentWithClass[]
  billingMonth: string
  onClose: () => void
  onSuccess?: () => void
}

type SendState = 'form' | 'confirming' | 'sending' | 'success' | 'error'

export default function QuickBillSendModal({ students, billingMonth, onClose, onSuccess }: Props) {
  const [mounted, setMounted] = useState(false)
  const [state, setState] = useState<SendState>('form')
  const [errorMsg, setErrorMsg] = useState('')

  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [amountStr, setAmountStr] = useState('')
  const [billNote, setBillNote] = useState('')
  const [isRegular, setIsRegular] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { if (mounted) setTimeout(() => searchRef.current?.focus(), 150) }, [mounted])

  const selected = useMemo(() => students.find(s => s.id === selectedId) ?? null, [students, selectedId])

  // 학생 선택 시 기본 금액 세팅
  useEffect(() => {
    if (selected && !amountStr) {
      const fee = getStudentFee(selected, selected.class)
      setAmountStr(String(fee))
    }
  }, [selected, amountStr])

  const phone = selected ? (selected.parent_phone || selected.phone || '') : ''
  const cleanPhone = phone.replace(/-/g, '')
  const isPhoneValid = /^01[016789]\d{7,8}$/.test(cleanPhone)
  const amount = parseInt(amountStr.replace(/[^\d]/g, '') || '0', 10)
  const isAmountValid = amount > 0

  const filtered = useMemo(() => {
    if (!query.trim()) return students.slice(0, 30)
    const q = query.trim().toLowerCase()
    return students
      .filter(s => s.name.toLowerCase().includes(q) || s.class?.name?.toLowerCase().includes(q))
      .slice(0, 30)
  }, [students, query])

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && state !== 'sending') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, state])

  const handleSend = useCallback(async () => {
    if (state === 'sending' || state === 'success' || !selected) return

    if (state !== 'confirming') {
      setState('confirming')
      return
    }

    setState('sending')
    setErrorMsg('')

    try {
      const res = await fetch('/api/payssam/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selected.id,
          studentName: selected.name,
          phone: cleanPhone,
          amount,
          productName: `${billingMonth.replace('-', '년 ')}월 수업료`,
          billingMonth,
          isRegularTuition: isRegular,
          billNote: billNote || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || data.code !== '0000') {
        setErrorMsg(data.msg || data.error || '청구서 발송에 실패했습니다')
        setState('error')
        return
      }
      setState('success')
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 1800)
    } catch {
      setErrorMsg('네트워크 오류가 발생했습니다')
      setState('error')
    }
  }, [state, selected, cleanPhone, amount, billingMonth, isRegular, billNote, onClose, onSuccess])

  const formatMonth = (m: string) => { const [y, mo] = m.split('-'); return `${y}년 ${parseInt(mo)}월` }

  if (!mounted) return null

  const readyToSend = selected && isPhoneValid && isAmountValid

  const modal = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => { if (state !== 'sending') onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="bg-[var(--bg-card)] w-full max-w-md rounded-2xl max-h-[88vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
            <Send className="w-4 h-4 text-[var(--blue)]" />
            청구서 발송
            <span className="text-xs font-normal text-[var(--text-4)]">{formatMonth(billingMonth)}</span>
          </h2>
          <button
            onClick={() => { if (state !== 'sending') onClose() }}
            className="p-1.5 text-[var(--text-4)] hover:text-[var(--text-3)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors"
            disabled={state === 'sending'}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {state === 'success' ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="w-16 h-16 rounded-full bg-[var(--green-dim)] flex items-center justify-center"
              >
                <Check className="w-8 h-8 text-[var(--paid-text)]" />
              </motion.div>
              <p className="text-base font-bold text-[var(--paid-text)]">청구서가 발송되었습니다</p>
              <p className="text-xs text-[var(--text-4)]">{selected?.name} · {amount.toLocaleString()}원</p>
            </div>
          ) : (
            <>
              {/* 1. 학생 선택 */}
              {!selected ? (
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">학생 선택</label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-[var(--text-4)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      ref={searchRef}
                      type="text"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="이름 또는 반으로 검색..."
                      className="w-full pl-9 pr-3 py-2.5 bg-[var(--bg-elevated)] rounded-xl text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)]"
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
                    {filtered.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[var(--text-4)]">일치하는 학생이 없습니다</div>
                    ) : filtered.map(s => {
                      const p = s.parent_phone || s.phone
                      const fee = getStudentFee(s, s.class)
                      return (
                        <button
                          key={s.id}
                          onClick={() => setSelectedId(s.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--bg-card-hover)] text-left transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold truncate">{s.name}</span>
                              {!p && <PhoneOff className="w-3 h-3 text-[var(--red)]" />}
                            </div>
                            <div className="text-[10px] text-[var(--text-4)] truncate">{s.class?.name}</div>
                          </div>
                          <span className="text-[11px] tabular-nums text-[var(--text-3)]">{fee.toLocaleString()}원</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <>
                  {/* 선택된 학생 배너 */}
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[var(--bg-elevated)]">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-[var(--blue)]/20 text-[var(--blue)] flex items-center justify-center text-xs font-bold">
                        {selected.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{selected.name}</div>
                        <div className="text-[10px] text-[var(--text-4)]">{selected.class?.name}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedId(null); setAmountStr(''); setBillNote(''); setIsRegular(true) }}
                      disabled={state !== 'form'}
                      className="text-xs text-[var(--text-4)] hover:text-[var(--text-3)] px-2 py-1 rounded-lg hover:bg-[var(--bg-card-hover)] disabled:opacity-40"
                    >
                      변경
                    </button>
                  </div>

                  {/* 전화번호 경고 */}
                  {!isPhoneValid && (
                    <div className="flex items-start gap-2 p-3 bg-[var(--red-dim)] rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-[var(--red)] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-[var(--red)]">전화번호 오류</p>
                        <p className="text-xs text-[var(--text-3)] mt-0.5">
                          {phone ? `"${phone}"은 유효한 전화번호가 아닙니다` : '학부모 전화번호가 등록되어 있지 않습니다'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 금액 */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">청구 금액</label>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={amount > 0 ? amount.toLocaleString() : amountStr}
                        onChange={e => setAmountStr(e.target.value.replace(/[^\d]/g, ''))}
                        disabled={state !== 'form'}
                        className="w-full pl-3 pr-10 py-2.5 bg-[var(--bg-elevated)] rounded-xl text-base font-bold tabular-nums text-[var(--text-1)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)] disabled:opacity-60"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-4)]">원</span>
                    </div>
                  </div>

                  {/* 정규/비정규 토글 */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsRegular(true)}
                      disabled={state !== 'form'}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60 ${
                        isRegular
                          ? 'bg-[var(--blue)]/15 text-[var(--blue)] ring-1 ring-[var(--blue)]/40'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-4)]'
                      }`}
                    >
                      정규 수업료
                    </button>
                    <button
                      onClick={() => setIsRegular(false)}
                      disabled={state !== 'form'}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-60 ${
                        !isRegular
                          ? 'bg-[var(--orange)]/15 text-[var(--orange)] ring-1 ring-[var(--orange)]/40'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-4)]'
                      }`}
                    >
                      비정규 (보충/분할)
                    </button>
                  </div>

                  {/* 비고 */}
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-3)] mb-1.5">
                      비고 <span className="text-[var(--text-4)] font-normal">(선택)</span>
                    </label>
                    <input
                      type="text"
                      value={billNote}
                      onChange={e => setBillNote(e.target.value.slice(0, 40))}
                      disabled={state !== 'form'}
                      placeholder={isRegular ? '예: 특강비 포함' : '예: 3월 분할결제 2/3회차'}
                      className="w-full px-3 py-2 bg-[var(--bg-elevated)] rounded-xl text-sm text-[var(--text-1)] placeholder:text-[var(--text-4)] focus:outline-none focus:ring-1 focus:ring-[var(--blue)] disabled:opacity-60"
                    />
                  </div>

                  {/* 확인 경고 */}
                  <AnimatePresence>
                    {state === 'confirming' && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
                        className="flex items-start gap-2 p-3 bg-[var(--orange-dim)] rounded-xl"
                      >
                        <AlertTriangle className="w-4 h-4 text-[var(--orange)] shrink-0 mt-0.5" />
                        <p className="text-sm text-[var(--orange)]">
                          <strong>{selected.name}</strong>님에게 <strong>{amount.toLocaleString()}원</strong> 청구서를 발송합니다. 확인하시겠습니까?
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 에러 */}
                  {state === 'error' && (
                    <div className="flex items-start gap-2 p-3 bg-[var(--red-dim)] rounded-xl">
                      <AlertTriangle className="w-4 h-4 text-[var(--red)] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-[var(--red)]">발송 실패</p>
                        <p className="text-xs text-[var(--text-3)] mt-0.5">{errorMsg}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* 하단 액션 */}
        {state !== 'success' && selected && (
          <div className="px-5 py-4 border-t border-[var(--border)] flex gap-2">
            {state === 'confirming' && (
              <button
                onClick={() => setState('form')}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-3)] hover:bg-[var(--border-light)] transition-colors"
              >
                취소
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={!readyToSend || state === 'sending'}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                state === 'confirming'
                  ? 'bg-[var(--orange)] text-white hover:opacity-90'
                  : state === 'sending'
                    ? 'bg-[var(--blue)] text-white opacity-70 cursor-not-allowed'
                    : state === 'error'
                      ? 'bg-[var(--blue)] text-white hover:opacity-90'
                      : 'bg-[var(--blue)] text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed'
              }`}
            >
              {state === 'sending' ? (
                <><Loader2 className="w-4 h-4 animate-spin" />발송 중...</>
              ) : state === 'confirming' ? (
                '확인, 발송합니다'
              ) : state === 'error' ? (
                '다시 시도'
              ) : (
                <><Send className="w-4 h-4" />청구서 발송</>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )

  return createPortal(modal, document.body)
}
