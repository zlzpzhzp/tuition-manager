'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, password }),
      })
      const data = await res.json()
      if (data.success) { router.push('/dashboard'); router.refresh() }
      else setError(data.error)
    } catch { setError('로그인 중 오류가 발생했습니다.') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 bg-base">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-[var(--blue)] rounded-3xl flex items-center justify-center mx-auto mb-5">
            <span className="text-white text-2xl font-extrabold">W</span>
          </div>
          <h1 className="text-[24px] font-extrabold text-primary tracking-tight">원비관리</h1>
          <p className="text-[15px] text-tertiary mt-2">학원 원비 관리 시스템</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text" value={id} onChange={(e) => setId(e.target.value)}
            className="w-full px-5 py-4 bg-surface rounded-2xl text-[15px] text-primary placeholder-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--blue)] transition-all"
            placeholder="아이디" autoComplete="username" required
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full px-5 py-4 bg-surface rounded-2xl text-[15px] text-primary placeholder-tertiary focus:outline-none focus:ring-2 focus:ring-[var(--blue)] transition-all"
            placeholder="비밀번호" autoComplete="current-password" required
          />
          {error && <p className="text-danger text-[14px] text-center py-1">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-4 bg-[var(--blue)] text-white rounded-2xl text-[16px] font-bold hover:bg-[#2970dd] disabled:bg-surface-hover disabled:text-tertiary transition-all active:scale-[0.98]">
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}
