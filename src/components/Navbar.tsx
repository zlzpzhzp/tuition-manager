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
      {/* 데스크톱 상단 */}
      <nav className="sticky top-0 z-40" style={{ background: '#212126', borderBottom: '1px solid #2c2c33' }}>
        <div className="max-w-4xl mx-auto px-5">
          <div className="flex items-center justify-between h-14">
            <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="홈으로 이동">
              <Image src="/icons/icon-192x192.png" alt="원비관리" width={28} height={28} className="rounded-lg" />
              <span className="text-[17px] font-bold text-[#ececec] tracking-tight">원비관리</span>
            </Link>
            <div className="flex items-center gap-1">
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
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all
                        ${active
                          ? 'bg-[#3182f6] text-white'
                          : 'text-[#8b8b9a] hover:text-[#ececec] hover:bg-[#2c2c33]'}`}
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
                className={`p-2.5 rounded-xl transition-all ${
                  isActive('/finance')
                    ? 'bg-[#3182f6] text-white'
                    : 'text-[#8b8b9a] hover:text-[#ececec] hover:bg-[#2c2c33]'
                }`}
              >
                <Wallet className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* 모바일 하단 */}
      <div className="fixed bottom-0 left-0 right-0 sm:hidden z-50" style={{ background: '#212126', borderTop: '1px solid #2c2c33' }}>
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
                className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative"
              >
                <Icon className="w-[22px] h-[22px]" style={{ color: active ? '#3182f6' : '#5e5e6e' }} />
                <span className="text-[10px] font-bold" style={{ color: active ? '#3182f6' : '#5e5e6e' }}>{label}</span>
              </Link>
            )
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </div>
    </>
  )
}
