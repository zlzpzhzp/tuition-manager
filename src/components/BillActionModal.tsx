'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, Trash2, Undo2, AlertTriangle, Check, Loader2 } from 'lucide-react'

interface Props {
  studentName: string
  billId: string
  amount: number
  status: 'sent' | 'paid' | 'cancelled'
  onClose: () => void
  onSuccess?: () => void
}

type ActionState = 'idle' | 'confirming-destroy' | 'confirming-cancel' | 'submitting' | 'success' | 'error'

export default function BillActionModal({ studentName, billId, amount, status, onClose, onSuccess }: Props) {
  const [state, setState] = useState<ActionState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [successLabel, setSuccessLabel] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && state !== 'submitting') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, state])

  const submit = useCallback(async (kind: 'destroy' | 'cancel') => {
    setState('submitting')
    setErrorMsg('')
    try {
      const url = kind === 'destroy' ? '/api/payssam/destroy' : '/api/payssam/cancel'
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
      setSuccessLabel(kind === 'destroy' ? '청구서가 파기되었습니다' : '결제가 취소되었습니다')
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

  const canDestroy = status === 'sent'   // 미결제 발송 상태만 파기
  const canCancel = status === 'paid'    // 결제완료만 취소

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
          <h2 className="text-lg font-bold tracking-tight">청구서 관리</h2>
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

          {(state === 'confirming-destroy' || state === 'confirming-cancel') && (
            <div className="flex items-start gap-2 p-3 bg-[var(--orange-dim)] rounded-xl">
              <AlertTriangle className="w-4 h-4 text-[var(--orange)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--orange)]">
                {state === 'confirming-destroy'
                  ? <>청구서를 <strong>파기</strong>합니다. 학부모는 더이상 이 청구서로 결제할 수 없습니다.</>
                  : <><strong>{amount.toLocaleString()}원</strong> 결제를 취소합니다. 학부모에게 환불 처리됩니다.</>}
              </p>
            </div>
          )}

          {state !== 'success' && (
            <div className="flex flex-col gap-2">
              {(state === 'confirming-destroy' || state === 'confirming-cancel') ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => setState('idle')}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-3)] hover:bg-[var(--border-light)]"
                  >
                    돌아가기
                  </button>
                  <button
                    onClick={() => submit(state === 'confirming-destroy' ? 'destroy' : 'cancel')}
                    className="flex-1 py-3 rounded-xl text-sm font-bold bg-[var(--red)] text-white hover:opacity-90"
                  >
                    확인, 진행합니다
                  </button>
                </div>
              ) : state === 'submitting' ? (
                <button disabled className="py-3 rounded-xl text-sm font-bold bg-[var(--blue)] text-white opacity-70 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> 처리 중...
                </button>
              ) : (
                <>
                  {canDestroy && (
                    <button
                      onClick={() => setState('confirming-destroy')}
                      className="w-full py-3 rounded-xl text-sm font-bold bg-[var(--red-dim)] text-[var(--red)] hover:opacity-90 flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      청구서 파기 (미결제 발송 취소)
                    </button>
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
