'use client'

import { motion } from 'framer-motion'

function Shimmer({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`skeleton-shimmer rounded-xl ${className ?? ''}`}
      style={style}
    />
  )
}

export function DashboardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-5"
    >
      <div>
        <Shimmer className="h-4 w-40 mb-2" />
        <Shimmer className="h-8 w-32" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className="card p-5 space-y-3"
          >
            <div className="flex items-center gap-1.5">
              <Shimmer className="w-4 h-4 rounded-full" />
              <Shimmer className="h-3 w-12" />
            </div>
            <Shimmer className="h-8 w-16" />
          </motion.div>
        ))}
      </div>
      <div className="card p-5 space-y-3">
        <Shimmer className="h-5 w-24" />
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Shimmer className="h-4 w-14" />
              <Shimmer className="h-3 w-10" />
            </div>
            <Shimmer className="h-4 w-20" />
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export function PaymentsSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="flex items-center justify-center gap-3 mb-4">
        <Shimmer className="w-10 h-10 rounded-lg" />
        <Shimmer className="h-10 w-56 sm:w-72" />
        <Shimmer className="w-10 h-10 rounded-lg" />
      </div>
      {[0, 1].map(gi => (
        <motion.div
          key={gi}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: gi * 0.1, duration: 0.35 }}
          className="mb-4"
        >
          <Shimmer className="h-4 w-16 mb-2 ml-1" />
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 bg-[#2c2c33]/40 border-b border-[#2c2c33]">
              <Shimmer className="h-3 w-24" />
            </div>
            {[0, 1, 2, 3].map(si => (
              <div key={si} className="flex items-center gap-2 px-4 py-3 border-b border-[#2c2c33]/30 last:border-0">
                <Shimmer className="h-4 w-14 flex-1" />
                <Shimmer className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}
