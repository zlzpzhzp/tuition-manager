'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, CreditCard, Wallet, Settings } from 'lucide-react'
import { useEffect, useRef, useCallback } from 'react'
import { useNavDirection } from './PageTransition'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/payments', label: '납부', icon: CreditCard },
  { href: '/finance', label: '재정', icon: Wallet },
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

    // 수평 스와이프 감지: 최소 60px, 수직보다 수평이 커야, 500ms 이내
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) || dt > 500) return

    const currentIdx = navItems.findIndex(item => pathname === item.href || pathname.startsWith(item.href + '/'))
    if (currentIdx < 0) return

    const len = navItems.length
    if (dx < 0) {
      // 왼쪽 스와이프 → 다음 탭
      const nextIdx = (currentIdx + 1) % len
      setDirection('left')
      router.push(navItems[nextIdx].href)
    } else if (dx > 0) {
      // 오른쪽 스와이프 → 이전 탭
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
      <nav className="shadow-lg" style={{ backgroundColor: '#1e2d6f' }}>
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard" className="flex items-center gap-2" aria-label="홈으로 이동">
              <Image src="/icons/icon-192x192.png" alt="원비관리" width={32} height={32} className="rounded-md" />
              <span className="text-lg font-bold text-[#d8d8dc]">원비관리</span>
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
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                      ${isActive(href)
                        ? 'bg-[#d8d8dc] text-[#1e2d6f]'
                        : 'text-[#c8c5be] hover:bg-white/10'}`}
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

      <div className="fixed bottom-0 left-0 right-0 sm:hidden z-50 border-t bg-white" style={{ borderColor: '#dde1ef' }}>
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
                className="flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors relative"
                style={{ color: active ? '#1e2d6f' : '#9ca3af' }}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[11px] font-medium">{label}</span>
                {active && (
                  <span className="absolute bottom-0 w-8 h-0.5 rounded-full" style={{ backgroundColor: '#1e2d6f' }} />
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
