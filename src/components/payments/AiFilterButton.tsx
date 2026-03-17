'use client'

import { useState, useRef } from 'react'
import { Sparkles, X, Loader2, ArrowRight } from 'lucide-react'

interface Props {
  aiFilterIds: Set<string> | null
  aiFilterDesc: string
  onFilter: (query: string) => Promise<void>
  onClear: () => void
  loading: boolean
}

export default function AiFilterButton({ aiFilterIds, aiFilterDesc, onFilter, onClear, loading }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFilter = async () => {
    if (!query.trim() || loading) return
    await onFilter(query)
    setOpen(false)
  }

  const handleClear = () => {
    setQuery('')
    onClear()
  }

  return (
    <div className="fixed right-3 z-30" style={{ top: '38%' }}>
      {aiFilterIds !== null ? (
        <div className="flex items-center gap-1 bg-white text-[#1e2d6f] pl-2.5 pr-1.5 py-2 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.15)] border border-gray-100">
          <Sparkles className="w-3.5 h-3.5 shrink-0 text-[#1e2d6f]" />
          <span className="text-[10px] font-medium max-w-[100px] truncate">{aiFilterDesc}</span>
          <button onClick={handleClear} className="p-0.5 hover:bg-gray-100 rounded-full ml-0.5" aria-label="필터 해제">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      ) : open ? (
        <div className="flex items-center bg-white shadow-[0_2px_16px_rgba(0,0,0,0.15)] border border-gray-100 rounded-full pl-3 pr-1 py-1.5 gap-1.5">
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleFilter()
              if (e.key === 'Escape') { setOpen(false); setQuery('') }
            }}
            placeholder="예: 미납학생, 결제일 15일..."
            className="text-xs w-44 sm:w-56 outline-none bg-transparent"
            aria-label="AI 필터 검색어"
          />
          <button
            onClick={handleFilter}
            disabled={loading}
            className="p-1.5 bg-[#1e2d6f] text-white rounded-full shrink-0 disabled:opacity-50"
            aria-label="AI 필터 실행"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => { setOpen(false); setQuery('') }}
            className="p-1 text-gray-400 hover:text-gray-600"
            aria-label="닫기"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100) }}
          className="ai-float-btn bg-white p-3 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.15)] border border-gray-100"
          aria-label="AI 필터 열기"
        >
          <Sparkles className="w-5 h-5 text-[#1e2d6f]" />
        </button>
      )}
    </div>
  )
}
