'use client'

import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface Props {
  inlineDate: string
  onDateChange: (date: string) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
}

export default function DatePickerPopup({ inlineDate, onDateChange, onClose, anchorRef }: Props) {
  const popupRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      let top = rect.bottom + 4
      let left = Math.max(8, rect.left)
      // 화면 밖으로 나가면 위로
      if (top + 280 > window.innerHeight) top = rect.top - 280
      // 왼쪽 밖으로 나가면 조정
      if (left + 220 > window.innerWidth) left = window.innerWidth - 228
      setPos({ top, left })
    }
  }, [anchorRef])

  const selDate = new Date(inlineDate)
  const year = selDate.getFullYear()
  const month = selDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const navigateMonth = (delta: number) => {
    const nd = new Date(year, month + delta, 1)
    const maxDay = new Date(nd.getFullYear(), nd.getMonth() + 1, 0).getDate()
    const day = Math.min(selDate.getDate(), maxDay)
    onDateChange(
      `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    )
  }

  return createPortal(
    <div data-picker-portal>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div
        ref={popupRef}
        className="fixed z-[61] bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-xl p-2"
        style={{ top: pos.top, left: pos.left, width: '220px' }}
        role="dialog"
        aria-label="날짜 선택"
      >
        <div className="flex items-center justify-between mb-1.5 px-1">
          <button
            type="button"
            onClick={() => navigateMonth(-1)}
            className="text-[var(--text-4)] hover:text-[var(--text-3)] text-xs p-0.5"
            aria-label="이전 달"
          >
            ◀
          </button>
          <span className="text-xs font-medium text-[var(--text-1)]">{year}년 {month + 1}월</span>
          <button
            type="button"
            onClick={() => navigateMonth(1)}
            className="text-[var(--text-4)] hover:text-[var(--text-3)] text-xs p-0.5"
            aria-label="다음 달"
          >
            ▶
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0 text-center">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => (
            <span key={d} className="text-[9px] text-[var(--text-4)] py-0.5">{d}</span>
          ))}
          {cells.map((day, i) => (
            <button
              key={i}
              type="button"
              disabled={!day}
              onClick={() => {
                if (day) {
                  onDateChange(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
                  onClose()
                }
              }}
              className={`text-[11px] py-1 rounded ${
                !day ? '' :
                day === selDate.getDate() ? 'bg-[var(--blue)] text-white font-bold' :
                'hover:bg-[var(--bg-elevated)] text-[var(--text-2)]'
              }`}
              aria-label={day ? `${month + 1}월 ${day}일` : undefined}
            >
              {day || ''}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
