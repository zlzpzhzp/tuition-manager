import { NextRequest, NextResponse } from 'next/server'

const CREDENTIALS = {
  id: 'dminstitute',
  password: 'eldpa3621!',
}

export async function POST(request: NextRequest) {
  const { id, password } = await request.json()

  if (id === CREDENTIALS.id && password === CREDENTIALS.password) {
    const response = NextResponse.json({ success: true })
    response.cookies.set('auth_token', 'authenticated', {
      httpOnly: true,
      secure: process.env.VERCEL === '1',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30일
      path: '/',
    })
    return response
  }

  return NextResponse.json({ success: false, error: '아이디 또는 비밀번호가 틀렸습니다.' }, { status: 401 })
}
