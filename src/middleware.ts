import { NextRequest, NextResponse } from 'next/server'

let cachedKey: CryptoKey | null = null
let cachedSecret: string | null = null

async function getHmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다 (최소 16자)')
  }
  if (cachedKey && cachedSecret === secret) return cachedKey
  cachedSecret = secret
  cachedKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return cachedKey
}

async function verifyToken(token: string): Promise<boolean> {
  const dotIdx = token.indexOf('.')
  if (dotIdx < 0) return false
  try {
    const payload = token.slice(0, dotIdx)
    const signature = token.slice(dotIdx + 1)
    const body = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const pipeIdx = body.lastIndexOf('|')
    if (pipeIdx < 0) return false
    const adminId = body.slice(0, pipeIdx)
    const exp = Number(body.slice(pipeIdx + 1))
    if (!adminId || !adminId.trim()) return false
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false
    const key = await getHmacKey()
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return signature === expected
  } catch {
    return false
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 로그인 페이지, API 로그인, 정적 파일은 통과
  if (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname.startsWith('/api/payssam/callback') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth_token')?.value
  if (!token || !(await verifyToken(token))) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
