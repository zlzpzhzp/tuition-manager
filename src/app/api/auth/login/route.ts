import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createSessionToken, COOKIE_NAME, MAX_AGE } from '@/lib/auth'

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) {
    // length 비교 자체는 leak되지만, 더미 비교로 timing 평탄화
    timingSafeEqual(bBuf, bBuf)
    return false
  }
  return timingSafeEqual(aBuf, bBuf)
}

export async function POST(request: NextRequest) {
  const { id, password } = await request.json()

  const adminId = process.env.ADMIN_ID
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminId || !adminPassword) {
    console.error('[Auth] ADMIN_ID 또는 ADMIN_PASSWORD 환경변수가 설정되지 않았습니다!')
    return NextResponse.json({ success: false, error: '서버 설정 오류' }, { status: 500 })
  }

  const idInput = typeof id === 'string' ? id : ''
  const passwordInput = typeof password === 'string' ? password : ''

  const idMatch = safeEqual(idInput, adminId)
  const passwordMatch = safeEqual(passwordInput, adminPassword)

  if (idMatch && passwordMatch) {
    const response = NextResponse.json({ success: true })
    response.cookies.set(COOKIE_NAME, createSessionToken(), {
      httpOnly: true,
      secure: process.env.VERCEL === '1',
      sameSite: 'lax',
      maxAge: MAX_AGE,
      path: '/',
    })
    return response
  }

  // 실패 시 약간의 딜레이로 brute-force 비용 상승
  await new Promise(r => setTimeout(r, 300))
  return NextResponse.json({ success: false, error: '아이디 또는 비밀번호가 틀렸습니다.' }, { status: 401 })
}
