'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, Trash2, AlertTriangle, Check } from 'lucide-react'
import type { Payment, PaymentMethod } from '@/types'
import { PAYMENT_METHOD_LABELS } from '@/types'
import { METHOD_OPTIONS } from '@/lib/constants'
import { getTodayString } from '@/lib/utils'

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
  const today = getTodayString()
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        ref={modalRef}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) {
            onClose()
          }
        }}
        className="bg-[#212126] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 rounded-full bg-[#5e5e6e]" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2c2c33]">
          <h2 className="text-lg font-bold tracking-tight">{payment ? '납부 정보' : '납부'}</h2>
          <button onClick={onClose} className="p-1.5 text-[#5e5e6e] hover:text-[#8b8b9a] hover:bg-[#36363e] rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* 이전달 비고 알림 */}
        {prevMemo && (
          <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-800">지난달 비고</p>
              <p className="text-xs text-amber-700 mt-0.5">{prevMemo}</p>
            </div>
          </div>
        )}

        {/* 기존 납부 정보 확인 모드 */}
        {payment && !showConfirmDelete ? (
          <div className="p-5 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-green-800 font-bold text-lg">{payment.amount.toLocaleString()}원</p>
              <p className="text-green-600 text-sm mt-1">납부완료</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-[#5e5e6e]">납부 방법</span>
                {editingMethod ? (
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-1">
                      {METHOD_OPTIONS.map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setEditMethod(val)}
                          className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                            editMethod === val ? 'bg-[#3182f6] text-white border-[#3182f6]' : 'bg-[#212126] text-[#8b8b9a] border-gray-300'
                          }`}
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
                      className="p-1 text-green-600 hover:text-green-700"
                      aria-label="저장"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setEditingMethod(false); setEditMethod(payment.method as PaymentMethod) }}
                      className="p-1 text-[#5e5e6e] hover:text-[#8b8b9a]"
                      aria-label="취소"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingMethod(true)}
                    className="font-medium hover:text-[#3182f6] hover:underline transition-colors"
                  >
                    {PAYMENT_METHOD_LABELS[editMethod]}
                  </button>
                )}
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-[#5e5e6e]">납부일</span>
                {editingDate ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={editDate}
                      onChange={e => setEditDate(e.target.value)}
                      className="px-2 py-1 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182f6]"
                    />
                    <button
                      onClick={async () => {
                        if (onUpdate && payment.id) {
                          await onUpdate(payment.id, { payment_date: editDate })
                        }
                        setEditingDate(false)
                      }}
                      className="p-1 text-green-600 hover:text-green-700"
                      aria-label="저장"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => { setEditingDate(false); setEditDate(payment.payment_date) }}
                      className="p-1 text-[#5e5e6e] hover:text-[#8b8b9a]"
                      aria-label="취소"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingDate(true)}
                    className="font-medium hover:text-[#3182f6] hover:underline transition-colors"
                  >
                    {payment.payment_date}
                  </button>
                )}
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-[#5e5e6e]">해당 월</span>
                <span className="font-medium">{payment.billing_month}</span>
              </div>
              {payment.cash_receipt && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-[#5e5e6e]">현금영수증</span>
                  <span className="font-medium">{payment.cash_receipt === 'issued' ? '발행완료' : '미발행'}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-[#5e5e6e] shrink-0">비고</span>
              {editingMemo ? (
                <div className="flex items-center gap-1.5 flex-1 ml-4">
                  <input
                    type="text"
                    value={editMemo}
                    onChange={e => setEditMemo(e.target.value)}
                    className="flex-1 px-2 py-1 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182f6]"
                    placeholder="특이사항이 있으면 입력하세요"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingMemo(true)}
                  className="text-sm font-medium text-right max-w-[60%] hover:text-[#3182f6] hover:underline transition-colors text-[#5e5e6e]"
                >
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
              className={`w-full py-3 rounded-lg font-medium text-sm transition-all duration-500 flex items-center justify-center gap-2 ${
                showConfirmSuccess
                  ? 'bg-green-500 text-white scale-105'
                  : 'bg-green-50 border border-green-300 text-green-700 hover:bg-green-100'
              }`}
            >
              {showConfirmSuccess ? (
                <span className="flex items-center gap-2 animate-[checkBounce_0.5s_ease-out]">
                  <Check className="w-6 h-6" strokeWidth={3} />
                </span>
              ) : '확인'}
            </button>

            <button
              onClick={() => setShowConfirmDelete(true)}
              className="w-full py-2.5 bg-red-50 border border-red-300 text-red-600 rounded-lg font-medium text-sm hover:bg-red-100 flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              납부 취소
            </button>
          </div>
        ) : payment && showConfirmDelete ? (
          <div className="p-5 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="text-red-800 font-bold">납부 기록을 삭제하시겠습니까?</p>
              <p className="text-red-600 text-sm mt-1">이 작업은 되돌릴 수 없습니다</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 py-2.5 border rounded-lg font-medium text-sm text-[#8b8b9a] hover:bg-[#2c2c33]"
              >
                돌아가기
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#c0c0cc] mb-1">해당 월</label>
              <input
                type="month"
                value={billingMonth}
                onChange={e => setBillingMonth(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182f6]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#c0c0cc] mb-1">납부 금액 *</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182f6]"
                  required
                  autoFocus
                />
                <span className="text-sm text-[#5e5e6e]">원</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#c0c0cc] mb-1">납부 방법</label>
              <div className="grid grid-cols-4 gap-1.5">
                {METHOD_OPTIONS.map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMethod(val)}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                      method === val ? 'bg-[#3182f6] text-white border-[#3182f6]' : 'bg-[#212126] text-[#8b8b9a] border-gray-300 hover:bg-[#2c2c33]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {needsCashReceipt && (
              <div>
                <label className="block text-sm font-medium text-[#c0c0cc] mb-1">현금영수증</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCashReceipt('issued')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      cashReceipt === 'issued' ? 'bg-green-600 text-white border-green-600' : 'bg-[#212126] text-[#8b8b9a] border-gray-300 hover:bg-[#2c2c33]'
                    }`}
                  >
                    발행완료
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashReceipt('pending')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      cashReceipt === 'pending' ? 'bg-orange-500 text-white border-orange-500' : 'bg-[#212126] text-[#8b8b9a] border-gray-300 hover:bg-[#2c2c33]'
                    }`}
                  >
                    미발행
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[#c0c0cc] mb-1">납부일</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182f6]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[#c0c0cc] mb-1">비고</label>
              <input
                type="text"
                value={memo}
                onChange={e => setMemo(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3182f6]"
                placeholder="특이사항이 있으면 입력하세요"
              />
            </div>

            <button
              type="submit"
              disabled={showSuccess}
              className={`w-full py-3 rounded-lg font-medium text-sm transition-all duration-500 flex items-center justify-center gap-2 ${
                showSuccess
                  ? 'bg-green-500 text-white scale-105'
                  : 'bg-[#3182f6] text-white hover:opacity-90'
              }`}
            >
              {showSuccess ? (
                <span className="flex items-center gap-2 animate-[checkBounce_0.5s_ease-out]">
                  <Check className="w-6 h-6" strokeWidth={3} />
                  <span className="text-base font-bold">완료!</span>
                </span>
              ) : '납부'}
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}
