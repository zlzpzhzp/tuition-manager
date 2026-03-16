'use client'

import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import type { Payment, PaymentMethod } from '@/types'
import { PAYMENT_METHOD_LABELS } from '@/types'

interface Props {
  payment?: Payment | null
  studentId: string
  defaultBillingMonth?: string
  defaultAmount?: number
  onSave: (data: Partial<Payment>) => void
  onDelete?: (paymentId: string) => void
  onClose: () => void
}

const METHOD_OPTIONS: [PaymentMethod, string][] = [
  ['remote', '결제선생'],
  ['card', '카드결제'],
  ['transfer', '계좌이체'],
  ['cash', '현금'],
]

export default function PaymentModal({ payment, studentId, defaultBillingMonth, defaultAmount, onSave, onDelete, onClose }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const currentMonth = today.slice(0, 7)

  const [amount, setAmount] = useState(payment?.amount ? String(payment.amount) : defaultAmount ? String(defaultAmount) : '')
  const [method, setMethod] = useState<PaymentMethod>(payment?.method as PaymentMethod ?? 'remote')
  const [paymentDate, setPaymentDate] = useState(payment?.payment_date ?? today)
  const [billingMonth, setBillingMonth] = useState(payment?.billing_month ?? defaultBillingMonth ?? currentMonth)
  const [memo, setMemo] = useState(payment?.memo ?? '')
  const [cashReceipt, setCashReceipt] = useState<'issued' | 'pending' | null>(payment?.cash_receipt ?? null)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const needsCashReceipt = method === 'transfer' || method === 'cash'

  useEffect(() => {
    if (!needsCashReceipt) {
      setCashReceipt(null)
    } else if (cashReceipt === null) {
      setCashReceipt('pending')
    }
  }, [method, needsCashReceipt, cashReceipt])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!amount || parseInt(amount) <= 0) return
    onSave({
      student_id: studentId,
      amount: parseInt(amount),
      method,
      payment_date: paymentDate,
      billing_month: billingMonth,
      cash_receipt: needsCashReceipt ? cashReceipt : null,
      memo,
    })
  }

  const handleDelete = () => {
    if (payment?.id && onDelete) {
      onDelete(payment.id)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-bold">{payment ? '납부 정보' : '납부 기록'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* 기존 납부 정보 확인 모드 */}
        {payment && !showConfirmDelete ? (
          <div className="p-5 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <p className="text-green-800 font-bold text-lg">{payment.amount.toLocaleString()}원</p>
              <p className="text-green-600 text-sm mt-1">납부완료</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-400">납부 방법</span>
                <span className="font-medium">{PAYMENT_METHOD_LABELS[payment.method as PaymentMethod]}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-400">납부일</span>
                <span className="font-medium">{payment.payment_date}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-400">해당 월</span>
                <span className="font-medium">{payment.billing_month}</span>
              </div>
              {payment.cash_receipt && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-400">현금영수증</span>
                  <span className="font-medium">{payment.cash_receipt === 'issued' ? '발행완료' : '미발행'}</span>
                </div>
              )}
              {payment.memo && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-400">메모</span>
                  <span className="font-medium">{payment.memo}</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowConfirmDelete(true)}
              className="w-full py-2.5 border border-red-300 text-red-600 rounded-lg font-medium text-sm hover:bg-red-50 flex items-center justify-center gap-2"
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
                className="flex-1 py-2.5 border rounded-lg font-medium text-sm text-gray-600 hover:bg-gray-50"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">해당 월</label>
              <input
                type="month"
                value={billingMonth}
                onChange={e => setBillingMonth(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">납부 금액 *</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
                  required
                  autoFocus
                />
                <span className="text-sm text-gray-400">원</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">납부 방법</label>
              <div className="grid grid-cols-4 gap-1.5">
                {METHOD_OPTIONS.map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMethod(val)}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                      method === val ? 'bg-[#1e2d6f] text-white border-[#1e2d6f]' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {needsCashReceipt && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">현금영수증</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCashReceipt('issued')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      cashReceipt === 'issued' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    발행완료
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashReceipt('pending')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      cashReceipt === 'pending' ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    미발행
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">납부일</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
              <input
                type="text"
                value={memo}
                onChange={e => setMemo(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
                placeholder="선택사항"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#1e2d6f] text-white rounded-lg font-medium text-sm hover:opacity-90"
            >
              기록
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
