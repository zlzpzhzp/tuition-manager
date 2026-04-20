'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Trash2, Undo2, AlertTriangle, Check, Loader2, RefreshCw, Split } from 'lucide-react'

interface Props {
  studentId: string
  studentName: string
  phone: string
  billId: string
  amount: number
  status: 'sent' | 'paid' | 'cancelled'
  billingMonth: string
  onClose: () => void
  onSuccess?: () => void
}

type ActionState = 'idle' | 'confirming-destroy' | 'confirming-cancel' | 'confirming-reissue' | 'configuring-split' | 'submitting' | 'success' | 'error'

export default function BillActionModal({ studentId, studentName, phone, billId, amount, status, billingMonth, onClose, onSuccess }: Props) {
  const [state, setState] = useState<ActionState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [successLabel, setSuccessLabel] = useState('')
  const [mounted, setMounted] = useState(false)

  const [parts, setParts] = useState<2 | 3 | 4>(3)
  const [splitAmounts, setSplitAmounts] = useState<string[]>(['', '', ''])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && state !== 'submitting') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, state])

  useEffect(() => {
    setSplitAmounts(prev => {
      const next = Array.from({ length: parts }, (_, i) => prev[i] ?? '')
      return next
    })
  }, [parts])

  const submit = useCallback(async (kind: 'destroy' | 'cancel' | 'reissue') => {
    setState('submitting')
    setErrorMsg('')
    try {
      const url =
        kind === 'destroy' ? '/api/payssam/destroy' :
        kind === 'cancel' ? '/api/payssam/cancel' :
        '/api/payssam/reissue'
      const body = { billId, amount }
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.code !== '0000') {
        setErrorMsg(data.msg || data.error || '처리에 실패했습니다')
        setState('error')
        return
      }
      setSuccessLabel(
        kind === 'destroy' ? '청구서가 파기되었습니다' :
        kind === 'cancel' ? '결제가 취소되었습니다' :
        '새 청구서가 발송되었습니다'
      )
      setState('success')
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 2000)
    } catch {
      setErrorMsg('네트워크 오류가 발생했습니다')
      setState('error')
    }
  }, [billId, amount, onClose, onSuccess])

  const updateSplitAmount = (idx: number, value: string) => {
    const digits = value.replace(/\D/g, '')
    const num = digits ? parseInt(digits) : 0
    setSplitAmounts(prev => {
      const next = [...prev]
      next[idx] = digits
      // 마지막 칸이 아니면서 현재+앞서 입력된 금액들이 원비에 미치지 않으면 다음 칸 자동계산
      if (idx < parts - 1) {
        let accumulated = 0
        for (let i = 0; i <= idx; i++) {
          accumulated += i === idx ? num : (parseInt(next[i] || '0'))
        }
        const remaining = amount - accumulated
        if (remaining > 0) {
          // 나머지를 남은 칸 수로 균등 분배 (마지막 칸에만 잔액 몰빵 대신 균등)
          const remainingParts = parts - idx - 1
          const perPart = Math.floor(remaining / remainingParts)
          const lastAdjust = remaining - perPart * remainingParts
          for (let j = idx + 1; j < parts; j++) {
            next[j] = String(j === parts - 1 ? perPart + lastAdjust : perPart)
          }
        } else {
          for (let j = idx + 1; j < parts; j++) next[j] = '0'
        }
      }
      return next
    })
  }

  const splitTotal = splitAmounts.reduce((s, v) => s + (parseInt(v || '0') || 0), 0)
  const splitValid = splitTotal === amount && splitAmounts.every(v => parseInt(v || '0') > 0)

  const submitSplit = useCallback(async () => {
    setState('submitting')
    setErrorMsg('')
    try {
      const amounts = splitAmounts.map(v => parseInt(v || '0'))
      const res = await fetch('/api/payssam/split-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          studentName,
          phone,
          billingMonth,
          amounts,
        }),
      })
      const data = await res.json()
      if (res.ok && data.code === 'SCHEDULED') {
        setSuccessLabel(`영업시간 외 → ${data.scheduled_at_kst} KST 예약 발송 등록됨`)
        setState('success')
        setTimeout(() => {
          onSuccess?.()
          onClose()
        }, 3500)
        return
      }
      if (!res.ok || (data.code !== '0000' && data.code !== 'PARTIAL')) {
        setErrorMsg(data.msg || data.error || '분할 발송에 실패했습니다')
        setState('error')
        return
      }
      if (data.code === 'PARTIAL') {
        setErrorMsg(data.msg)
        setState('error')
        return
      }
      setSuccessLabel(`${parts}건 분할 청구서 발송 완료`)
      setState('success')
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 2000)
    } catch {
      setErrorMsg('네트워크 오류가 발생했습니다')
      setState('error')
    }
  }, [splitAmounts, studentId, studentName, phone, billingMonth, parts, onClose, onSuccess])

  const canDestroy = status === 'sent'   // 미결제 발송 상태만 파기
  const canCancel = status === 'paid'    // 결제완료만 취소
  const canSplit = status === 'sent'     // 미결제 발송 상태만 분할

  if (!mounted) return null

  const modal = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => { if (state !== 'submitting') onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="bg-[var(--bg-card)] w-full max-w-md rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold tracking-tight">
            {state === 'configuring-split' ? '분할결제 설정' : '청구서 관리'}
          </h2>
          <button
            onClick={() => { if (state !== 'submitting') onClose() }}
            className="p-1.5 text-[var(--text-4)] hover:text-[var(--text-3)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors"
            disabled={state === 'submitting'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-[var(--bg-card-hover)] rounded-xl p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-3)]">학생</span>
              <span className="text-sm font-semibold">{studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-3)]">청구 금액</span>
              <span className="text-sm font-bold">{amount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-3)]">상태</span>
              <span className="text-sm font-semibold">
                {status === 'sent' ? '발송됨' : status === 'paid' ? '결제완료' : '취소됨'}
              </span>
            </div>
          </div>

          {state === 'success' && (
            <div className="flex items-center justify-center gap-2 p-4 bg-[var(--green-dim)] rounded-xl">
              <Check className="w-5 h-5 text-[var(--paid-text)]" />
              <span className="text-sm font-bold text-[var(--paid-text)]">{successLabel}</span>
            </div>
          )}

          {state === 'error' && (
            <div className="flex items-start gap-2 p-3 bg-[var(--red-dim)] rounded-xl">
              <AlertTriangle className="w-4 h-4 text-[var(--red)] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[var(--red)]">실패</p>
                <p className="text-xs text-[var(--text-3)] mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {(state === 'confirming-destroy' || state === 'confirming-cancel' || state === 'confirming-reissue') && (
            <div className="flex items-start gap-2 p-3 bg-[var(--orange-dim)] rounded-xl">
              <AlertTriangle className="w-4 h-4 text-[var(--orange)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--orange)]">
                {state === 'confirming-destroy'
                  ? <>청구서를 <strong>파기</strong>합니다. 학부모는 더이상 이 청구서로 결제할 수 없습니다.</>
                  : state === 'confirming-cancel'
                  ? <><strong>{amount.toLocaleString()}원</strong> 결제를 취소합니다. 학부모에게 환불 처리됩니다.</>
                  : <>기존 청구서를 파기하고 <strong>새 청구서를 발송</strong>합니다. 학부모 카톡에 새 결제 링크가 전송됩니다.</>}
              </p>
            </div>
          )}

          {state === 'configuring-split' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-2)]">분할 개수</span>
                <div className="flex gap-1">
                  {[2, 3, 4].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setParts(n as 2 | 3 | 4)}
                      className={`w-10 h-9 rounded-lg text-sm font-bold transition-colors ${
                        parts === n
                          ? 'bg-[var(--blue)] text-white'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-3)] hover:bg-[var(--border-light)]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                {Array.from({ length: parts }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-[var(--text-4)] w-10 shrink-0">{i + 1}/{parts}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={splitAmounts[i] ? parseInt(splitAmounts[i]).toLocaleString() : ''}
                      onChange={e => updateSplitAmount(i, e.target.value)}
                      placeholder="0"
                      className="flex-1 px-3 py-2 border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                    />
                    <span className="text-xs text-[var(--text-4)] w-4">원</span>
                  </div>
                ))}
              </div>
              <div className={`flex justify-between text-sm rounded-lg px-3 py-2 ${splitValid ? 'bg-[var(--green-dim)] text-[var(--paid-text)]' : 'bg-[var(--red-dim)] text-[var(--red)]'}`}>
                <span>합계</span>
                <span className="font-bold">
                  {splitTotal.toLocaleString()}원 / {amount.toLocaleString()}원
                </span>
              </div>
              <p className="text-xs text-[var(--text-4)] leading-relaxed">
                ・ 기존 청구서는 파기되고 새로 <strong>{parts}개</strong> 청구서가 발송됩니다<br />
                ・ 다음 달도 이 분할 방식 그대로 자동 발송됩니다
              </p>
            </div>
          )}

          {state !== 'success' && (
            <div className="flex flex-col gap-2">
              {(state === 'confirming-destroy' || state === 'confirming-cancel' || state === 'confirming-reissue') ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setState('idle')}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-3)] hover:bg-[var(--border-light)]"
                  >
                    돌아가기
                  </button>
                  <button
                    onClick={() => submit(state === 'confirming-destroy' ? 'destroy' : state === 'confirming-cancel' ? 'cancel' : 'reissue')}
                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white hover:opacity-90"
                    style={{ background: state === 'confirming-reissue' ? 'var(--blue)' : 'var(--red)' }}
                  >
                    확인, 진행합니다
                  </button>
                </div>
              ) : state === 'configuring-split' ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setState('idle')}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-3)] hover:bg-[var(--border-light)]"
                  >
                    돌아가기
                  </button>
                  <button
                    onClick={submitSplit}
                    disabled={!splitValid}
                    className="flex-1 py-3 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--blue)' }}
                  >
                    {parts}건 분할 결제
                  </button>
                </div>
              ) : state === 'submitting' ? (
                <button disabled className="py-3 rounded-xl text-sm font-bold bg-[var(--blue)] text-white opacity-70 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> 처리 중...
                </button>
              ) : (
                <>
                  {canDestroy && (
                    <>
                      <button
                        onClick={() => setState('confirming-reissue')}
                        className="w-full py-3 rounded-xl text-sm font-bold bg-[var(--blue)] text-white hover:opacity-90 flex items-center justify-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        파기 후 재발송 (새 청구서)
                      </button>
                      {canSplit && (
                        <button
                          onClick={() => {
                            const perPart = Math.floor(amount / 3)
                            const lastAdjust = amount - perPart * 3
                            setSplitAmounts([String(perPart), String(perPart), String(perPart + lastAdjust)])
                            setParts(3)
                            setState('configuring-split')
                          }}
                          className="w-full py-3 rounded-xl text-sm font-bold bg-[var(--bg-elevated)] text-[var(--text-2)] hover:bg-[var(--border-light)] flex items-center justify-center gap-2"
                        >
                          <Split className="w-4 h-4" />
                          분할결제로 변경
                        </button>
                      )}
                      <button
                        onClick={() => setState('confirming-destroy')}
                        className="w-full py-3 rounded-xl text-sm font-bold bg-[var(--red-dim)] text-[var(--red)] hover:opacity-90 flex items-center justify-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        청구서 파기만 (발송 취소)
                      </button>
                    </>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => setState('confirming-cancel')}
                      className="w-full py-3 rounded-xl text-sm font-bold bg-[var(--red-dim)] text-[var(--red)] hover:opacity-90 flex items-center justify-center gap-2"
                    >
                      <Undo2 className="w-4 h-4" />
                      결제 취소 (환불)
                    </button>
                  )}
                  {!canDestroy && !canCancel && (
                    <p className="text-center text-sm text-[var(--text-4)] py-4">
                      현재 상태에서 수행할 수 있는 작업이 없습니다
                    </p>
                  )}
                  <button
                    onClick={onClose}
                    className="w-full py-3 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-3)] hover:bg-[var(--border-light)]"
                  >
                    닫기
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )

  return createPortal(modal, document.body)
}
