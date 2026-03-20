'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, createContext, useContext } from 'react'

type Direction = 'left' | 'right' | 'none'
const NavDirectionContext = createContext<{
  direction: Direction
  setDirection: (d: Direction) => void
}>({ direction: 'none', setDirection: () => {} })

export function useNavDirection() {
  return useContext(NavDirectionContext)
}

export function NavDirectionProvider({ children }: { children: React.ReactNode }) {
  const [direction, setDirection] = useState<Direction>('none')
  return (
    <NavDirectionContext.Provider value={{ direction, setDirection }}>
      {children}
    </NavDirectionContext.Provider>
  )
}

function getAnimClass(direction: Direction): string {
  if (direction === 'left') return 'animate-slide-in-right'
  if (direction === 'right') return 'animate-slide-in-left'
  return 'animate-fade-in'
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { direction } = useNavDirection()
  const [animClass, setAnimClass] = useState('')
  const prevPathname = useRef(pathname)

  useEffect(() => {
    if (prevPathname.current === pathname) return
    prevPathname.current = pathname
    setAnimClass(getAnimClass(direction))
    const timer = setTimeout(() => setAnimClass(''), 150)
    return () => clearTimeout(timer)
  }, [pathname, direction])

  return (
    <div className={animClass} style={animClass ? { willChange: 'transform, opacity' } : undefined}>
      {children}
    </div>
  )
}
