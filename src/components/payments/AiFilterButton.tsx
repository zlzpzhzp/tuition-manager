'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Loader2, ArrowRight } from 'lucide-react'

/** 디엠학원 DM 마크 SVG */
function DmMark({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <text
        x="12" y="16.5"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="13"
        fontWeight="800"
        letterSpacing="-0.5"
        fill="currentColor"
      >
        DM
      </text>
    </svg>
  )
}

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
  /** 꼬리 궤적 */
  trail: { x: number; y: number }[]
}

/** 4각 별 모양 좌표 생성 */
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

  // ─── 항상 나오는 아이들 파티클 (느리고 풍성하게, 꼬리 포함) ───
  useEffect(() => {
    if (open || aiFilterIds !== null) {
      cancelAnimationFrame(idleFrame.current)
      setParticles(prev => prev.filter(p => p.maxLife < 120))
      return
    }

    let frameCount = 0
    const tick = () => {
      frameCount++

      // 2~3프레임마다 1개 생성 (더 풍성)
      if (frameCount % (2 + Math.floor(Math.random() * 2)) === 0) {
        const cx = posRef.current.x + 24
        const cy = posRef.current.y + 24
        const angle = Math.random() * Math.PI * 2
        const r = Math.random() * 6
        const life = 90 + Math.random() * 70 // 더 오래 살기

        setParticles(prev => {
          const startX = cx + Math.cos(angle) * r
          const startY = cy + Math.sin(angle) * r
          const next = [...prev, {
            x: startX,
            y: startY,
            vx: Math.cos(angle) * (0.15 + Math.random() * 0.35), // 느린 속도
            vy: Math.sin(angle) * (0.15 + Math.random() * 0.35),
            life,
            maxLife: life,
            size: 1.5 + Math.random() * 2.5,
            hue: 210 + Math.random() * 50,
            id: particleId.current++,
            trail: [{ x: startX, y: startY }],
          }]
          return next.slice(-60)
        })
      }

      // 물리 업데이트
      setParticles(prev =>
        prev
          .map(p => {
            const nx = p.x + p.vx
            const ny = p.y + p.vy
            const trail = [...p.trail, { x: nx, y: ny }].slice(-8) // 꼬리 8프레임
            return {
              ...p,
              x: nx,
              y: ny,
              vy: p.vy * 0.995, // 중력 없이 자연 감속
              vx: p.vx * 0.995,
              life: p.life - 0.6, // 느리게 소멸
              trail,
            }
          })
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
      const spread = 0.8 + Math.random() * 2
      const life = 60 + Math.random() * 60
      const px = cx + 24 + (Math.random() - 0.5) * 18
      const py = cy + 24 + (Math.random() - 0.5) * 18
      result.push({
        x: px,
        y: py,
        vx: Math.cos(angle) * spread - velRef.current.x * 0.03,
        vy: Math.sin(angle) * spread - velRef.current.y * 0.03,
        life,
        maxLife: life,
        size: 1.5 + Math.random() * 3,
        hue: 210 + Math.random() * 50,
        id: particleId.current++,
        trail: [{ x: px, y: py }],
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
      prev.map(p => {
        const nx2 = p.x + p.vx
        const ny2 = p.y + p.vy
        return {
          ...p,
          x: nx2,
          y: ny2,
          vx: p.vx * 0.97,
          vy: p.vy * 0.97 + 0.01,
          life: p.life - 0.8,
          trail: [...p.trail, { x: nx2, y: ny2 }].slice(-8),
        }
      }).filter(p => p.life > 0)
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
        const spread = 0.4 + Math.random() * 1.8
        const life = 50 + Math.random() * 50
        const px = nx + 24 + (Math.random() - 0.5) * 20
        const py = ny + 24 + (Math.random() - 0.5) * 20
        newP.push({
          x: px,
          y: py,
          vx: Math.cos(angle) * spread,
          vy: Math.sin(angle) * spread,
          life,
          maxLife: life,
          size: 1.5 + Math.random() * 3,
          hue: 210 + Math.random() * 50,
          id: particleId.current++,
          trail: [{ x: px, y: py }],
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

  const BTN = 34 // 버튼 크기 (px) — 플로팅 & 검색바 submit 동일

  // 필터 적용 상태 (배지)
  if (aiFilterIds !== null) {
    return (
      <div className="fixed right-3 z-[60]" style={{ top: '38%' }}>
        <div className="flex items-center gap-1 bg-white text-[#1e2d6f] pl-2.5 pr-1.5 py-2 rounded-full shadow-[0_2px_12px_rgba(0,0,0,0.15)] border border-gray-100">
          <DmMark size={14} className="text-indigo-500" />
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
      {/* 스타더스트 파티클 + 꼬리 */}
      <svg className="fixed inset-0 pointer-events-none z-[55]" width="100%" height="100%">
        {particles.map(p => {
          const progress = p.life / p.maxLife
          const fadeIn = Math.min(1, (p.maxLife - p.life) / 12)
          const fadeOut = progress
          const opacity = fadeIn * fadeOut

          return (
            <g key={p.id}>
              {p.trail.length > 1 && (
                <polyline
                  points={p.trail.map(t => `${t.x},${t.y}`).join(' ')}
                  fill="none"
                  stroke={`hsla(${p.hue},80%,75%,${opacity * 0.4})`}
                  strokeWidth={p.size * 0.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
              <polygon
                points={starPoints(p.x, p.y, p.size, p.size * 0.4)}
                fill={`hsla(${p.hue},80%,78%,${opacity * 0.9})`}
                style={{ filter: `blur(${p.size * 0.15}px)` }}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={p.size * 0.8}
                fill={`hsla(${p.hue},85%,80%,${opacity * 0.25})`}
              />
            </g>
          )
        })}
      </svg>

      {/* 메인 버튼 + 검색바 (좌측 슬라이드) */}
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
          className="flex items-center rounded-full overflow-hidden"
          style={{
            height: BTN,
            transition: 'width 0.35s cubic-bezier(0.4,0,0.2,1), box-shadow 0.35s ease, background-color 0.3s ease',
            width: open ? 260 : BTN,
            backgroundColor: open ? '#4338ca' : undefined,
            boxShadow: open
              ? '0 2px 16px rgba(67,56,202,0.35)'
              : '0 4px 14px rgba(99,102,241,0.35)',
          }}
        >
          {/* 검색 입력 — open일 때만 보임 */}
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
              className="text-xs w-full outline-none bg-transparent pl-3 pr-1 text-white placeholder:text-indigo-200"
              style={{ height: BTN }}
              aria-label="AI 필터 검색어"
            />
          </div>

          {/* 닫기 버튼 — open일 때 */}
          {open && (
            <button
              onClick={() => { setOpen(false); setQuery('') }}
              className="shrink-0 flex items-center justify-center text-indigo-200 hover:text-white"
              style={{ width: 28, height: BTN }}
              aria-label="닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* 메인 원형 버튼 (플로팅 = Sparkles, 열린 상태 = 실행) */}
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
            className={`ai-float-btn shrink-0 flex items-center justify-center rounded-full text-white disabled:opacity-50 ${open ? 'bg-white/20' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}
            style={{
              width: BTN,
              height: BTN,
              animation: !open && speed > 1 ? 'none' : undefined,
            }}
            aria-label={open ? 'AI 필터 실행' : 'AI 필터 열기'}
          >
            {open
              ? (loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />)
              : <DmMark size={20} />
            }
          </button>
        </div>
      </div>
    </>
  )
}
