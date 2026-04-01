'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { Student, Grade, Class } from '@/types'
import { getTodayString } from '@/lib/utils'

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
  const [phone, setPhone] = useState(student?.phone ?? '')
  const [parentPhone, setParentPhone] = useState(student?.parent_phone ?? '')
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

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-bold">{student ? '학생 수정' : '학생 등록'}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이름 *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">반</label>
            <select
              value={classId}
              onChange={e => setClassId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">첫 등원일 *</label>
            <input
              type="date"
              value={enrollmentDate}
              onChange={e => setEnrollmentDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">학생 연락처</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                pattern="^[\d\-]*$"
                title="숫자와 하이픈만 입력 가능합니다"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">학부모 연락처</label>
              <input
                type="tel"
                value={parentPhone}
                onChange={e => setParentPhone(e.target.value)}
                placeholder="010-0000-0000"
                pattern="^[\d\-]*$"
                title="숫자와 하이픈만 입력 가능합니다"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              개별 원비 <span className="text-gray-400 font-normal">(비워두면 반 기본 원비 적용)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={customFee}
                onChange={e => setCustomFee(e.target.value)}
                placeholder="반 기본 원비 사용"
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
              />
              <span className="text-sm text-gray-400">원</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f] resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[#1e2d6f] text-white rounded-lg font-medium text-sm hover:opacity-90"
          >
            {student ? '수정' : '등록'}
          </button>
        </form>
      </div>
    </div>
  )
}
