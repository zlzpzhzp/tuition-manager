'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, AlertTriangle, Check, Loader2 } from 'lucide-react'

export interface BulkBillTarget {
  studentId: string
  studentName: string
  className: string
  amount: number
}

interface Props {
  className: string
  targets: BulkBillTarget[]
  onClose: () => void
  onConfirm: () => Promise<void>
}

type State = 'idle' | 'confirming' | 'sending'

export default function BulkBillSendModal({ className, targets, onClose, onConfirm }: Props) {
  const [mounted, setMounted] = useState(false)
  const [state, setState] = useState<State>('idle')

  useEffect(() => { setMounted(true) }, [])

  const total = useMemo(() => targets.reduce((acc, t) => acc + t.amount, 0), [targets])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && state !== 'sending') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, state])

  const handlePrimary = useCallback(async () => {
    if (state === 'sending') return
    if (state !== 'confirming') { setState('confirming'); return }
    setState('sending')
    try { await onConfirm() } finally { /* 모달은 상위에서 닫음 */ }
  }, [state, onConfirm])

  if (!mounted) return null

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
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
            <Send className="w-4 h-4 text-[var(--orange)]" />
            일괄 청구서 발송
            <span className="text-xs font-normal text-[var(--text-4)]">{className}</span>
          </h2>
          <button
            onClick={() => { if (state !== 'sending') onClose() }}
            disabled={state === 'sending'}
            className="p-1.5 text-[var(--text-4)] hover:text-[var(--text-3)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-[var(--bg-elevated)]">
            <span className="text-xs text-[var(--text-3)]">대상 인원</span>
            <span className="text-sm font-bold tabular-nums">{targets.length}명</span>
          </div>

          <div className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)] max-h-72 overflow-y-auto">
            {targets.map(t => (
              <div key={t.studentId} className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-semibold truncate">{t.studentName}</span>
                <span className="text-xs tabular-nums text-[var(--text-3)]">{t.amount.toLocaleString()}원</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-[var(--bg-card-hover)]">
            <span className="text-sm font-medium text-[var(--text-3)]">합계</span>
            <span className="text-lg font-extrabold text-[var(--blue)] tabular-nums">{total.toLocaleString()}원</span>
          </div>

          <p className="text-xs text-[var(--text-4)] text-center">
            카카오톡 알림톡으로 청구서가 발송됩니다
          </p>

          <AnimatePresence>
            {state === 'confirming' && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="flex items-start gap-2 p-3 bg-[var(--orange-dim)] rounded-xl"
              >
                <AlertTriangle className="w-4 h-4 text-[var(--orange)] shrink-0 mt-0.5" />
                <p className="text-sm text-[var(--orange)]">
                  <strong>{targets.length}명</strong>에게 <strong>{total.toLocaleString()}원</strong> 청구서를 일괄 발송합니다. 실행하시겠습니까?
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-5 py-4 border-t border-[var(--border)] flex gap-2">
          <button
            onClick={() => { if (state !== 'sending') { state === 'confirming' ? setState('idle') : onClose() } }}
            disabled={state === 'sending'}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-3)] hover:bg-[var(--border-light)] transition-colors disabled:opacity-40"
          >
            {state === 'confirming' ? '뒤로' : '취소'}
          </button>
          <button
            onClick={handlePrimary}
            disabled={state === 'sending' || targets.length === 0}
            className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              state === 'confirming'
                ? 'bg-[var(--orange)] text-white hover:opacity-90'
                : state === 'sending'
                  ? 'bg-[var(--blue)] text-white opacity-70 cursor-not-allowed'
                  : 'bg-[var(--blue)] text-white hover:opacity-90 disabled:opacity-30'
            }`}
          >
            {state === 'sending' ? (
              <><Loader2 className="w-4 h-4 animate-spin" />발송 시작...</>
            ) : state === 'confirming' ? (
              <><Check className="w-4 h-4" />확인, 발송합니다</>
            ) : (
              <><Send className="w-4 h-4" />일괄 발송</>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )

  return createPortal(modal, document.body)
}
