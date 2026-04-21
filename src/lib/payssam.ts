import { createHash } from 'crypto'

// 테스트 모드 해제 — 실제 발송 활성화 (2026-04-19, 초능력자님 승인)
const TEST_MODE = false

const BASE_URL = process.env.PAYSSAM_API_URL || 'https://stg.paymint.co.kr/partner'
const API_KEY = () => process.env.PAYSSAM_API_KEY || ''
const MEMBER = () => process.env.PAYSSAM_MEMBER || 'dminstitute'
const MERCHANT = () => process.env.PAYSSAM_MERCHANT || 'dminstitute'
const CALLBACK_URL = () => process.env.PAYSSAM_CALLBACK_URL || 'https://tuition.dminstitute.co/api/payssam/callback'

function generateHash(...parts: string[]): string {
  return createHash('sha256').update(parts.join(',')).digest('hex')
}

function generateBillId(): string {
  const ts = Date.now().toString(36)
  return `DM-${ts}`.slice(0, 20)
}

interface SendBillParams {
  studentName: string
  phone: string
  amount: number
  productName: string
  message?: string
  billIssuer?: string
  expireDate?: string
}

interface PaySsamResponse {
  code: string
  msg: string
  [key: string]: unknown
}

async function callApi(uri: string, body: Record<string, unknown>): Promise<PaySsamResponse> {
  const res = await fetch(`${BASE_URL}${uri}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', charset: 'UTF-8' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// 테스트 모드 확인용
export function isTestMode(): boolean {
  return TEST_MODE
}

// 2.1 청구서 발송
export async function sendBill(params: SendBillParams) {
  if (TEST_MODE) {
    console.log('[PaySsam] 🔒 테스트 모드 — 실제 발송 차단됨:', params.studentName, params.amount)
    return { code: 'TEST', msg: '테스트 모드: 실제 발송되지 않았습니다', bill_id: `TEST-${Date.now().toString(36)}` }
  }

  const billId = generateBillId()
  const hash = generateHash(billId, params.phone, String(params.amount))

  const body = {
    apikey: API_KEY(),
    member: MEMBER(),
    merchant: MERCHANT(),
    bill: {
      bill_issuer: params.billIssuer || '주식회사 디엠교육',
      bill_id: billId,
      product_nm: params.productName,
      message: params.message || `${params.studentName} ${params.productName}`,
      member_nm: params.studentName,
      phone: params.phone.replace(/-/g, ''),
      price: String(params.amount),
      hash,
      expire_dt: params.expireDate || getExpireDate(),
      callbackURL: CALLBACK_URL(),
    },
  }

  const result = await callApi('/if/bill/send', body)
  return { ...result, bill_id: billId }
}

// 2.3 결제 취소
export async function cancelBill(billId: string, amount: number) {
  if (TEST_MODE) {
    console.log('[PaySsam] 🔒 테스트 모드 — 결제 취소 차단됨:', billId, amount)
    return { code: '0000', msg: '테스트 모드: 실제 취소되지 않았습니다' }
  }
  const hash = generateHash(billId, String(amount))
  return callApi('/if/bill/cancel', {
    apikey: API_KEY(),
    member: MEMBER(),
    merchant: MERCHANT(),
    bill_id: billId,
    price: String(amount),
    hash,
  })
}

// 2.4 청구서 파기
export async function destroyBill(billId: string, amount: number) {
  if (TEST_MODE) {
    console.log('[PaySsam] 🔒 테스트 모드 — 청구서 파기 차단됨:', billId, amount)
    return { code: '0000', msg: '테스트 모드: 실제 파기되지 않았습니다' }
  }
  const hash = generateHash(billId, String(amount))
  return callApi('/if/bill/destroy', {
    apikey: API_KEY(),
    member: MEMBER(),
    merchant: MERCHANT(),
    bill_id: billId,
    price: String(amount),
    hash,
  })
}

// 2.5 결제 상태 조회
export async function readBill(billId: string) {
  if (TEST_MODE) {
    console.log('[PaySsam] 🔒 테스트 모드 — 상태 조회 차단됨:', billId)
    return { code: 'TEST', msg: '테스트 모드' }
  }
  return callApi('/if/bill/read', {
    apikey: API_KEY(),
    member: MEMBER(),
    merchant: MERCHANT(),
    bill_id: billId,
  })
}

// 2.9 재발송
export async function resendBill(billId: string) {
  if (TEST_MODE) {
    console.log('[PaySsam] 🔒 테스트 모드 — 재발송 차단됨:', billId)
    return { code: 'TEST', msg: '테스트 모드: 실제 재발송되지 않았습니다' }
  }
  return callApi('/if/bill/resend', {
    apikey: API_KEY(),
    member: MEMBER(),
    merchant: MERCHANT(),
    bill_id: billId,
  })
}

// 2.7 쌤포인트 잔액 조회
export async function getRemainPoints() {
  return callApi('/if/read/remain_count', {
    apikey: API_KEY(),
  })
}

function getExpireDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]
}
