import { createHmac } from 'crypto'

const COOKIE_NAME = 'auth_token'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    console.error('[Auth] SESSION_SECRET 환경변수가 설정되지 않았습니다!')
  }
  return secret || 'tuition-dev-secret-local-only'
}

function sign(data: string): string {
  return createHmac('sha256', getSecret()).update(data).digest('base64url')
}

export function createSessionToken(): string {
  const adminId = process.env.ADMIN_ID || ''
  const payload = Buffer.from(adminId).toString('base64url')
  const signature = sign(adminId)
  return `${payload}.${signature}`
}

export function verifySessionToken(token: string): boolean {
  if (!token) return false
  const dotIdx = token.indexOf('.')
  if (dotIdx < 0) return false

  try {
    const payload = token.slice(0, dotIdx)
    const signature = token.slice(dotIdx + 1)
    const adminId = Buffer.from(payload, 'base64url').toString('utf-8')
    if (!adminId || !adminId.trim()) return false
    const expected = sign(adminId)
    return signature === expected
  } catch {
    return false
  }
}

export { COOKIE_NAME, MAX_AGE }
