'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Kill-switch: nuke any existing SW + all caches. Older SW versions
    // cached HTML and served stale, unstyled pages on iOS Safari.
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)))
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister())
    })
  }, [])
  return null
}
