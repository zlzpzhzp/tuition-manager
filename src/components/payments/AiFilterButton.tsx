'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Loader2, ArrowRight } from 'lucide-react'

/** 요정 SVG — 날개 달린 실루엣 + 지팡이 */
function FairyIcon({ size = 20, color = 'white' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill={color}>
      {/* 머리 */}
      <circle cx="16" cy="7.5" r="3" />
      {/* 몸 */}
      <path d="M16 10.5C16 10.5 13.5 16 12.5 22L16 20L19.5 22C18.5 16 16 10.5 16 10.5Z" />
      {/* 왼쪽 날개 */}
      <path d="M14.5 11C14.5 11 7 7 5.5 10C4 13 9 15 14 13.5Z" opacity="0.6" />
      <path d="M14 14C14 14 7 15 6.5 18C6 21 10 18.5 13.5 15.5Z" opacity="0.45" />
      {/* 오른쪽 날개 */}
      <path d="M17.5 11C17.5 11 25 7 26.5 10C28 13 23 15 18 13.5Z" opacity="0.6" />
      <path d="M18 14C18 14 25 15 25.5 18C26 21 22 18.5 18.5 15.5Z" opacity="0.45" />
      {/* 지팡이 */}
      <line x1="19" y1="12" x2="25" y2="4" stroke={color} strokeWidth="0.8" strokeLinecap="round" />
      {/* 지팡이 끝 별 */}
      <polygon points="25,1.5 25.7,3.3 27.5,3.5 26.1,4.7 26.5,6.5 25,5.5 23.5,6.5 23.9,4.7 22.5,3.5 24.3,3.3" opacity="0.9" />
    </svg>
  )
}

/** 4각 별 모양 좌표 */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = []
  for (let i = 0; i < 4; i++) {
    const aOuter = (Math.PI / 2) * i - Math.PI / 2
    const aInner = aOuter + Math.PI / 4
    pts.push(`${cx + Math.cos(aOuter) * outer},${cy + Math.sin(aOuter) * outer}`)
    pts.push(`${cx + Math.cos(aInner) * inner},${cy + Math.sin(aInner) * inner}`)
  }
  return pts.join(' ')
}

interface Props {
  aiFilterIds: Set<string> | null
  aiFilterDesc: string
  onFilter: (query: string) => Promise<void>
  onClear: () => void
  loading: boolean
}

interface Particle {
  x: number; y: number; vx: number; vy: number
  life: number; maxLife: number; size: number; id: number
}

export default function AiFilterButton({ aiFilterIds, aiFilterDesc, onFilter, onClear, loading }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [particles, setParticles] = useState<Particle[]>([])
  const velRef = useRef({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastTouch = useRef({ x: 0, y: 0, t: 0 })
  const prevTouch = useRef({ x: 0, y: 0, t: 0 })
  const posRef = useRef({ x: 0, y: 0 })
  const animFrame = useRef<number>(0)
  const idleFrame = useRef<number>(0)
  const particleId = useRef(0)
  const btnRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  const getBottomPad = () => (window.innerWidth < 640 ? 68 : 0)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const x = window.innerWidth - 80
    const y = window.innerHeight * 0.38
    posRef.current = { x, y }
    setPos({ x, y })
  }, [])

  // 페이지 숨김 시 정지
  useEffect(() => {
    const handler = () => { if (document.hidden) cancelAnimationFrame(idleFrame.current) }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  // ─── 흰색 스타더스트 (경량) ───
  useEffect(() => {
    if (open || aiFilterIds !== null) {
      cancelAnimationFrame(idleFrame.current)
      setParticles([])
      return
    }

    let frameCount = 0
    const tick = () => {
      frameCount++
      if (frameCount % (5 + Math.floor(Math.random() * 3)) === 0) {
        const cx = posRef.current.x + 18
        const cy = posRef.current.y + 18
        const angle = Math.random() * Math.PI * 2
        const r = Math.random() * 8
        const life = 70 + Math.random() * 50
        const startX = cx + Math.cos(angle) * r
        const startY = cy + Math.sin(angle) * r

        setParticles(prev => [...prev, {
          x: startX, y: startY,
          vx: Math.cos(angle) * (0.1 + Math.random() * 0.25),
          vy: Math.sin(angle) * (0.1 + Math.random() * 0.25),
          life, maxLife: life,
          size: 1.2 + Math.random() * 2,
          id: particleId.current++,
        }].slice(-25))
      }

      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx, y: p.y + p.vy,
            vx: p.vx * 0.995, vy: p.vy * 0.995,
            life: p.life - 0.6,
          }))
          .filter(p => p.life > 0)
      )

      idleFrame.current = requestAnimationFrame(tick)
    }
    idleFrame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(idleFrame.current)
  }, [open, aiFilterIds])

  // ─── 물리 시뮬레이션 ───
  const simulate = useCallback(() => {
    if (dragging.current) return
    velRef.current.x *= 0.96
    velRef.current.y *= 0.96

    let nx = posRef.current.x + velRef.current.x
    let ny = posRef.current.y + velRef.current.y
    const maxX = window.innerWidth - 48
    const maxY = window.innerHeight - 48 - getBottomPad()

    if (nx < 0) { nx = 0; velRef.current.x = Math.abs(velRef.current.x) * 0.6 }
    if (nx > maxX) { nx = maxX; velRef.current.x = -Math.abs(velRef.current.x) * 0.6 }
    if (ny < 0) { ny = 0; velRef.current.y = Math.abs(velRef.current.y) * 0.6 }
    if (ny > maxY) { ny = maxY; velRef.current.y = -Math.abs(velRef.current.y) * 0.6 }

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

    const nx = Math.max(0, Math.min(window.innerWidth - 48, x - 24))
    const ny = Math.max(0, Math.min(window.innerHeight - 48 - getBottomPad(), y - 24))
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
        <div className="flex items-center gap-1.5 bg-[#212126] text-[#7c3aed] pl-2 pr-1.5 py-1.5 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.15)] border border-[#2c2c33]">
          <FairyIcon size={14} color="#7c3aed" />
          <span className="text-[10px] font-medium max-w-[100px] truncate">{aiFilterDesc}</span>
          <button onClick={handleClear} className="p-0.5 hover:bg-[#36363e] rounded-full ml-0.5" aria-label="필터 해제">
            <X className="w-3.5 h-3.5 text-[#5e5e6e]" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* 흰색 스타더스트 */}
      <svg className="fixed inset-0 pointer-events-none z-[55]" width="100%" height="100%">
        {particles.map(p => {
          const fadeIn = Math.min(1, (p.maxLife - p.life) / 15)
          const fadeOut = p.life / p.maxLife
          const opacity = fadeIn * fadeOut
          return (
            <polygon
              key={p.id}
              points={starPoints(p.x, p.y, p.size, p.size * 0.4)}
              fill={`rgba(255,255,255,${opacity * 0.5})`}
            />
          )
        })}
      </svg>

      {/* 메인 버튼 + 검색바 */}
      <div
        ref={btnRef}
        className="fixed z-[60] select-none touch-none"
        style={{
          left: open ? Math.max(8, Math.min(pos.x, (typeof window !== 'undefined' ? window.innerWidth : 400) - 272)) : pos.x,
          top: pos.y,
          cursor: open ? undefined : (dragging.current ? 'grabbing' : 'grab'),
        }}
        onTouchStart={open ? undefined : handleStart}
        onMouseDown={open ? undefined : handleStart}
      >
        <div
          className="flex items-center rounded-full"
          style={{
            height: BTN,
            transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), box-shadow 0.35s ease, background-color 0.3s ease',
            width: open ? 260 : BTN,
            backgroundColor: open ? '#a78bfa' : undefined,
            boxShadow: open
              ? '0 2px 16px rgba(167,139,250,0.4)'
              : 'none',
            overflow: open ? 'hidden' : 'visible',
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
              placeholder="15일 이후 미납, 7일이상 미납..."
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
            className={`shrink-0 flex items-center justify-center rounded-full disabled:opacity-50 ${
              open ? 'bg-[#212126]/15 text-white' : ''
            }`}
            style={{ width: BTN, height: BTN }}
            aria-label={open ? 'AI 필터 실행' : 'AI 필터 열기'}
          >
            {open
              ? (loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />)
              : <FairyIcon size={28} color="white" />
            }
          </button>
        </div>
      </div>
    </>
  )
}
