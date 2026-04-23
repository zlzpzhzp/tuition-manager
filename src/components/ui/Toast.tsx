'use client'

// @dm-ui/Toast — 자동생성. 수정은 /root/dm-ui/src/components/Toast.tsx 에서.

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none w-[90vw] max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto animate-slide-down px-4 py-3 text-sm font-medium text-center"
            style={{
              borderRadius: 'var(--radius-md)',
              boxShadow: 'none',
              backgroundColor:
                t.type === 'success' ? 'var(--toast-success-bg)' :
                t.type === 'error' ? 'var(--toast-error-bg)' :
                'var(--toast-info-bg)',
              color:
                t.type === 'success' ? 'var(--status-success)' :
                t.type === 'error' ? 'var(--status-danger)' :
                'var(--status-info)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
      <style jsx global>{`
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-down {
          animation: slide-down 0.2s ease-out;
        }
      `}</style>
    </ToastContext.Provider>
  )
}
