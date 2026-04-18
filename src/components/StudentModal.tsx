'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { Student, Grade, Class } from '@/types'
import { getTodayString, formatPhone } from '@/lib/utils'

interface Props {
  student?: Student | null
  grades: (Grade & { classes: Class[] })[]
  defaultClassId?: string | null
  onSave: (data: Partial<Student>) => void
  onClose: () => void
}

export default function StudentModal({ student, grades, defaultClassId, onSave, onClose }: Props) {
  const [name, setName] = useState(student?.name ?? '')
  const [classId, setClassId] = useState(student?.class_id ?? defaultClassId ?? '')
  const [phone, setPhone] = useState(formatPhone(student?.phone ?? ''))
  const [parentPhone, setParentPhone] = useState(formatPhone(student?.parent_phone ?? ''))
  const [enrollmentDate, setEnrollmentDate] = useState(student?.enrollment_date ?? getTodayString())
  const [customFee, setCustomFee] = useState(student?.custom_fee != null ? String(student.custom_fee) : '')
  const [memo, setMemo] = useState(student?.memo ?? '')

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({
      name: name.trim(),
      class_id: classId || null,
      phone,
      parent_phone: parentPhone,
      enrollment_date: enrollmentDate,
      custom_fee: customFee ? parseInt(customFee) : null,
      memo,
    })
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
          <h2 className="text-lg font-bold tracking-tight">{student ? '학생 수정' : '학생 등록'}</h2>
          <button onClick={onClose} className="p-1.5 text-[var(--text-4)] hover:text-[var(--text-3)] hover:bg-[var(--bg-elevated)] rounded-lg transition-colors"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1">이름 *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1">반</label>
            <select
              value={classId}
              onChange={e => setClassId(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
            >
              <option value="">반 선택</option>
              {grades.map(g => (
                <optgroup key={g.id} label={g.name}>
                  {g.classes?.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.monthly_fee.toLocaleString()}원)
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1">첫 등원일 *</label>
            <input
              type="date"
              value={enrollmentDate}
              onChange={e => setEnrollmentDate(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-[var(--text-2)] mb-1">학생 연락처</label>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={e => setPhone(formatPhone(e.target.value))}
                placeholder="010-0000-0000"
                className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-2)] mb-1">학부모 연락처</label>
              <input
                type="tel"
                inputMode="numeric"
                value={parentPhone}
                onChange={e => setParentPhone(formatPhone(e.target.value))}
                placeholder="010-0000-0000"
                className="w-full px-3 py-2 border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1">
              개별 원비 <span className="text-[var(--text-4)] font-normal">(비워두면 반 기본 원비 적용)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={customFee}
                onChange={e => setCustomFee(e.target.value)}
                placeholder="반 기본 원비 사용"
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
              <span className="text-sm text-[var(--text-4)]">원</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-2)] mb-1">메모</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)] resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[var(--blue)] text-white rounded-lg font-medium text-sm hover:opacity-90"
          >
            {student ? '수정' : '등록'}
          </button>
        </form>
      </motion.div>
    </motion.div>,
    document.body
  )
}
