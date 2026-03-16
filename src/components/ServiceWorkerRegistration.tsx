'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // Force clear all old caches and re-register
      caches.keys().then(keys => {
        keys.forEach(key => {
          if (key !== 'tuition-manager-v2') caches.delete(key)
        })
      })
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(reg => reg.unregister())
      }).then(() => {
        navigator.serviceWorker.register('/sw.js')
      })
    }
  }, [])
  return null
}
