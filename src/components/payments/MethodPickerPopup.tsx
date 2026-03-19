'use client'

import type { PaymentMethod } from '@/types'
import { METHOD_OPTIONS_SHORT } from '@/lib/constants'

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
        {METHOD_OPTIONS_SHORT.map(([val, label]) => (
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
