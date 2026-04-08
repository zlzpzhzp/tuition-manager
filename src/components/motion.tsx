'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from 'framer-motion'

export function TapScale({
  children,
  className,
  style,
  onClick,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  onClick?: () => void
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
      className={className}
      style={style}
      onClick={onClick}
    >
      {children}
    </motion.div>
  )
}

export function FadeInUp({
  children,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 24,
        delay,
      }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  )
}

export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.04,
}: {
  children: React.ReactNode
  className?: string
  staggerDelay?: number
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: staggerDelay } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { type: 'spring', stiffness: 300, damping: 24 },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

// 숫자 카운터 애니메이션 (토스 스타일)
export function AnimatedNumber({
  value,
  className,
  suffix,
  suffixClassName,
  duration = 0.8,
}: {
  value: number
  className?: string
  suffix?: string
  suffixClassName?: string
  duration?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(0)
  const springValue = useSpring(motionValue, {
    stiffness: 100,
    damping: 20,
    duration: duration * 1000,
  })

  useEffect(() => {
    motionValue.set(value)
  }, [value, motionValue])

  useEffect(() => {
    const unsubscribe = springValue.on('change', (v) => {
      if (ref.current) {
        ref.current.textContent = Math.round(v).toLocaleString()
      }
    })
    return unsubscribe
  }, [springValue])

  return (
    <>
      <span ref={ref} className={className}>0</span>
      {suffix && <span className={suffixClassName}>{suffix}</span>}
    </>
  )
}

// 섹션 접기/펼치기 애니메이션
export function CollapsibleSection({
  isOpen,
  children,
  className,
}: {
  isOpen: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ overflow: 'hidden' }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// 모달 드래그로 닫기 (바텀시트)
export function DraggableBottomSheet({
  children,
  onClose,
  className,
}: {
  children: React.ReactNode
  onClose: () => void
  className?: string
}) {
  const y = useMotionValue(0)
  const opacity = useTransform(y, [0, 300], [1, 0.3])
  const scale = useTransform(y, [0, 300], [1, 0.95])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 500) {
            onClose()
          }
        }}
        style={{ y, opacity, scale }}
        className={className}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* 드래그 핸들 */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 rounded-full bg-[#5e5e6e]" />
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

// 리스트 아이템 개별 등장 애니메이션
export function ListItem({
  children,
  className,
  index = 0,
}: {
  children: React.ReactNode
  className?: string
  index?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 28,
        delay: Math.min(index * 0.03, 0.3),
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
