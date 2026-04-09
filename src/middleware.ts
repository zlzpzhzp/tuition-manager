import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'

function verifyToken(token: string): boolean {
  const dotIdx = token.indexOf('.')
  if (dotIdx < 0) return false
  try {
    const payload = token.slice(0, dotIdx)
    const signature = token.slice(dotIdx + 1)
    const adminId = Buffer.from(payload, 'base64url').toString('utf-8')
    if (!adminId || !adminId.trim()) return false
    const secret = process.env.SESSION_SECRET || 'tuition-dev-secret-local-only'
    const expected = createHmac('sha256', secret).update(adminId).digest('base64url')
    return signature === expected
  } catch {
    return false
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 로그인 페이지, API 로그인, 정적 파일은 통과
  if (
    pathname === '/login' ||
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/logout' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  const token = request.cookies.get('auth_token')?.value
  if (!token || !verifyToken(token)) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}
