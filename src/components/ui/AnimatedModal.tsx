'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface AnimatedModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  maxWidth?: string
  fullscreen?: boolean
  closeOnBackdrop?: boolean
}

export default function AnimatedModal({
  open,
  onClose,
  children,
  maxWidth = 'max-w-md',
  fullscreen = false,
  closeOnBackdrop = true,
}: AnimatedModalProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleEsc)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex ${fullscreen ? '' : 'items-center justify-center px-4'}`}
          onClick={closeOnBackdrop ? onClose : undefined}
        >
          <motion.div
            key="panel"
            initial={fullscreen ? { opacity: 0, y: 24 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={fullscreen ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={fullscreen ? { opacity: 0, y: 24 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            className={fullscreen ? 'w-full h-full' : `w-full ${maxWidth}`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
