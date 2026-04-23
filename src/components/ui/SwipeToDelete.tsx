'use client'

import { useRef, useState, useCallback, ReactNode } from 'react'
import { Trash2 } from 'lucide-react'

const SPRING = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'

interface Props {
  children: ReactNode
  onDelete: () => void | Promise<void>
}

export default function SwipeToDelete({ children, onDelete }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const [isTouching, setIsTouching] = useState(false)
  const [offsetX, setOffsetX] = useState(0)
  const [swiped, setSwiped] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const DELETE_THRESHOLD = 80

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (swiped) {
      setSwiped(false)
      setOffsetX(0)
      touchStart.current = null
      return
    }
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    }
    setIsTouching(true)
  }, [swiped])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.touches[0].clientX - touchStart.current.x
    const dy = e.touches[0].clientY - touchStart.current.y

    // 수직 스크롤이면 무시
    if (Math.abs(dy) > Math.abs(dx)) {
      touchStart.current = null
      return
    }

    // 왼쪽 스와이프만 허용
    if (dx < 0) {
      e.preventDefault()
      const absDx = Math.abs(dx)
      const x = absDx > DELETE_THRESHOLD ? -(DELETE_THRESHOLD + Math.sqrt(absDx - DELETE_THRESHOLD) * 3) : dx
      setOffsetX(x)
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (!touchStart.current && !offsetX) return
    touchStart.current = null
    setIsTouching(false)

    if (Math.abs(offsetX) >= DELETE_THRESHOLD / 2) {
      setSwiped(true)
      setOffsetX(-DELETE_THRESHOLD)
    } else {
      setSwiped(false)
      setOffsetX(0)
    }
  }, [offsetX])

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    try {
      await onDelete()
    } catch {
      setDeleting(false)
      setSwiped(false)
      setOffsetX(0)
    }
  }

  return (
    <div className="relative overflow-hidden" ref={containerRef}>
      {/* 빨간 삭제 배경 */}
      <div className="absolute inset-y-0 right-0 flex items-center justify-center bg-red-500"
        style={{ width: DELETE_THRESHOLD }}
      >
        <button
          onClick={handleDelete}
          className="flex items-center justify-center w-full h-full active:bg-red-600"
          disabled={deleting}
        >
          <Trash2 className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* 슬라이드되는 콘텐츠 */}
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
      >
        {children}
      </div>
    </div>
  )
}
