'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Loader2, ArrowRight } from 'lucide-react'

interface Props {
  aiFilterIds: Set<string> | null
  aiFilterDesc: string
  onFilter: (query: string) => Promise<void>
  onClear: () => void
  loading: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  hue: number
  id: number
}

/** 제미나이 4색 별 아이콘 (SVG) */
function GeminiIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className}>
      <path
        d="M14 0C14 7.732 7.732 14 0 14c7.732 0 14 6.268 14 14 0-7.732 6.268-14 14-14C20.268 14 14 7.732 14 0Z"
        fill="url(#gemini-grad)"
      />
      <defs>
        <linearGradient id="gemini-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4285F4" />
          <stop offset=".33" stopColor="#9B72CB" />
          <stop offset=".66" stopColor="#D96570" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function AiFilterButton({ aiFilterIds, aiFilterDesc, onFilter, onClear, loading }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 물리 상태
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

  // 모바일 하단 탭바 높이 (sm 미만에서만)
  const getBottomPad = () => (window.innerWidth < 640 ? 68 : 0)

  // 초기 위치
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const x = window.innerWidth - 60
    const y = window.innerHeight * 0.38
    posRef.current = { x, y }
    setPos({ x, y })
  }, [])

  // ─── 항상 나오는 아이들 파티클 (중앙에서 밖으로 → 아래로 떨어지며 페이드) ───
  useEffect(() => {
    if (open || aiFilterIds !== null) {
      cancelAnimationFrame(idleFrame.current)
      setParticles(prev => prev.filter(p => p.maxLife < 80)) // 이동 파티클만 유지
      return
    }

    let frameCount = 0
    const tick = () => {
      frameCount++

      // 3~5프레임마다 1개 생성
      if (frameCount % (3 + Math.floor(Math.random() * 3)) === 0) {
        const cx = posRef.current.x + 24
        const cy = posRef.current.y + 24
        const angle = Math.random() * Math.PI * 2
        const r = Math.random() * 4
        const life = 50 + Math.random() * 40

        setParticles(prev => {
          const next = [...prev, {
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r,
            vx: Math.cos(angle) * (0.3 + Math.random() * 0.6),
            vy: Math.sin(angle) * (0.2 + Math.random() * 0.4) + 0.15,
            life,
            maxLife: life,
            size: 1.5 + Math.random() * 3,
            hue: 210 + Math.random() * 50,
            id: particleId.current++,
          }]
          return next.slice(-40)
        })
      }

      // 물리 업데이트
      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            vy: p.vy + 0.015, // 중력
            vx: p.vx * 0.99,
            life: p.life - 1,
          }))
          .filter(p => p.life > 0)
      )

      idleFrame.current = requestAnimationFrame(tick)
    }

    idleFrame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(idleFrame.current)
  }, [open, aiFilterIds])

  // ─── 이동 파티클 생성 ───
  const spawnMoveParticles = useCallback((cx: number, cy: number, speed: number) => {
    const count = Math.min(Math.floor(speed / 2.5) + 1, 6)
    const result: Particle[] = []
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const spread = 1 + Math.random() * 3
      const life = 35 + Math.random() * 45
      result.push({
        x: cx + 24 + (Math.random() - 0.5) * 18,
        y: cy + 24 + (Math.random() - 0.5) * 18,
        vx: Math.cos(angle) * spread - velRef.current.x * 0.04,
        vy: Math.sin(angle) * spread - velRef.current.y * 0.04,
        life,
        maxLife: life,
        size: 2 + Math.random() * 5,
        hue: 210 + Math.random() * 50,
        id: particleId.current++,
      })
    }
    return result
  }, [])

  // ─── 물리 시뮬레이션 (관성 + 벽 탄성) ───
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

    if (speed > 2) {
      const spawned = spawnMoveParticles(nx, ny, speed)
      setParticles(prev => [...prev, ...spawned].slice(-80))
    }

    // 파티클 물리
    setParticles(prev =>
      prev.map(p => ({
        ...p,
        x: p.x + p.vx,
        y: p.y + p.vy,
        vx: p.vx * 0.97,
        vy: p.vy * 0.97 + 0.02,
        life: p.life - 1,
      })).filter(p => p.life > 0)
    )

    if (speed > 0.3) {
      animFrame.current = requestAnimationFrame(simulate)
    } else {
      velRef.current = { x: 0, y: 0 }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawnMoveParticles])

  // ─── 터치/마우스 ───
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

    const dx = x - prevTouch.current.x
    const dy = y - prevTouch.current.y
    const speed = Math.sqrt(dx * dx + dy * dy)
    if (speed > 1.5) {
      const count = Math.min(Math.floor(speed / 3) + 1, 5)
      const newP: Particle[] = []
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const spread = 0.5 + Math.random() * 2.5
        const life = 30 + Math.random() * 40
        newP.push({
          x: nx + 24 + (Math.random() - 0.5) * 20,
          y: ny + 24 + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * spread,
          vy: Math.sin(angle) * spread,
          life,
          maxLife: life,
          size: 2 + Math.random() * 5,
          hue: 210 + Math.random() * 50,
          id: particleId.current++,
        })
      }
      setParticles(prev => [...prev, ...newP].slice(-80))
    }
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

  // 열린/필터 상태
  if (open || aiFilterIds !== null) {
    return (
      <div className="fixed right-3 z-[60]" style={{ top: '38%' }}>
        {aiFilterIds !== null ? (
          <div className="flex items-center gap-1 bg-white text-[#1e2d6f] pl-2.5 pr-1.5 py-2 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.15)] border border-gray-100">
            <GeminiIcon className="w-3.5 h-3.5 shrink-0" />
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
      {/* 스타더스트 파티클 */}
      {particles.map(p => {
        const progress = p.life / p.maxLife
        // 부드러운 페이드: 생성 시 서서히 나타나고, 소멸 시 서서히 사라짐
        const fadeIn = Math.min(1, (p.maxLife - p.life) / 8)
        const fadeOut = progress
        const opacity = fadeIn * fadeOut
        return (
          <div
            key={p.id}
            className="fixed pointer-events-none z-[55]"
            style={{
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              opacity: opacity * 0.85,
              borderRadius: '50%',
              background: `radial-gradient(circle, hsla(${p.hue},85%,78%,1) 0%, hsla(${p.hue},75%,65%,0.5) 50%, transparent 70%)`,
              boxShadow: `0 0 ${p.size * 2.5}px hsla(${p.hue},85%,72%,${opacity * 0.5}), 0 0 ${p.size}px hsla(${p.hue},90%,80%,${opacity * 0.3})`,
              transform: `translate(-50%, -50%) scale(${0.4 + progress * 0.6})`,
            }}
          />
        )
      })}

      {/* 메인 버튼 — 제미나이 별 아이콘 */}
      <div
        ref={btnRef}
        className="fixed z-[60] select-none touch-none"
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
          className="ai-float-btn p-2.5 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.15)] relative"
          style={{
            animation: speed > 1 ? 'none' : undefined,
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(8px)',
          }}
          aria-label="AI 필터 열기"
        >
          <GeminiIcon className="w-6 h-6 relative z-10" />
        </button>
      </div>
    </>
  )
}
