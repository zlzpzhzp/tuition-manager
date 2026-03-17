'use client'

interface Props {
  inlineDate: string
  onDateChange: (date: string) => void
  position: { top: number; left: number }
  onClose: () => void
}

export default function DatePickerPopup({ inlineDate, onDateChange, position, onClose }: Props) {
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

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white border rounded-lg shadow-lg p-2"
        style={{ top: position.top, left: position.left, width: '220px' }}
        role="dialog"
        aria-label="날짜 선택"
      >
        <div className="flex items-center justify-between mb-1.5 px-1">
          <button
            type="button"
            onClick={() => navigateMonth(-1)}
            className="text-gray-400 hover:text-gray-600 text-xs p-0.5"
            aria-label="이전 달"
          >
            ◀
          </button>
          <span className="text-xs font-medium">{year}년 {month + 1}월</span>
          <button
            type="button"
            onClick={() => navigateMonth(1)}
            className="text-gray-400 hover:text-gray-600 text-xs p-0.5"
            aria-label="다음 달"
          >
            ▶
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0 text-center">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => (
            <span key={d} className="text-[9px] text-gray-400 py-0.5">{d}</span>
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
                day === selDate.getDate() ? 'bg-[#1e2d6f] text-white font-bold' :
                'hover:bg-gray-100 text-gray-700'
              }`}
              aria-label={day ? `${month + 1}월 ${day}일` : undefined}
            >
              {day || ''}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
