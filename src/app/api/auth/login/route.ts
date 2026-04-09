import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken, COOKIE_NAME, MAX_AGE } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const { id, password } = await request.json()

  const adminId = process.env.ADMIN_ID
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminId || !adminPassword) {
    console.error('[Auth] ADMIN_ID 또는 ADMIN_PASSWORD 환경변수가 설정되지 않았습니다!')
    return NextResponse.json({ success: false, error: '서버 설정 오류' }, { status: 500 })
  }

  if (id === adminId && password === adminPassword) {
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

  return NextResponse.json({ success: false, error: '아이디 또는 비밀번호가 틀렸습니다.' }, { status: 401 })
}
