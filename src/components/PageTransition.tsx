'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState, createContext, useContext } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

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

const springTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 30,
  mass: 0.8,
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { direction } = useNavDirection()
  const prefersReducedMotion = useReducedMotion()
  const [key, setKey] = useState(pathname)

  useEffect(() => {
    setKey(pathname)
  }, [pathname])

  if (prefersReducedMotion) {
    return <div>{children}</div>
  }

  const xOffset = direction === 'left' ? 60 : direction === 'right' ? -60 : 0
  const hasSlide = direction !== 'none'

  return (
    <motion.div
      key={key}
      initial={{
        opacity: hasSlide ? 0.4 : 0.6,
        x: xOffset,
        scale: hasSlide ? 0.97 : 1,
      }}
      animate={{
        opacity: 1,
        x: 0,
        scale: 1,
      }}
      transition={springTransition}
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </motion.div>
  )
}
