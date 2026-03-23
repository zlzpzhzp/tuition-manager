'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CreditCard, Settings } from 'lucide-react'
import { useEffect, useRef, useCallback } from 'react'
import { useNavDirection } from './PageTransition'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/payments', label: '납부', icon: CreditCard },
  { href: '/settings', label: '설정', icon: Settings },
]

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const { setDirection } = useNavDirection()

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  // 탭 전환 시 스크롤 상단으로
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // 스와이프로 탭 전환
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    touchStart.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now(),
    }
  }, [])

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStart.current) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    const dt = Date.now() - touchStart.current.time
    touchStart.current = null

    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) || dt > 500) return

    const currentIdx = navItems.findIndex(item => pathname === item.href || pathname.startsWith(item.href + '/'))
    if (currentIdx < 0) return

    const len = navItems.length
    if (dx < 0) {
      const nextIdx = (currentIdx + 1) % len
      setDirection('left')
      router.push(navItems[nextIdx].href)
    } else if (dx > 0) {
      const prevIdx = (currentIdx - 1 + len) % len
      setDirection('right')
      router.push(navItems[prevIdx].href)
    }
  }, [pathname, router, setDirection])

  useEffect(() => {
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd)
    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [handleTouchStart, handleTouchEnd])

  if (pathname === '/login') return null

  return (
    <>
      {/* 상단 헤더 — 56px 높이, accent 배경 */}
      <nav style={{ backgroundColor: 'var(--accent)', height: 56 }}>
        <div className="max-w-4xl mx-auto px-4 h-full">
          <div className="flex items-center justify-between h-full">
            <Link href="/dashboard" className="flex items-center gap-2 ios-tap" aria-label="홈으로 이동">
              <Image src="/icons/icon-192x192.png" alt="원비관리" width={28} height={28} className="rounded-md" />
              <span style={{ color: '#FFFFFF', fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>원비관리</span>
            </Link>
            <div className="hidden sm:flex gap-1">
              {navItems.map(({ href, label, icon: Icon }, idx) => {
                const currentIdx = navItems.findIndex(item => isActive(item.href))
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-label={label}
                    onClick={() => setDirection(idx > currentIdx ? 'left' : idx < currentIdx ? 'right' : 'none')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ios-tap"
                    style={{
                      color: isActive(href) ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
                      backgroundColor: isActive(href) ? 'rgba(255,255,255,0.15)' : 'transparent',
                    }}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* 하단 탭바 (모바일) — iOS 스타일 블러 배경 */}
      <div
        className="fixed bottom-0 left-0 right-0 sm:hidden z-50"
        style={{
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '0.5px solid var(--separator)',
        }}
      >
        <div className="flex">
          {navItems.map(({ href, label, icon: Icon }, idx) => {
            const active = isActive(href)
            const currentIdx = navItems.findIndex(item => isActive(item.href))
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                onClick={() => setDirection(idx > currentIdx ? 'left' : idx < currentIdx ? 'right' : 'none')}
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 ios-tap"
                style={{ color: active ? 'var(--accent)' : 'var(--text-tertiary)' }}
              >
                <Icon style={{ width: 24, height: 24 }} />
                <span style={{ fontSize: 10, fontWeight: 500 }}>{label}</span>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
