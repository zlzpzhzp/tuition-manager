'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, Send, AlertTriangle, Check, Loader2 } from 'lucide-react'

interface Props {
  studentName: string
  studentId: string
  phone: string
  amount: number
  billingMonth: string
  onClose: () => void
  onSuccess?: () => void
}

type SendState = 'idle' | 'confirming' | 'sending' | 'success' | 'error'

export default function BillSendModal({ studentName, studentId, phone, amount, billingMonth, onClose, onSuccess }: Props) {
  const [state, setState] = useState<SendState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [billId, setBillId] = useState('')
  const [shortUrl, setShortUrl] = useState('')

  // 전화번호 유효성 검사
  const cleanPhone = phone.replace(/-/g, '')
  const isPhoneValid = /^01[016789]\d{7,8}$/.test(cleanPhone)

  // 금액 유효성 검사
  const isAmountValid = amount > 0

  // ESC 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && state !== 'sending') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, state])

  const handleSend = useCallback(async () => {
    if (state === 'sending' || state === 'success') return

    // 1단계: 확인 요청
    if (state !== 'confirming') {
      setState('confirming')
      return
    }

    // 2단계: 실제 발송
    setState('sending')
    setErrorMsg('')

    try {
      const res = await fetch('/api/payssam/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          studentName,
          phone: cleanPhone,
          amount,
          productName: `${billingMonth.replace('-', '년 ')}월 수업료`,
          billingMonth,
        }),
      })

      const data = await res.json()

      if (!res.ok || data.code !== '0000') {
        const msg = data.msg || data.error || '청구서 발송에 실패했습니다'
        setErrorMsg(msg)
        setState('error')
        return
      }

      setBillId(data.bill_id || '')
      setShortUrl(data.shortURL || '')
      setState('success')

      // 성공 후 2초 뒤 자동 닫기
      setTimeout(() => {
        onSuccess?.()
        onClose()
      }, 2500)

    } catch (err) {
      setErrorMsg('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      setState('error')
    }
  }, [state, studentId, studentName, cleanPhone, amount, billingMonth, onClose, onSuccess])

  const formatMonth = (m: string) => {
    const [y, mo] = m.split('-')
    return `${y}년 ${parseInt(mo)}월`
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={() => { if (state !== 'sending') onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="bg-[var(--bg-card)] w-full max-w-md rounded-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Send className="w-5 h-5 text-[var(--blue)]" />
            청구서 발송
          </h2>
          <button
            onClick={() => { if (state !== 'sending') onClose() }}
            className="p-1.5 text-[var(--text-4)] hover:text-[var(--text-3)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors"
            disabled={state === 'sending'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 유효성 경고 */}
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

          {/* 청구 정보 */}
          <div className="bg-[var(--bg-card-hover)] rounded-xl p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-3)]">학생</span>
              <span className="text-sm font-semibold">{studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-3)]">수신 번호</span>
              <span className={`text-sm font-semibold ${isPhoneValid ? '' : 'text-[var(--red)]'}`}>
                {phone || '없음'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-3)]">청구 월</span>
              <span className="text-sm font-semibold">{formatMonth(billingMonth)}</span>
            </div>
            <div className="border-t border-[var(--border)] pt-3 flex justify-between">
              <span className="text-sm font-medium text-[var(--text-3)]">청구 금액</span>
              <span className="text-xl font-extrabold text-[var(--blue)]">{amount.toLocaleString()}원</span>
            </div>
          </div>

          {/* 안내 */}
          <p className="text-xs text-[var(--text-4)] text-center">
            카카오톡 알림톡으로 청구서가 발송됩니다
          </p>

          {/* 에러 메시지 */}
          {state === 'error' && (
            <div className="flex items-start gap-2 p-3 bg-[var(--red-dim)] rounded-xl">
              <AlertTriangle className="w-4 h-4 text-[var(--red)] shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-[var(--red)]">발송 실패</p>
                <p className="text-xs text-[var(--text-3)] mt-0.5">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* 성공 */}
          {state === 'success' && (
            <div className="flex items-center justify-center gap-2 p-4 bg-[var(--green-dim)] rounded-xl">
              <Check className="w-5 h-5 text-[var(--paid-text)]" />
              <span className="text-sm font-bold text-[var(--paid-text)]">청구서가 발송되었습니다</span>
            </div>
          )}

          {/* 확인 단계 경고 */}
          {state === 'confirming' && (
            <div className="flex items-start gap-2 p-3 bg-[var(--orange-dim)] rounded-xl">
              <AlertTriangle className="w-4 h-4 text-[var(--orange)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--orange)]">
                <strong>{studentName}</strong>님에게 <strong>{amount.toLocaleString()}원</strong> 청구서를 발송합니다. 확인하시겠습니까?
              </p>
            </div>
          )}

          {/* 버튼 */}
          {state !== 'success' && (
            <div className="flex gap-2">
              {state === 'confirming' && (
                <button
                  onClick={() => setState('idle')}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[var(--bg-elevated)] text-[var(--text-3)] transition-colors hover:bg-[var(--border-light)]"
                >
                  취소
                </button>
              )}
              <button
                onClick={handleSend}
                disabled={!isPhoneValid || !isAmountValid || state === 'sending'}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2
                  ${state === 'confirming'
                    ? 'bg-[var(--orange)] text-white hover:opacity-90'
                    : state === 'sending'
                      ? 'bg-[var(--blue)] text-white opacity-70 cursor-not-allowed'
                      : state === 'error'
                        ? 'bg-[var(--blue)] text-white hover:opacity-90'
                        : 'bg-[var(--blue)] text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed'
                  }`}
              >
                {state === 'sending' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    발송 중...
                  </>
                ) : state === 'confirming' ? (
                  '확인, 발송합니다'
                ) : state === 'error' ? (
                  '다시 시도'
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    청구서 발송
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
