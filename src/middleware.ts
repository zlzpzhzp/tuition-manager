import { NextRequest, NextResponse } from 'next/server'

let cachedKey: CryptoKey | null = null
let cachedSecret: string | null = null

async function getHmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET || 'tuition-dev-secret-local-only'
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
    const adminId = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    if (!adminId || !adminId.trim()) return false
    const key = await getHmacKey()
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(adminId))
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
