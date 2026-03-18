'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { X, Loader2, ArrowRight } from 'lucide-react'

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

  // 물리 상태
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const velRef = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastTouch = useRef({ x: 0, y: 0, t: 0 })
  const prevTouch = useRef({ x: 0, y: 0, t: 0 })
  const posRef = useRef({ x: 0, y: 0 })
  const animFrame = useRef<number>(0)
  const btnRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  const getBottomPad = () => (window.innerWidth < 640 ? 68 : 0)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const x = window.innerWidth - 60
    const y = window.innerHeight * 0.38
    posRef.current = { x, y }
    setPos({ x, y })
  }, [])

  const simulate = useCallback(() => {
    if (dragging.current) return
    const friction = 0.96
    const bounce = 0.6
    const size = 48

    velRef.current.x *= friction
    velRef.current.y *= friction

    let nx = posRef.current.x + velRef.current.x
    let ny = posRef.current.y + velRef.current.y
    const maxX = window.innerWidth - size
    const maxY = window.innerHeight - size - getBottomPad()

    if (nx < 0) { nx = 0; velRef.current.x = Math.abs(velRef.current.x) * bounce }
    if (nx > maxX) { nx = maxX; velRef.current.x = -Math.abs(velRef.current.x) * bounce }
    if (ny < 0) { ny = 0; velRef.current.y = Math.abs(velRef.current.y) * bounce }
    if (ny > maxY) { ny = maxY; velRef.current.y = -Math.abs(velRef.current.y) * bounce }

    posRef.current = { x: nx, y: ny }
    setPos({ x: nx, y: ny })

    const speed = Math.sqrt(velRef.current.x ** 2 + velRef.current.y ** 2)
    if (speed > 0.3) {
      animFrame.current = requestAnimationFrame(simulate)
    } else {
      velRef.current = { x: 0, y: 0 }
    }
  }, [])

  const getXY = (e: React.TouchEvent | React.MouseEvent) => {
    if ('touches' in e) {
      const t = e.touches[0] || (e as React.TouchEvent).changedTouches[0]
      return { x: t.clientX, y: t.clientY }
    }
    return { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY }
  }

  const handleStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (open || aiFilterIds !== null) return
    e.preventDefault()
    dragging.current = true
    cancelAnimationFrame(animFrame.current)
    velRef.current = { x: 0, y: 0 }
    const { x, y } = getXY(e)
    const now = performance.now()
    lastTouch.current = { x, y, t: now }
    prevTouch.current = { x, y, t: now }
  }

  const handleMove = useCallback((e: TouchEvent | MouseEvent) => {
    if (!dragging.current) return
    e.preventDefault()
    const touch = 'touches' in e ? e.touches[0] : e
    const x = touch.clientX
    const y = touch.clientY
    const now = performance.now()

    prevTouch.current = { ...lastTouch.current }
    lastTouch.current = { x, y, t: now }

    const size = 48
    const nx = Math.max(0, Math.min(window.innerWidth - size, x - size / 2))
    const ny = Math.max(0, Math.min(window.innerHeight - size - getBottomPad(), y - size / 2))
    posRef.current = { x: nx, y: ny }
    setPos({ x: nx, y: ny })
  }, [])

  const handleEnd = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false

    const dt = (performance.now() - prevTouch.current.t) || 1
    const dx = lastTouch.current.x - prevTouch.current.x
    const dy = lastTouch.current.y - prevTouch.current.y

    velRef.current = { x: (dx / dt) * 16, y: (dy / dt) * 16 }

    const maxVel = 35
    const speed = Math.sqrt(velRef.current.x ** 2 + velRef.current.y ** 2)
    if (speed > maxVel) {
      velRef.current.x = (velRef.current.x / speed) * maxVel
      velRef.current.y = (velRef.current.y / speed) * maxVel
    }

    animFrame.current = requestAnimationFrame(simulate)
  }, [simulate])

  useEffect(() => {
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleEnd)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
      cancelAnimationFrame(animFrame.current)
    }
  }, [handleMove, handleEnd])

  const handleFilter = async () => {
    if (!query.trim() || loading) return
    await onFilter(query)
    setOpen(false)
  }

  const handleClear = () => {
    setQuery('')
    onClear()
  }

  const speed = Math.sqrt(velRef.current.x ** 2 + velRef.current.y ** 2)

  const BTN = 36

  // 필터 적용 상태 (배지)
  if (aiFilterIds !== null) {
    return (
      <div className="fixed right-3 z-[60]" style={{ top: '38%' }}>
        <div className="flex items-center gap-1.5 bg-white text-[#1e2d6f] pl-2 pr-1.5 py-1.5 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.15)] border border-gray-100">
          <Image src="/icons/icon-192x192.png" alt="" width={18} height={18} className="rounded-sm" />
          <span className="text-[10px] font-medium max-w-[100px] truncate">{aiFilterDesc}</span>
          <button onClick={handleClear} className="p-0.5 hover:bg-gray-100 rounded-full ml-0.5" aria-label="필터 해제">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 제미나이 스타일 ✦ 글레어 키프레임 */}
      <style>{`
        @keyframes sparkle-in-out {
          0%, 100% { opacity: 0; transform: scale(0.3) rotate(0deg); }
          50% { opacity: 1; transform: scale(1) rotate(90deg); }
        }
        .ai-sparkle-wrap {
          position: absolute;
          pointer-events: none;
          inset: -10px;
        }
        .ai-sparkle {
          position: absolute;
          animation: sparkle-in-out ease-in-out infinite;
        }
        .ai-sparkle:nth-child(1) { top: -4px; right: -2px; animation-duration: 3s; animation-delay: 0s; }
        .ai-sparkle:nth-child(2) { bottom: -3px; left: -4px; animation-duration: 3.8s; animation-delay: 1.2s; }
        .ai-sparkle:nth-child(3) { top: 50%; right: -6px; animation-duration: 4.2s; animation-delay: 2.4s; }
      `}</style>

      {/* 메인 버튼 + 검색바 */}
      <div
        ref={btnRef}
        className="fixed z-[60] select-none touch-none"
        style={{
          left: open ? undefined : pos.x,
          top: open ? '38%' : pos.y,
          right: open ? 12 : undefined,
          cursor: open ? undefined : (dragging.current ? 'grabbing' : 'grab'),
        }}
        onTouchStart={open ? undefined : handleStart}
        onMouseDown={open ? undefined : handleStart}
      >
        <div
          className="flex items-center rounded-full overflow-visible"
          style={{
            height: BTN,
            transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), box-shadow 0.35s ease, background-color 0.3s ease',
            width: open ? 260 : BTN,
            backgroundColor: open ? '#1e2d6f' : undefined,
            boxShadow: open
              ? '0 2px 16px rgba(30,45,111,0.4)'
              : '0 3px 12px rgba(30,45,111,0.25)',
          }}
        >
          {/* 검색 입력 */}
          <div
            style={{
              overflow: 'hidden',
              transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease',
              width: open ? 260 - BTN - 32 : 0,
              opacity: open ? 1 : 0,
            }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleFilter()
                if (e.key === 'Escape') { setOpen(false); setQuery('') }
              }}
              placeholder="미납학생, 결제일 15일..."
              className="text-xs w-full outline-none bg-transparent pl-3 pr-1 text-white placeholder:text-[#c8c5be]/60"
              style={{ height: BTN }}
              aria-label="AI 필터 검색어"
            />
          </div>

          {/* 닫기 버튼 */}
          {open && (
            <button
              onClick={() => { setOpen(false); setQuery('') }}
              className="shrink-0 flex items-center justify-center text-[#c8c5be] hover:text-white"
              style={{ width: 28, height: BTN }}
              aria-label="닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* 메인 원형 버튼 */}
          <button
            onClick={() => {
              if (open) {
                handleFilter()
              } else if (speed < 1) {
                setOpen(true)
                setTimeout(() => inputRef.current?.focus(), 150)
              }
            }}
            disabled={open && loading}
            className={`shrink-0 flex items-center justify-center rounded-full disabled:opacity-50 relative ${
              open ? 'bg-white/15 text-white' : ''
            }`}
            style={{ width: BTN, height: BTN }}
            aria-label={open ? 'AI 필터 실행' : 'AI 필터 열기'}
          >
            {open ? (
              loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />
            ) : (
              <>
                <Image src="/icons/icon-192x192.png" alt="AI 필터" width={BTN} height={BTN} className="rounded-full" />
                {/* ✦ 글레어 스파클 */}
                <span className="ai-sparkle-wrap">
                  {[8, 6, 7].map((sz, i) => (
                    <svg key={i} className="ai-sparkle" width={sz} height={sz} viewBox="0 0 24 24" fill="white">
                      <path d="M12 0C12 0 14 10 12 12C10 10 12 0 12 0Z" />
                      <path d="M12 24C12 24 10 14 12 12C14 14 12 24 12 24Z" />
                      <path d="M0 12C0 12 10 10 12 12C10 14 0 12 0 12Z" />
                      <path d="M24 12C24 12 14 14 12 12C14 10 24 12 24 12Z" />
                    </svg>
                  ))}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
