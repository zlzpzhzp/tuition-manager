import { NextResponse } from 'next/server'
import { isTestMode } from '@/lib/payssam'

export async function GET() {
  return NextResponse.json({ testMode: isTestMode() })
}
