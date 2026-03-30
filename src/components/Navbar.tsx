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

  // 탭 전환 시 스크롤 상단으로
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])


  if (pathname === '/login') return null

  return (
    <>
      <nav className="shadow-lg" style={{ backgroundColor: '#1e2d6f' }}>
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard" className="flex items-center gap-2" aria-label="홈으로 이동">
              <Image src="/icons/icon-192x192.png" alt="원비관리" width={32} height={32} className="rounded-md" />
              <span className="text-lg font-bold text-[#f0f0f2]">원비관리</span>
            </Link>
            <div className="flex items-center gap-2">
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
                        ? 'bg-[#f0f0f2] text-[#1e2d6f]'
                        : 'text-[#e8e8ec] hover:bg-white/10'}`}
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
                className="p-2 rounded-lg text-[#e8e8ec] hover:bg-white/10 transition-colors"
              >
                <Wallet className="w-5 h-5" />
              </Link>
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
