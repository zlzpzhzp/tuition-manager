'use client'

// @dm-ui/SwipeableItem — 자동생성. 수정은 /root/dm-ui/src/components/SwipeableItem.tsx 에서.

import { useRef, useState, useCallback, useEffect, ReactNode } from 'react'
import { Trash2, Pin, FolderInput } from 'lucide-react'

const SPRING = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'

interface Props {
  children: ReactNode
  onDelete: () => void | Promise<void>
  onPin?: () => void | Promise<void>
  onMove?: () => void
  pinned?: boolean
  pinLabel?: { on: string; off: string }
  moveLabel?: string
  moveIcon?: ReactNode
}

export default function SwipeableItem({ children, onDelete, onPin, onMove, pinned, pinLabel, moveLabel, moveIcon }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const leftBtnsRef = useRef<HTMLDivElement>(null)
  const rightBtnRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const locked = useRef(false)
  const didSwipe = useRef(false)
  const baseOffset = useRef(0)
  const wasOpen = useRef<'left' | 'right' | null>(null)
  const [swiped, setSwiped] = useState<'left' | 'right' | null>(null)
  const swipedRef = useRef<'left' | 'right' | null>(null)
  const [deleting, setDeleting] = useState(false)

  const DELETE_W = 80
  const hasRight = !!(onPin || onMove)
  const RIGHT_W = onPin && onMove ? 160 : 80

  useEffect(() => { swipedRef.current = swiped }, [swiped])

  useEffect(() => {
    if (!swiped) return
    function handleOutsideTouch(e: TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSwiped(null)
        if (rowRef.current) {
          rowRef.current.style.transition = SPRING
          rowRef.current.style.transform = ''
        }
      }
    }
    document.addEventListener('touchstart', handleOutsideTouch, { passive: true })
    return () => document.removeEventListener('touchstart', handleOutsideTouch)
  }, [swiped])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    locked.current = false
    didSwipe.current = false
    wasOpen.current = swipedRef.current
    if (swipedRef.current === 'right') baseOffset.current = RIGHT_W
    else if (swipedRef.current === 'left') baseOffset.current = -DELETE_W
    else baseOffset.current = 0
  }, [RIGHT_W])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const row = rowRef.current
    if (!row) return

    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current

    if (!locked.current && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      locked.current = true
      return
    }

    if (!locked.current && Math.abs(dx) > 10) {
      locked.current = true
    }

    if (!locked.current) return
    if (Math.abs(dy) > Math.abs(dx) && !didSwipe.current) return

    if (Math.abs(dx) > 5) didSwipe.current = true
    e.preventDefault()

    const raw = baseOffset.current + dx
    const maxRight = hasRight ? RIGHT_W + 30 : 0
    const maxLeft = -(DELETE_W + 30)
    const clamped = Math.max(Math.min(raw, maxRight), maxLeft)

    let x: number
    if (clamped > RIGHT_W) {
      x = RIGHT_W + Math.sqrt(clamped - RIGHT_W) * 3
    } else if (clamped < -DELETE_W) {
      x = -(DELETE_W + Math.sqrt(Math.abs(clamped) - DELETE_W) * 2)
    } else {
      x = clamped
    }

    row.style.transition = 'none'
    row.style.transform = `translateX(${x}px)`

    if (wasOpen.current === 'right' && x > RIGHT_W && leftBtnsRef.current) {
      leftBtnsRef.current.style.transition = 'none'
      leftBtnsRef.current.style.width = `${x}px`
    }
    if (wasOpen.current === 'left' && x < -DELETE_W && rightBtnRef.current) {
      rightBtnRef.current.style.transition = 'none'
      rightBtnRef.current.style.width = `${Math.abs(x)}px`
    }
  }, [hasRight, RIGHT_W])

  const handleTouchEnd = useCallback(() => {
    const row = rowRef.current
    if (!row || !didSwipe.current) return

    const dx = parseFloat(row.style.transform.match(/translateX\(([^)]+)px\)/)?.[1] || '0')
    row.style.transition = SPRING
    const SPRING_W = 'width 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
    if (leftBtnsRef.current && leftBtnsRef.current.style.width) {
      leftBtnsRef.current.style.transition = SPRING_W
      leftBtnsRef.current.style.width = `${RIGHT_W}px`
      setTimeout(() => { if (leftBtnsRef.current) leftBtnsRef.current.style.transition = '' }, 350)
    }
    if (rightBtnRef.current && rightBtnRef.current.style.width) {
      rightBtnRef.current.style.transition = SPRING_W
      rightBtnRef.current.style.width = `${DELETE_W}px`
      setTimeout(() => { if (rightBtnRef.current) rightBtnRef.current.style.transition = '' }, 350)
    }

    if (wasOpen.current === 'right' && dx > RIGHT_W) {
      row.style.transform = ''
      setSwiped(null)
      return
    }
    if (wasOpen.current === 'left' && dx < -DELETE_W) {
      row.style.transform = ''
      setSwiped(null)
      return
    }

    if (dx < -DELETE_W / 2) {
      row.style.transform = `translateX(-${DELETE_W}px)`
      setSwiped('left')
    } else if (dx > RIGHT_W / 2 && hasRight) {
      row.style.transform = `translateX(${RIGHT_W}px)`
      setSwiped('right')
    } else {
      row.style.transform = ''
      setSwiped(null)
    }
  }, [hasRight, RIGHT_W])

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (didSwipe.current || swiped) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [swiped])

  function resetSwipe() {
    setSwiped(null)
    if (rowRef.current) {
      rowRef.current.style.transition = SPRING
      rowRef.current.style.transform = ''
    }
  }

  async function handleDelete() {
    if (deleting) return
    setDeleting(true)
    try { await onDelete() } catch { /* */ }
    finally { setDeleting(false); resetSwipe() }
  }

  async function handlePin() {
    if (!onPin) return
    try { await onPin() } catch { /* */ }
    resetSwipe()
  }

  function handleMove() {
    if (!onMove) return
    resetSwipe()
    onMove()
  }

  return (
    <div ref={containerRef} className="relative overflow-hidden" style={{ touchAction: 'pan-y', WebkitUserSelect: 'none', userSelect: 'none' }}>
      {hasRight && (
        <div ref={leftBtnsRef} className="absolute inset-y-0 left-0 flex" style={{ width: RIGHT_W }}>
          {onMove && (
            <button
              onClick={handleMove}
              className="flex flex-col items-center justify-center flex-1 active:opacity-80 gap-0.5"
              style={{ backgroundColor: 'var(--swipe-move-bg)', color: 'var(--swipe-move-fg)' }}
            >
              {moveIcon || <FolderInput className="w-5 h-5" />}
              <span className="text-[10px] font-medium">{moveLabel || '이동'}</span>
            </button>
          )}
          {onPin && (
            <button
              onClick={handlePin}
              className="flex flex-col items-center justify-center flex-1 active:opacity-80 gap-0.5"
              style={{ backgroundColor: pinned ? 'var(--swipe-pin-bg-active)' : 'var(--swipe-pin-bg)', color: 'var(--swipe-pin-fg)' }}
            >
              <Pin className="w-5 h-5" style={pinned ? undefined : { transform: 'rotate(45deg)' }} />
              <span className="text-[10px] font-medium">
                {pinned ? (pinLabel?.on || '해제') : (pinLabel?.off || '고정')}
              </span>
            </button>
          )}
        </div>
      )}

      <div ref={rightBtnRef} className="absolute inset-y-0 right-0 flex items-center justify-center"
        style={{ width: DELETE_W, backgroundColor: 'var(--status-delete-bg)' }}
      >
        <button onClick={handleDelete} className="flex items-center justify-center w-full h-full active:bg-[var(--bg-active)]" disabled={deleting}>
          <Trash2 className="w-5 h-5 text-red-500" />
        </button>
      </div>

      <div
        ref={rowRef}
        className="relative"
        style={{ backgroundColor: 'var(--bg-primary)', zIndex: 1, transition: SPRING }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClickCapture={handleClickCapture}
      >
        {children}
      </div>
    </div>
  )
}
