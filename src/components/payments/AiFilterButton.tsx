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
  const particleId = useRef(0)
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

  // 스타더스트 파티클 생성
  const spawnParticles = useCallback((cx: number, cy: number, speed: number) => {
    const count = Math.min(Math.floor(speed / 3), 5)
    const newParticles: Particle[] = []
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const spread = 1 + Math.random() * 2.5
      const life = 40 + Math.random() * 50
      newParticles.push({
        x: cx + 24 + (Math.random() - 0.5) * 16,
        y: cy + 24 + (Math.random() - 0.5) * 16,
        vx: Math.cos(angle) * spread - velRef.current.x * 0.05,
        vy: Math.sin(angle) * spread - velRef.current.y * 0.05,
        life,
        maxLife: life,
        size: 2 + Math.random() * 4,
        hue: 220 + Math.random() * 40,
        id: particleId.current++,
      })
    }
    return newParticles
  }, [])

  // 물리 시뮬레이션 (관성 + 벽 탄성)
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
    const maxY = window.innerHeight - size

    if (nx < 0) { nx = 0; velRef.current.x = Math.abs(velRef.current.x) * bounce }
    if (nx > maxX) { nx = maxX; velRef.current.x = -Math.abs(velRef.current.x) * bounce }
    if (ny < 0) { ny = 0; velRef.current.y = Math.abs(velRef.current.y) * bounce }
    if (ny > maxY) { ny = maxY; velRef.current.y = -Math.abs(velRef.current.y) * bounce }

    posRef.current = { x: nx, y: ny }
    setPos({ x: nx, y: ny })

    const speed = Math.sqrt(velRef.current.x ** 2 + velRef.current.y ** 2)

    // 스타더스트 파티클 방출
    if (speed > 2) {
      const spawned = spawnParticles(nx, ny, speed)
      setParticles(prev => [...prev, ...spawned].slice(-60))
    }

    // 파티클 물리 업데이트
    setParticles(prev =>
      prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vx: p.vx * 0.97,
          vy: p.vy * 0.97 + 0.02,
          life: p.life - 1,
        }))
        .filter(p => p.life > 0)
    )

    if (speed > 0.3 || particles.length > 0) {
      animFrame.current = requestAnimationFrame(simulate)
    } else {
      velRef.current = { x: 0, y: 0 }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spawnParticles])

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
    posRef.current = { x: nx, y: ny }
    setPos({ x: nx, y: ny })

    // 드래그 중 스타더스트
    const dx = x - prevTouch.current.x
    const dy = y - prevTouch.current.y
    const speed = Math.sqrt(dx * dx + dy * dy)
    if (speed > 1.5) {
      const count = Math.min(Math.floor(speed / 4) + 1, 4)
      const newP: Particle[] = []
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2
        const spread = 0.5 + Math.random() * 2
        const life = 30 + Math.random() * 45
        newP.push({
          x: nx + 24 + (Math.random() - 0.5) * 20,
          y: ny + 24 + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * spread,
          vy: Math.sin(angle) * spread,
          life,
          maxLife: life,
          size: 2 + Math.random() * 4,
          hue: 220 + Math.random() * 40,
          id: particleId.current++,
        })
      }
      setParticles(prev => [...prev, ...newP].slice(-60))
    }

    // 파티클 물리 업데이트 (드래그 중에도)
    setParticles(prev =>
      prev
        .map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vx: p.vx * 0.97,
          vy: p.vy * 0.97 + 0.02,
          life: p.life - 1,
        }))
        .filter(p => p.life > 0)
    )
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
      {/* 스타더스트 파티클 */}
      {particles.map(p => {
        const progress = p.life / p.maxLife
        const opacity = progress < 0.3 ? progress / 0.3 : progress
        return (
          <div
            key={p.id}
            className="fixed pointer-events-none z-20"
            style={{
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              opacity: opacity * 0.9,
              borderRadius: '50%',
              background: `radial-gradient(circle, hsla(${p.hue},80%,75%,1) 0%, hsla(${p.hue},70%,60%,0.6) 40%, transparent 70%)`,
              boxShadow: `0 0 ${p.size * 2}px hsla(${p.hue},80%,70%,${opacity * 0.6})`,
              transform: `translate(-50%, -50%) scale(${0.5 + progress * 0.5})`,
            }}
          />
        )
      })}

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
