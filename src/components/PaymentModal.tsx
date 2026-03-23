'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, Trash2, AlertTriangle, Check } from 'lucide-react'
import type { Payment, PaymentMethod } from '@/types'
import { PAYMENT_METHOD_LABELS } from '@/types'
import { METHOD_OPTIONS } from '@/lib/constants'

interface Props {
  payment?: Payment | null
  studentId: string
  defaultBillingMonth?: string
  defaultAmount?: number
  prevMemo?: string | null
  prevMethod?: PaymentMethod | null
  onSave: (data: Partial<Payment>) => Promise<void> | void
  onUpdate?: (paymentId: string, data: Partial<Payment>) => Promise<void> | void
  onDelete?: (paymentId: string) => void
  onClose: () => void
}

export default function PaymentModal({ payment, studentId, defaultBillingMonth, defaultAmount, prevMemo, prevMethod, onSave, onUpdate, onDelete, onClose }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const currentMonth = today.slice(0, 7)

  const [amount, setAmount] = useState(payment?.amount ? String(payment.amount) : defaultAmount ? String(defaultAmount) : '')
  const [method, setMethod] = useState<PaymentMethod>(payment?.method as PaymentMethod ?? prevMethod ?? 'remote')
  const [paymentDate, setPaymentDate] = useState(payment?.payment_date ?? today)
  const [billingMonth, setBillingMonth] = useState(payment?.billing_month ?? defaultBillingMonth ?? currentMonth)
  const [memo, setMemo] = useState(payment?.memo ?? '')
  const [cashReceipt, setCashReceipt] = useState<'issued' | 'pending' | null>(payment?.cash_receipt ?? null)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showConfirmSuccess, setShowConfirmSuccess] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [editDate, setEditDate] = useState(payment?.payment_date ?? today)
  const [editingMemo, setEditingMemo] = useState(false)
  const [editMemo, setEditMemo] = useState(payment?.memo ?? '')
  const [editingMethod, setEditingMethod] = useState(false)
  const [editMethod, setEditMethod] = useState<PaymentMethod>(payment?.method as PaymentMethod ?? prevMethod ?? 'remote')
  const modalRef = useRef<HTMLDivElement>(null)
  const needsCashReceipt = method === 'transfer' || method === 'cash'

  useEffect(() => {
    if (!needsCashReceipt) {
      setCashReceipt(null)
    } else {
      setCashReceipt(prev => prev === null ? 'pending' : prev)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || parseInt(amount) <= 0 || showSuccess) return

    // 1. API에 먼저 저장
    await onSave({
      student_id: studentId,
      amount: parseInt(amount),
      method,
      payment_date: paymentDate,
      billing_month: billingMonth,
      cash_receipt: needsCashReceipt ? cashReceipt : null,
      memo,
    })

    // 2. 저장 완료 후 체크 애니메이션 표시
    setShowSuccess(true)

    // 3. 애니메이션 보여준 후 모달 닫기
    setTimeout(() => {
      onClose()
    }, 1000)
  }, [amount, showSuccess, studentId, method, paymentDate, billingMonth, needsCashReceipt, cashReceipt, memo, onSave, onClose])

  const handleDelete = () => {
    if (payment?.id && onDelete) {
      onDelete(payment.id)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-backdrop" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={onClose}>
      <div
        ref={modalRef}
        className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto animate-modal-up"
        style={{ background: 'var(--bg-card)', borderRadius: '16px 16px 0 0', ...(typeof window !== 'undefined' && window.innerWidth >= 640 ? { borderRadius: 16 } : {}) }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid var(--separator)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: 'var(--text-primary)' }}>{payment ? '납부 정보' : '납부'}</h2>
          <button onClick={onClose} className="ios-tap" style={{ padding: 4, color: 'var(--text-secondary)' }}><X style={{ width: 20, height: 20 }} /></button>
        </div>

        {/* 이전달 비고 알림 */}
        {prevMemo && (
          <div style={{ margin: '12px 20px 0', padding: 12, background: 'rgba(255,149,0,0.08)', borderRadius: 12, display: 'flex', gap: 8 }}>
            <AlertTriangle style={{ width: 16, height: 16, color: 'var(--color-orange)', flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>지난달 비고</p>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{prevMemo}</p>
            </div>
          </div>
        )}

        {/* 기존 납부 정보 확인 모드 */}
        {payment && !showConfirmDelete ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(52,199,89,0.06)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-green)' }}>{payment.amount.toLocaleString()}원</p>
              <p style={{ fontSize: 15, fontWeight: 400, color: 'var(--color-green)', marginTop: 4 }}>납부완료</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--separator)' }}>
                <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)' }}>납부 방법</span>
                {editingMethod ? (
                  <div className="flex items-center gap-1.5">
                    <div style={{ display: 'flex', gap: 4 }}>
                      {METHOD_OPTIONS.map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setEditMethod(val)}
                          className="ios-tap"
                          style={{
                            padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                            background: editMethod === val ? 'var(--accent)' : 'var(--bg-primary)',
                            color: editMethod === val ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={async () => {
                        if (onUpdate && payment.id && editMethod !== payment.method) {
                          await onUpdate(payment.id, { method: editMethod })
                        }
                        setEditingMethod(false)
                      }}
                      className="ios-tap" style={{ padding: 4, color: 'var(--color-green)' }} aria-label="저장"
                    >
                      <Check style={{ width: 16, height: 16 }} />
                    </button>
                    <button
                      onClick={() => { setEditingMethod(false); setEditMethod(payment.method as PaymentMethod) }}
                      className="ios-tap" style={{ padding: 4, color: 'var(--text-tertiary)' }} aria-label="취소"
                    >
                      <X style={{ width: 16, height: 16 }} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setEditingMethod(true)} className="ios-tap" style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-primary)', textAlign: 'right' }}>
                    {PAYMENT_METHOD_LABELS[editMethod]}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '0.5px solid var(--separator)' }}>
                <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)' }}>납부일</span>
                {editingDate ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={editDate}
                      onChange={e => setEditDate(e.target.value)}
                      style={{ padding: '4px 8px', border: '0.5px solid var(--separator)', borderRadius: 8, fontSize: 15, outline: 'none' }}
                    />
                    <button
                      onClick={async () => {
                        if (onUpdate && payment.id) {
                          await onUpdate(payment.id, { payment_date: editDate })
                        }
                        setEditingDate(false)
                      }}
                      className="ios-tap" style={{ padding: 4, color: 'var(--color-green)' }} aria-label="저장"
                    >
                      <Check style={{ width: 16, height: 16 }} />
                    </button>
                    <button
                      onClick={() => { setEditingDate(false); setEditDate(payment.payment_date) }}
                      className="ios-tap" style={{ padding: 4, color: 'var(--text-tertiary)' }} aria-label="취소"
                    >
                      <X style={{ width: 16, height: 16 }} />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setEditingDate(true)} className="ios-tap" style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-primary)', textAlign: 'right' }}>
                    {payment.payment_date}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid var(--separator)' }}>
                <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)' }}>해당 월</span>
                <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-primary)' }}>{payment.billing_month}</span>
              </div>
              {payment.cash_receipt && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '0.5px solid var(--separator)' }}>
                  <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)' }}>현금영수증</span>
                  <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-primary)' }}>{payment.cash_receipt === 'issued' ? '발행완료' : '미발행'}</span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
              <span style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', flexShrink: 0 }}>비고</span>
              {editingMemo ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, marginLeft: 16 }}>
                  <input
                    type="text"
                    value={editMemo}
                    onChange={e => setEditMemo(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', border: '0.5px solid var(--separator)', borderRadius: 8, fontSize: 15, outline: 'none' }}
                    placeholder="특이사항이 있으면 입력하세요"
                    autoFocus
                  />
                </div>
              ) : (
                <button onClick={() => setEditingMemo(true)} className="ios-tap" style={{ fontSize: 15, fontWeight: 400, color: payment.memo ? 'var(--text-primary)' : 'var(--text-tertiary)', textAlign: 'right', maxWidth: '60%' }}>
                  {payment.memo || '탭하여 입력'}
                </button>
              )}
            </div>

            <button
              disabled={showConfirmSuccess}
              onClick={async () => {
                if (editMemo !== (payment.memo ?? '') && onUpdate && payment.id) {
                  await onUpdate(payment.id, { memo: editMemo.trim() || '' })
                }
                setShowConfirmSuccess(true)
                setTimeout(() => onClose(), 800)
              }}
              className="ios-tap"
              style={{
                width: '100%', height: 50, borderRadius: 12, fontSize: 17, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: showConfirmSuccess ? 'var(--color-green)' : 'var(--accent)',
                color: '#fff', transition: 'all 0.3s',
              }}
            >
              {showConfirmSuccess ? (
                <span className="animate-[checkBounce_0.5s_ease-out]" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check style={{ width: 24, height: 24 }} strokeWidth={3} />
                </span>
              ) : '확인'}
            </button>

            <button
              onClick={() => setShowConfirmDelete(true)}
              className="ios-tap"
              style={{
                width: '100%', height: 50, borderRadius: 12, fontSize: 17, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'rgba(255,59,48,0.08)', color: 'var(--color-red)',
              }}
            >
              <Trash2 style={{ width: 16, height: 16 }} />
              납부 취소
            </button>
          </div>
        ) : payment && showConfirmDelete ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'rgba(255,59,48,0.06)', borderRadius: 12, padding: 20, textAlign: 'center' }}>
              <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>납부 기록을 삭제하시겠습니까?</p>
              <p style={{ fontSize: 15, color: 'var(--color-red)', marginTop: 4 }}>이 작업은 되돌릴 수 없습니다</p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setShowConfirmDelete(false)} className="ios-tap" style={{ flex: 1, height: 50, borderRadius: 12, fontSize: 17, fontWeight: 600, background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--separator)' }}>
                돌아가기
              </button>
              <button onClick={handleDelete} className="ios-tap" style={{ flex: 1, height: 50, borderRadius: 12, fontSize: 17, fontWeight: 600, background: 'var(--color-red)', color: '#fff' }}>
                삭제
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', marginBottom: 6 }}>해당 월</label>
              <input type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '0.5px solid var(--separator)', borderRadius: 8, fontSize: 15, outline: 'none', background: 'var(--bg-card)' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', marginBottom: 6 }}>납부 금액 *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} required autoFocus
                  style={{ flex: 1, padding: '10px 12px', border: '0.5px solid var(--separator)', borderRadius: 8, fontSize: 15, outline: 'none', background: 'var(--bg-card)' }} />
                <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>원</span>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', marginBottom: 6 }}>납부 방법</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                {METHOD_OPTIONS.map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setMethod(val)} className="ios-tap"
                    style={{
                      padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                      background: method === val ? 'var(--accent)' : 'var(--bg-primary)',
                      color: method === val ? '#fff' : 'var(--text-secondary)',
                    }}
                  >{label}</button>
                ))}
              </div>
            </div>

            {needsCashReceipt && (
              <div>
                <label style={{ display: 'block', fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', marginBottom: 6 }}>현금영수증</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setCashReceipt('issued')} className="ios-tap"
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 15, fontWeight: 600, background: cashReceipt === 'issued' ? 'var(--color-green)' : 'var(--bg-primary)', color: cashReceipt === 'issued' ? '#fff' : 'var(--text-secondary)' }}>
                    발행완료
                  </button>
                  <button type="button" onClick={() => setCashReceipt('pending')} className="ios-tap"
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 15, fontWeight: 600, background: cashReceipt === 'pending' ? 'var(--color-orange)' : 'var(--bg-primary)', color: cashReceipt === 'pending' ? '#fff' : 'var(--text-secondary)' }}>
                    미발행
                  </button>
                </div>
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', marginBottom: 6 }}>납부일</label>
              <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '0.5px solid var(--separator)', borderRadius: 8, fontSize: 15, outline: 'none', background: 'var(--bg-card)' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 15, fontWeight: 400, color: 'var(--text-secondary)', marginBottom: 6 }}>비고</label>
              <input type="text" value={memo} onChange={e => setMemo(e.target.value)} placeholder="특이사항이 있으면 입력하세요"
                style={{ width: '100%', padding: '10px 12px', border: '0.5px solid var(--separator)', borderRadius: 8, fontSize: 15, outline: 'none', background: 'var(--bg-card)' }} />
            </div>

            <button type="submit" disabled={showSuccess} className="ios-tap"
              style={{
                width: '100%', height: 50, borderRadius: 12, fontSize: 17, fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: showSuccess ? 'var(--color-green)' : 'var(--accent)',
                color: '#fff', transition: 'all 0.3s',
              }}
            >
              {showSuccess ? (
                <span className="animate-[checkBounce_0.5s_ease-out]" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check style={{ width: 24, height: 24 }} strokeWidth={3} />
                  <span style={{ fontSize: 17, fontWeight: 700 }}>완료!</span>
                </span>
              ) : '납부'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
