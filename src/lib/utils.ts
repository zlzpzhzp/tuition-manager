import type { Student } from '@/types'
import useSWR, { mutate as globalMutate } from 'swr'

// ─── SWR Fetcher & Hooks ─────────────────────────────────────────
const swrFetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `요청 실패 (${res.status})`)
  }
  return res.json()
}

const swrOptions = {
  revalidateOnFocus: false,
  dedupingInterval: 5000,
}

export function useGrades<T = unknown>() {
  return useSWR<T>('/api/grades', swrFetcher, swrOptions)
}

export function useTeachers<T = unknown>() {
  return useSWR<T>('/api/teachers', swrFetcher, swrOptions)
}

export function revalidateTeachers() {
  globalMutate('/api/teachers')
}

export function usePayments<T = unknown>(billingMonth: string | null) {
  return useSWR<T>(
    billingMonth ? `/api/payments?billing_month=${billingMonth}` : null,
    swrFetcher,
    swrOptions,
  )
}

/** 데이터 변경 후 관련 캐시 무효화 */
export function revalidateGrades() {
  globalMutate('/api/grades')
}

export function revalidatePayments(billingMonth: string) {
  globalMutate(`/api/payments?billing_month=${billingMonth}`)
}

// ─── Date Helpers (re-export from lib/date) ─────────────────────────
export { getTodayString } from './date'

// ─── Payment Due Day ──────────────────────────────────────────────
/** 학생의 결제 예정일 (등록일 기준 매월 같은 날) */
export function getPaymentDueDay(student: Student): number {
  return new Date(student.enrollment_date).getDate()
}

/** 결제일이 아직 안 지났으면 true (예정), 지났으면 false (미납) */
export function isPaymentScheduled(student: Student, selectedMonth: string, overrideDueDay?: number): boolean {
  const paymentDay = overrideDueDay ?? getPaymentDueDay(student)
  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  if (selectedMonth < currentMonth) return false
  if (selectedMonth > currentMonth) return true
  return today.getDate() < paymentDay
}

// ─── Month Helpers ────────────────────────────────────────────────
export function getPrevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-')
  return `${y}년 ${parseInt(m)}월`
}

export function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ─── Payment Memo ─────────────────────────────────────────────────
/** DB에서 읽어온 메모에서 레거시 기타 결제방법 태그를 디코딩 (하위 호환) */
export function decodePaymentMemo(memo?: string | null): { cleanMemo: string | null; otherMethod: string | null } {
  if (!memo) return { cleanMemo: null, otherMethod: null }
  const match = memo.match(/^\[기타:(.+?)\]/)
  if (match) {
    const remaining = memo.replace(/^\[기타:.+?\]/, '').trim()
    return { cleanMemo: remaining || null, otherMethod: match[1] }
  }
  return { cleanMemo: memo, otherMethod: null }
}

// ─── Student Helpers ──────────────────────────────────────────────
/** 활성 학생 필터링 — month를 넘기면 해당 월에 퇴원한 학생도 포함 (취소선 표시용) */
export function getActiveStudents<T extends { withdrawal_date?: string | null }>(students: T[], month?: string): T[] {
  return students.filter(s => {
    if (!s.withdrawal_date) return true
    if (!month) return false
    // 퇴원한 달까지는 목록에 포함
    return s.withdrawal_date.slice(0, 7) >= month
  })
}

/** 해당 월 기준으로 퇴원한 학생인지 확인 */
export function isWithdrawnStudent(student: { withdrawal_date?: string | null }): boolean {
  return !!student.withdrawal_date
}

/** 학생의 미납 라벨 텍스트 생성 */
export function getUnpaidLabelText(student: Student, month: string, overrideDueDay?: number): string {
  const day = overrideDueDay ?? getPaymentDueDay(student)
  const m = parseInt(month.split('-')[1])
  const scheduled = isPaymentScheduled(student, month, overrideDueDay)
  return `${m}/${day} ${scheduled ? '예정' : '미납'}`
}

// ─── Fetch with Error Handling ────────────────────────────────────
export async function safeFetch<T>(url: string, options?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, options)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { data: null, error: err.error || `요청 실패 (${res.status})` }
    }
    const data = await res.json()
    return { data, error: null }
  } catch {
    return { data: null, error: '네트워크 오류가 발생했습니다.' }
  }
}

/** POST/PUT/DELETE with JSON body */
export async function safeMutate<T>(url: string, method: string, body?: unknown): Promise<{ data: T | null; error: string | null }> {
  return safeFetch<T>(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}
