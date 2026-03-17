'use client'

import type { PaymentMethod } from '@/types'

const INLINE_METHODS: [PaymentMethod, string][] = [
  ['remote', '결제선생'],
  ['card', '카드'],
  ['transfer', '이체'],
  ['cash', '현금'],
  ['other', '기타'],
]

interface Props {
  currentMethod: PaymentMethod
  onMethodChange: (method: PaymentMethod) => void
  position: { top: number; right: number }
  onClose: () => void
}

export default function MethodPickerPopup({ currentMethod, onMethodChange, position, onClose }: Props) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-white border rounded-lg shadow-lg overflow-hidden min-w-[90px]"
        style={{ top: position.top, right: position.right }}
        role="listbox"
        aria-label="결제수단 선택"
      >
        {INLINE_METHODS.map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => { onMethodChange(val); onClose() }}
            role="option"
            aria-selected={currentMethod === val}
            className={`block w-full text-left px-3 py-2 text-xs font-medium hover:bg-gray-50 whitespace-nowrap ${
              currentMethod === val ? 'text-[#3730A3] bg-indigo-50' : 'text-gray-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )
}
