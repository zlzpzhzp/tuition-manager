'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Trash2, AlertTriangle, Check, Camera, ImagePlus, Loader2 } from 'lucide-react'
import type { Payment, PaymentMethod } from '@/types'
import { PAYMENT_METHOD_LABELS } from '@/types'
import { METHOD_OPTIONS } from '@/lib/constants'
import { getTodayString } from '@/lib/utils'
import { compressImage } from '@/lib/compressImage'

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
  const [memo, setMemo] = useState(payment?.memo ?? prevMemo ?? '')
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

  const [receiptImages, setReceiptImages] = useState<string[]>(payment?.receipt_images ?? [])
  const [uploading, setUploading] = useState(false)
  const [viewImage, setViewImage] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleReceiptFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !payment?.id) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const dataUrl = await compressImage(file, 1200, 0.8)
        const blob = await (await fetch(dataUrl)).blob()
        const fd = new FormData()
        fd.append('file', new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' }))
        const res = await fetch(`/api/payments/${payment.id}/receipt`, { method: 'POST', body: fd })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: '업로드 실패' }))
          alert(err.error || '업로드 실패')
          continue
        }
        const { receipt_images } = await res.json()
        setReceiptImages(receipt_images)
      }
    } finally {
      setUploading(false)
      if (cameraInputRef.current) cameraInputRef.current.value = ''
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [payment?.id])

  const handleReceiptRemove = useCallback(async (url: string) => {
    if (!payment?.id) return
    if (!confirm('이 영수증 사진을 삭제할까요?')) return
    const res = await fetch(`/api/payments/${payment.id}/receipt`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    if (res.ok) {
      const { receipt_images } = await res.json()
      setReceiptImages(receipt_images)
      setViewImage(null)
    } else {
      alert('삭제 실패')
    }
  }, [payment?.id])

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

  if (typeof document === 'undefined') return null

  return createPortal(
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
        className="bg-[var(--bg-card)] w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 rounded-full bg-[var(--text-4)]" />
        </div>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold tracking-tight">{payment ? '납부 정보' : '납부'}</h2>
          <button onClick={onClose} className="p-1.5 text-[var(--text-4)] hover:text-[var(--text-3)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* 전달 비고 내용 알림 */}
        {prevMemo && !payment && (
          <div className="mx-5 mt-4 p-3 bg-[var(--orange-dim)] border border-[var(--orange)] rounded-lg flex gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--orange)] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-[var(--orange)]">전달 비고 내용 (자동 반영)</p>
              <p className="text-xs text-[var(--orange)] mt-0.5">{prevMemo}</p>
            </div>
          </div>
        )}
        {prevMemo && payment && (
          <div className="mx-5 mt-4 p-3 bg-[var(--orange-dim)] border border-[var(--orange)] rounded-lg flex gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--orange)] shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-[var(--orange)]">전달 비고 내용</p>
              <p className="text-xs text-[var(--orange)] mt-0.5">{prevMemo}</p>
            </div>
          </div>
        )}

        {/* 기존 납부 정보 확인 모드 */}
        {payment && !showConfirmDelete ? (
          <div className="p-5 space-y-4">
            <div className="bg-[var(--green-dim)] border border-[var(--paid-text)] rounded-xl p-4 text-center">
              <p className="text-[var(--paid-text)] font-bold text-lg">{payment.amount.toLocaleString()}원</p>
              <p className="text-[var(--paid-text)] text-sm mt-1">납부완료</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-[var(--text-4)]">납부 방법</span>
                {editingMethod ? (
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-1">
                      {METHOD_OPTIONS.map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setEditMethod(val)}
                          className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                            editMethod === val ? 'bg-[var(--blue)] text-white border-[var(--blue)]' : 'bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)]'
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
                      className="p-1.5 bg-[var(--blue-bg)] hover:bg-[var(--blue-dim)] text-[var(--blue)] rounded-full transition-colors"
                      aria-label="저장"
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => { setEditingMethod(false); setEditMethod(payment.method as PaymentMethod) }}
                      className="p-1 text-[var(--text-4)] hover:text-[var(--text-3)]"
                      aria-label="취소"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingMethod(true)}
                    className="font-medium hover:text-[var(--blue)] hover:underline transition-colors"
                  >
                    {PAYMENT_METHOD_LABELS[editMethod]}
                  </button>
                )}
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-[var(--text-4)]">납부일</span>
                {editingDate ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={editDate}
                      onChange={e => setEditDate(e.target.value)}
                      className="px-2 py-1 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                    />
                    <button
                      onClick={async () => {
                        if (onUpdate && payment.id) {
                          await onUpdate(payment.id, { payment_date: editDate })
                        }
                        setEditingDate(false)
                      }}
                      className="p-1.5 bg-[var(--blue-bg)] hover:bg-[var(--blue-dim)] text-[var(--blue)] rounded-full transition-colors"
                      aria-label="저장"
                    >
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => { setEditingDate(false); setEditDate(payment.payment_date) }}
                      className="p-1 text-[var(--text-4)] hover:text-[var(--text-3)]"
                      aria-label="취소"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingDate(true)}
                    className="font-medium hover:text-[var(--blue)] hover:underline transition-colors"
                  >
                    {payment.payment_date}
                  </button>
                )}
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-[var(--text-4)]">해당 월</span>
                <span className="font-medium">{payment.billing_month}</span>
              </div>
              {payment.cash_receipt && (
                <div className="flex justify-between py-2 border-b">
                  <span className="text-[var(--text-4)]">현금영수증</span>
                  <span className="font-medium">{payment.cash_receipt === 'issued' ? '발행완료' : '미발행'}</span>
                </div>
              )}
            </div>

            {/* 영수증 사진 — 현장 카드결제 증빙 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-[var(--text-2)]">영수증 사진</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--blue-dim)] text-[var(--blue)] hover:opacity-80 disabled:opacity-50"
                    aria-label="영수증 촬영"
                  >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                    촬영
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--orange-dim)] text-[var(--orange)] hover:opacity-80 disabled:opacity-50"
                    aria-label="영수증 업로드"
                  >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                    업로드
                  </button>
                </div>
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={e => handleReceiptFiles(e.target.files)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={e => handleReceiptFiles(e.target.files)}
              />
              {receiptImages.length === 0 ? (
                <div className="text-center py-4 text-xs text-[var(--text-4)] bg-[var(--bg-elevated)] rounded-lg border border-dashed border-[var(--border)]">
                  촬영 또는 업로드해서 영수증을 첨부하세요
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {receiptImages.map(url => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setViewImage(url)}
                      className="relative aspect-square overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] hover:opacity-90 transition-opacity"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="영수증" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-[var(--text-4)] shrink-0">비고</span>
              {editingMemo ? (
                <div className="flex items-center gap-1.5 flex-1 ml-4">
                  <input
                    type="text"
                    value={editMemo}
                    onChange={e => setEditMemo(e.target.value)}
                    className="flex-1 px-2 py-1 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                    placeholder="특이사항이 있으면 입력하세요"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  onClick={() => setEditingMemo(true)}
                  className="text-sm font-medium text-right max-w-[60%] hover:text-[var(--blue)] hover:underline transition-colors text-[var(--text-4)]"
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
                  ? 'bg-[var(--green)] text-white scale-105'
                  : 'bg-[var(--green-dim)] border border-[var(--green)] text-[var(--paid-text)] hover:bg-[var(--green-dim)]'
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
              className="w-full py-2.5 bg-[var(--unpaid-bg)] border border-[var(--red-dim)] text-[var(--unpaid-text)] rounded-lg font-medium text-sm hover:opacity-80 flex items-center justify-center gap-2 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
              납부 취소
            </button>
          </div>
        ) : payment && showConfirmDelete ? (
          <div className="p-5 space-y-4">
            <div className="bg-[var(--unpaid-bg)] border border-[var(--red-dim)] rounded-xl p-4 text-center">
              <p className="text-[var(--unpaid-text)] font-bold">납부 기록을 삭제하시겠습니까?</p>
              <p className="text-[var(--unpaid-text)] text-sm mt-1 opacity-80">이 작업은 되돌릴 수 없습니다</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="flex-1 py-2.5 border border-[var(--border)] rounded-lg font-medium text-sm text-[var(--text-3)] hover:bg-[var(--bg-card-hover)]"
              >
                돌아가기
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-[var(--unpaid-bg)] border border-[var(--red-dim)] text-[var(--unpaid-text)] rounded-lg font-medium text-sm hover:opacity-80 transition-opacity"
              >
                삭제
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--text-2)] mb-1">해당 월</label>
              <input
                type="month"
                value={billingMonth}
                onChange={e => setBillingMonth(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-2)] mb-1">납부 금액 *</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                  required
                  autoFocus
                />
                <span className="text-sm text-[var(--text-4)]">원</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-2)] mb-1">납부 방법</label>
              <div className="grid grid-cols-4 gap-1.5">
                {METHOD_OPTIONS.map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMethod(val)}
                    className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                      method === val ? 'bg-[var(--blue)] text-white border-[var(--blue)]' : 'bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {needsCashReceipt && (
              <div>
                <label className="block text-sm font-medium text-[var(--text-2)] mb-1">현금영수증</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCashReceipt('issued')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      cashReceipt === 'issued' ? 'bg-[var(--paid-bg)] text-[var(--paid-text)] border-[var(--paid-text)]' : 'bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    발행완료
                  </button>
                  <button
                    type="button"
                    onClick={() => setCashReceipt('pending')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      cashReceipt === 'pending' ? 'bg-[var(--scheduled-bg)] text-[var(--scheduled-text)] border-[var(--scheduled-text)]' : 'bg-[var(--bg-card)] text-[var(--text-3)] border-[var(--border)] hover:bg-[var(--bg-card-hover)]'
                    }`}
                  >
                    미발행
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--text-2)] mb-1">납부일</label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-2)] mb-1">비고</label>
              <input
                type="text"
                value={memo}
                onChange={e => setMemo(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                placeholder="특이사항이 있으면 입력하세요"
              />
            </div>

            <button
              type="submit"
              disabled={showSuccess}
              className={`w-full py-3 rounded-lg font-medium text-sm transition-all duration-500 flex items-center justify-center gap-2 ${
                showSuccess
                  ? 'bg-[var(--green)] text-white scale-105'
                  : 'bg-[var(--blue)] text-white hover:opacity-90'
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

      {/* 영수증 풀스크린 뷰어 */}
      <AnimatePresence>
        {viewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center"
            onClick={() => setViewImage(null)}
          >
            <button
              onClick={e => { e.stopPropagation(); setViewImage(null) }}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full"
              aria-label="닫기"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); if (viewImage) handleReceiptRemove(viewImage) }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-2 bg-[var(--unpaid-bg)] text-[var(--unpaid-text)] rounded-full font-medium text-sm shadow-lg hover:opacity-90"
              aria-label="영수증 삭제"
            >
              <Trash2 className="w-4 h-4" />
              삭제
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewImage}
              alt="영수증"
              className="max-w-[95vw] max-h-[90vh] object-contain"
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body
  )
}
