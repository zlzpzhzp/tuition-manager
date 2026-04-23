'use client'

import { useRef, useState, useCallback, ReactNode } from 'react'
import { Check, Undo2 } from 'lucide-react'

const SPRING = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'

interface Props {
  children: ReactNode
  cleared: boolean
  onToggleClear: () => void
}

export default function SwipeToClear({ children, cleared, onToggleClear }: Props) {
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const didSwipe = useRef(false)
  const [isTouching, setIsTouching] = useState(false)
  const [offsetX, setOffsetX] = useState(0)
  const THRESHOLD = 70

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    didSwipe.current = false
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    }
    setIsTouching(true)
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.touches[0].clientX - touchStart.current.x
    const dy = e.touches[0].clientY - touchStart.current.y

    if (Math.abs(dy) > Math.abs(dx)) {
      touchStart.current = null
      setIsTouching(false)
      return
    }

    // 왼쪽 스와이프만
    if (dx < 0) {
      if (Math.abs(dx) > 5) didSwipe.current = true
      e.preventDefault()
      const absDx = Math.abs(dx)
      const x = absDx > THRESHOLD ? -(THRESHOLD + Math.sqrt(absDx - THRESHOLD) * 3) : dx
      setOffsetX(x)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (!touchStart.current && !offsetX) return
    touchStart.current = null
    setIsTouching(false)

    if (Math.abs(offsetX) >= THRESHOLD) {
      onToggleClear()
    }
    setOffsetX(0)
  }, [offsetX, onToggleClear])

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (didSwipe.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  return (
    <div className="relative overflow-hidden">
      {/* 스와이프 배경 */}
      <div
        className="absolute inset-y-0 right-0 flex items-center justify-center"
        style={{
          width: THRESHOLD,
          backgroundColor: cleared ? 'var(--swipe-undo-bg)' : 'var(--swipe-clear-bg)',
          color: cleared ? 'var(--swipe-undo-fg)' : 'var(--swipe-clear-fg)',
        }}
      >
        {cleared ? (
          <Undo2 className="w-5 h-5" />
        ) : (
          <Check className="w-5 h-5" />
        )}
      </div>

      {/* 슬라이드 콘텐츠 */}
      <div
        className="relative"
        style={{
          backgroundColor: 'var(--bg-primary)',
          transform: `translateX(${offsetX}px)`,
          transition: isTouching ? 'none' : SPRING,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClickCapture={handleClickCapture}
      >
        <div style={cleared ? { opacity: 0.4, textDecoration: 'line-through', textDecorationColor: 'var(--text-tertiary)' } : undefined}>
          {children}
        </div>
      </div>
    </div>
  )
}
