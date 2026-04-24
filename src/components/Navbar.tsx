'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CreditCard, Send, Settings, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import useSWR from 'swr'
import { useNavDirection } from './PageTransition'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/payments', label: '납부', icon: CreditCard },
  { href: '/billing', label: '결제선생', icon: Send },
  { href: '/settings', label: '설정', icon: Settings },
]

export default function Navbar() {
  const pathname = usePathname()
  const { setDirection } = useNavDirection()
  const mobileNavRef = useRef<HTMLDivElement>(null)
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })

  const { data: testModeData } = useSWR<{ testMode: boolean }>(
    '/api/billing/test-mode',
    (url: string) => fetch(url).then(r => r.json())
  )
  const isTestMode = testModeData?.testMode ?? false

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const activeIdx = navItems.findIndex(item => isActive(item.href))

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // 모바일 하단 인디케이터 위치 계산
  useEffect(() => {
    if (mobileNavRef.current && activeIdx >= 0) {
      const items = mobileNavRef.current.children
      if (items[activeIdx]) {
        const el = items[activeIdx] as HTMLElement
        setIndicatorStyle({
          left: el.offsetLeft + el.offsetWidth / 2 - 12,
          width: 24,
        })
      }
    }
  }, [activeIdx])

  if (pathname === '/login') return null

  return (
    <>
      {/* 데스크톱 상단 */}
      <nav className="fixed top-0 left-0 right-0 z-40" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <div className="max-w-4xl mx-auto px-5">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="홈으로 이동">
              <Image src="/icons/icon-192x192.png" alt="원비관리" width={28} height={28} className="rounded-lg" />
              <span className="text-[17px] font-bold text-[var(--text-1)] tracking-tight">원비관리</span>
              {isTestMode && (
                <span
                  className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                  style={{ background: 'var(--orange-dim)', color: 'var(--orange)' }}
                  title="결제선생 테스트 모드 — 실제 발송되지 않습니다"
                >
                  TEST
                </span>
              )}
            </Link>
            <div className="flex items-center gap-1">
              <div className="hidden sm:flex gap-1 relative">
                {navItems.map(({ href, label, icon: Icon }, idx) => {
                  const active = isActive(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-label={label}
                      onClick={() => setDirection(idx > activeIdx ? 'left' : idx < activeIdx ? 'right' : 'none')}
                      className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors
                        ${active
                          ? 'text-white'
                          : 'text-[var(--text-3)] hover:text-[var(--text-1)]'}`}
                    >
                      {active && (
                        <motion.div
                          layoutId="desktop-nav-pill"
                          className="absolute inset-0 bg-[var(--blue)] rounded-xl"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {label}
                      </span>
                    </Link>
                  )
                })}
              </div>
              <Link
                href="/finance"
                data-finance-nav
                aria-label="재정"
                className={`p-2.5 rounded-xl transition-all ${
                  isActive('/finance')
                    ? 'bg-[var(--blue)] text-white'
                    : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--bg-card-hover)]'
                }`}
              >
                <Wallet className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* 모바일 하단 */}
      <div className="fixed bottom-0 left-0 right-0 sm:hidden z-50" style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
        {/* 슬라이딩 인디케이터 */}
        {activeIdx >= 0 && (
          <motion.div
            className="absolute top-0 h-[2px] bg-[var(--blue)] rounded-full"
            animate={{ left: indicatorStyle.left, width: indicatorStyle.width }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <div className="flex" ref={mobileNavRef}>
          {navItems.map(({ href, label, icon: Icon }, idx) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                onClick={() => setDirection(idx > activeIdx ? 'left' : idx < activeIdx ? 'right' : 'none')}
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative"
              >
                <motion.div
                  animate={{ scale: active ? 1 : 0.9, y: active ? -2 : 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Icon className="w-[22px] h-[22px]" style={{ color: active ? 'var(--blue)' : 'var(--text-4)' }} />
                </motion.div>
                <motion.span
                  className="text-[10px] font-bold"
                  animate={{ color: active ? 'var(--blue)' : 'var(--text-4)', scale: active ? 1.05 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {label}
                </motion.span>
              </Link>
            )
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </>
  )
}
