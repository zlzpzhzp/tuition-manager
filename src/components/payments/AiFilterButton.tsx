'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, X, Loader2, ArrowRight } from 'lucide-react'

interface Props {
  aiFilterIds: Set<string> | null
  aiFilterDesc: string
  onFilter: (query: string) => Promise<void>
  onClear: () => void
  loading: boolean
}

interface Trail {
  x: number
  y: number
  opacity: number
  id: number
}

export default function AiFilterButton({ aiFilterIds, aiFilterDesc, onFilter, onClear, loading }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 물리 상태
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [trails, setTrails] = useState<Trail[]>([])
  const velRef = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastTouch = useRef({ x: 0, y: 0, t: 0 })
  const prevTouch = useRef({ x: 0, y: 0, t: 0 })
  const animFrame = useRef<number>(0)
  const trailId = useRef(0)
  const btnRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  // 초기 위치 설정
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const w = window.innerWidth
    const h = window.innerHeight
    setPos({ x: w - 60, y: h * 0.38 })
  }, [])

  // 물리 시뮬레이션 (관성 + 벽 탄성)
  const simulate = useCallback(() => {
    if (dragging.current) return

    const friction = 0.96
    const bounce = 0.6
    const size = 48

    velRef.current.x *= friction
    velRef.current.y *= friction

    setPos(prev => {
      let nx = prev.x + velRef.current.x
      let ny = prev.y + velRef.current.y
      const maxX = window.innerWidth - size
      const maxY = window.innerHeight - size

      // 벽 충돌 → 탄성
      if (nx < 0) { nx = 0; velRef.current.x = Math.abs(velRef.current.x) * bounce }
      if (nx > maxX) { nx = maxX; velRef.current.x = -Math.abs(velRef.current.x) * bounce }
      if (ny < 0) { ny = 0; velRef.current.y = Math.abs(velRef.current.y) * bounce }
      if (ny > maxY) { ny = maxY; velRef.current.y = -Math.abs(velRef.current.y) * bounce }

      return { x: nx, y: ny }
    })

    const speed = Math.sqrt(velRef.current.x ** 2 + velRef.current.y ** 2)

    // 유성 꼬리 — 빠를 때만
    if (speed > 3) {
      setTrails(prev => {
        const next = [...prev, { x: 0, y: 0, opacity: Math.min(speed / 20, 1), id: trailId.current++ }]
        return next.slice(-12)
      })
    }

    // 꼬리 페이드 아웃
    setTrails(prev => prev.map(t => ({ ...t, opacity: t.opacity * 0.88 })).filter(t => t.opacity > 0.02))

    if (speed > 0.3) {
      animFrame.current = requestAnimationFrame(simulate)
    } else {
      velRef.current = { x: 0, y: 0 }
      setTrails([])
    }
  }, [])

  // 터치/마우스 핸들러
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
    setTrails([])
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
    const ny = Math.max(0, Math.min(window.innerHeight - size, y - size / 2))
    setPos({ x: nx, y: ny })

    // 드래그 중 꼬리
    const dx = x - prevTouch.current.x
    const dy = y - prevTouch.current.y
    const speed = Math.sqrt(dx * dx + dy * dy)
    if (speed > 2) {
      setTrails(prev => {
        const next = [...prev, { x: nx, y: ny, opacity: Math.min(speed / 15, 1), id: trailId.current++ }]
        return next.slice(-12)
      })
    }
  }, [])

  const handleEnd = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false

    const dt = (performance.now() - prevTouch.current.t) || 1
    const dx = lastTouch.current.x - prevTouch.current.x
    const dy = lastTouch.current.y - prevTouch.current.y

    // 속도 = 이동거리 / 시간 * 스케일
    velRef.current = {
      x: (dx / dt) * 16,
      y: (dy / dt) * 16,
    }

    // 속도 캡
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

  // 꼬리 위치 업데이트 (현재 pos 기준)
  useEffect(() => {
    setTrails(prev => prev.map(t => t.opacity > 0.5 ? { ...t, x: pos.x, y: pos.y } : t))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // 열린/필터 상태에서는 고정 스타일
  if (open || aiFilterIds !== null) {
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
        ) : (
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
        )}
      </div>
    )
  }

  return (
    <>
      {/* 유성 꼬리 */}
      {trails.map(t => (
        <div
          key={t.id}
          className="fixed pointer-events-none z-20 rounded-full"
          style={{
            left: t.x + 12,
            top: t.y + 12,
            width: 24,
            height: 24,
            opacity: t.opacity * 0.7,
            background: `radial-gradient(circle, rgba(30,45,111,${t.opacity * 0.5}) 0%, rgba(100,130,255,${t.opacity * 0.3}) 50%, transparent 70%)`,
            filter: `blur(${3 + (1 - t.opacity) * 6}px)`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}

      {/* 메인 버튼 */}
      <div
        ref={btnRef}
        className="fixed z-30 select-none touch-none"
        style={{
          left: pos.x,
          top: pos.y,
          cursor: dragging.current ? 'grabbing' : 'grab',
        }}
        onTouchStart={handleStart}
        onMouseDown={handleStart}
      >
        <button
          onClick={() => {
            if (speed < 1) {
              setOpen(true)
              setTimeout(() => inputRef.current?.focus(), 100)
            }
          }}
          className="ai-float-btn bg-white p-3 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.15)] border border-gray-100 relative overflow-hidden"
          style={{
            animation: speed > 1 ? 'none' : undefined,
          }}
          aria-label="AI 필터 열기"
        >
          {/* 반짝이는 글로우 */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 30%, rgba(100,130,255,0.3) 0%, transparent 60%)',
              animation: 'shimmer 2s ease-in-out infinite',
            }}
          />
          <Sparkles className="w-5 h-5 text-[#1e2d6f] relative z-10" />
        </button>
      </div>
    </>
  )
}
