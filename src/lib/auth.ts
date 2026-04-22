import { createHmac } from 'crypto'
import { NextResponse } from 'next/server'

const COOKIE_NAME = 'auth_token'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다 (최소 16자)')
  }
  return secret
}

function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('base64url')
}

export function createSessionToken(): string {
  const adminId = process.env.ADMIN_ID || ''
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const body = `${adminId}|${exp}`
  const payload = Buffer.from(body).toString('base64url')
  const signature = sign(body)
  return `${payload}.${signature}`
}

export function verifySessionToken(token: string): boolean {
  if (!token) return false
  const dotIdx = token.indexOf('.')
  if (dotIdx < 0) return false

  try {
    const payload = token.slice(0, dotIdx)
    const signature = token.slice(dotIdx + 1)
    const body = Buffer.from(payload, 'base64url').toString('utf-8')
    const pipeIdx = body.lastIndexOf('|')
    if (pipeIdx < 0) return false
    const adminId = body.slice(0, pipeIdx)
    const exp = Number(body.slice(pipeIdx + 1))
    if (!adminId || !adminId.trim()) return false
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return false
    const expected = sign(body)
    return signature === expected
  } catch {
    return false
  }
}

/**
 * Mutating API 라우트용 defense-in-depth 가드.
 * 미들웨어가 모든 경로에서 이미 검증하지만, 미들웨어 버그/우회 대비해
 * 라우트에서도 재확인. 인증 실패 시 401 Response 반환, 성공 시 null.
 *
 * 사용: `const unauthorized = requireAdminSession(request); if (unauthorized) return unauthorized`
 */
export function requireAdminSession(request: Request): NextResponse | null {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/)
  const token = match ? decodeURIComponent(match[1]) : ''
  if (!token || !verifySessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export { COOKIE_NAME, MAX_AGE }
