'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CreditCard, Wallet, Settings } from 'lucide-react'
import { useEffect } from 'react'
import { useNavDirection } from './PageTransition'

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/payments', label: '납부', icon: CreditCard },
  { href: '/settings', label: '설정', icon: Settings },
]

export default function Navbar() {
  const pathname = usePathname()
  const { setDirection } = useNavDirection()

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  if (pathname === '/login') return null

  return (
    <>
      {/* 데스크톱 상단 네비게이션 */}
      <nav className="backdrop-blur-md bg-[#1e2d6f]/95 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="홈으로 이동">
              <Image src="/icons/icon-192x192.png" alt="원비관리" width={30} height={30} className="rounded-lg" />
              <span className="text-[17px] font-bold text-white tracking-tight">원비관리</span>
            </Link>
            <div className="flex items-center gap-1.5">
              <div className="hidden sm:flex gap-1">
                {navItems.map(({ href, label, icon: Icon }, idx) => {
                  const currentIdx = navItems.findIndex(item => isActive(item.href))
                  const active = isActive(href)
                  return (
                    <Link
                      key={href}
                      href={href}
                      aria-label={label}
                      onClick={() => setDirection(idx > currentIdx ? 'left' : idx < currentIdx ? 'right' : 'none')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150
                        ${active
                          ? 'bg-white text-[#1e2d6f] shadow-sm'
                          : 'text-white/80 hover:text-white hover:bg-white/10'}`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </Link>
                  )
                })}
              </div>
              <Link
                href="/finance"
                aria-label="재정"
                className={`p-2 rounded-lg transition-all duration-150 ${
                  isActive('/finance')
                    ? 'bg-white text-[#1e2d6f] shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Wallet className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* 모바일 하단 네비게이션 */}
      <div className="fixed bottom-0 left-0 right-0 sm:hidden z-50 bg-white/95 backdrop-blur-md border-t border-gray-100">
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
                className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors relative"
              >
                <Icon className="w-5 h-5" style={{ color: active ? '#1e2d6f' : '#b0b5c3' }} />
                <span className="text-[10px] font-semibold" style={{ color: active ? '#1e2d6f' : '#b0b5c3' }}>{label}</span>
                {active && (
                  <span className="absolute bottom-0 w-10 h-[3px] rounded-full bg-[#1e2d6f]" />
                )}
              </Link>
            )
          })}
        </div>
        {/* Safe area for iPhone home indicator */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </>
  )
}
