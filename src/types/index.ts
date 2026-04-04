export type PaymentMethod = 'remote' | 'card' | 'transfer' | 'cash' | 'other'

export interface Teacher {
  id: string
  name: string
  phone?: string | null
  subject?: string | null
  memo?: string | null
  pay_ratio?: number | null
  order_index: number
  created_at: string
}

export interface Grade {
  id: string
  name: string
  order_index: number
  created_at: string
  classes?: Class[]
}

export interface Class {
  id: string
  grade_id: string
  name: string
  monthly_fee: number
  subject?: string | null
  class_days?: string | null
  teacher_id?: string | null
  order_index: number
  created_at: string
  grade?: Grade
  teacher?: Teacher | null
  students?: Student[]
}

export interface Student {
  id: string
  class_id: string | null
  name: string
  phone?: string
  parent_phone?: string
  enrollment_date: string
  withdrawal_date?: string | null
  custom_fee?: number | null
  payment_due_day?: number | null
  has_discuss?: boolean
  memo?: string
  created_at: string
  class?: Class
}

export type GradeWithClasses = Grade & { classes: (Class & { students: Student[] })[] }

export interface Payment {
  id: string
  student_id: string
  amount: number
  method: PaymentMethod
  payment_date: string
  billing_month: string
  cash_receipt?: 'issued' | 'pending' | null
  memo?: string
  created_at: string
  student?: Student
}

export type PaymentStatus = 'paid' | 'partial' | 'unpaid'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  remote: '결제선생',
  card: '카드결제',
  transfer: '계좌이체',
  cash: '현금',
  other: '기타',
}

export const CASH_RECEIPT_LABELS: Record<string, string> = {
  issued: '발행완료',
  pending: '미발행',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: '납부완료',
  partial: '부분납부',
  unpaid: '미납',
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, { bg: string; text: string }> = {
  paid: { bg: '#0d3320', text: '#00e676' },
  partial: { bg: '#332800', text: '#ffab00' },
  unpaid: { bg: '#3d1519', text: '#ff5252' },
}

export function getStudentFee(student: Student, cls?: Class | null): number {
  if (student.custom_fee != null) return student.custom_fee
  return cls?.monthly_fee ?? 0
}

export function getPaymentStatus(totalPaid: number, fee: number): PaymentStatus {
  if (fee <= 0) return 'paid'
  if (totalPaid >= fee) return 'paid'
  if (totalPaid > 0) return 'partial'
  return 'unpaid'
}

/** 특정 기간 내 지정 요일의 수업 횟수를 센다 (startDate 포함, endDate 미포함) */
export function countClassDays(startDate: Date, endDate: Date, days: number[]): number {
  let count = 0
  const d = new Date(startDate)
  while (d < endDate) {
    if (days.includes(d.getDay())) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

/** class_days 문자열 "3,5" → 숫자 배열 [3,5] 파싱 */
export function parseClassDays(classDays: string | null | undefined): number[] | null {
  if (!classDays || !classDays.trim()) return null
  return classDays.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
}

export const DAY_LABELS: Record<number, string> = {
  0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토',
}

export function calcRefund(
  fee: number,
  enrollmentDate: Date,
  withdrawalDate: Date,
  classDays?: string | null
): {
  totalSessions: number
  elapsedSessions: number
  remainingSessions: number
  refundAmount: number
  isSessionBased: boolean
} {
  // 현재 기간 시작일 계산: enrollment_date와 같은 일자의 가장 최근 날짜
  const today = withdrawalDate
  const startDay = enrollmentDate.getDate()
  const currentPeriodStart = new Date(today.getFullYear(), today.getMonth(), startDay)
  if (currentPeriodStart > today) {
    currentPeriodStart.setMonth(currentPeriodStart.getMonth() - 1)
  }

  const currentPeriodEnd = new Date(currentPeriodStart)
  currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1)

  const days = parseClassDays(classDays)

  if (days && days.length > 0) {
    // 수업 횟수 기반 계산
    const totalSessions = countClassDays(currentPeriodStart, currentPeriodEnd, days)
    const elapsedSessions = countClassDays(currentPeriodStart, today, days)
    const remainingSessions = Math.max(0, totalSessions - elapsedSessions)
    const refundAmount = totalSessions > 0
      ? Math.round(fee * (remainingSessions / totalSessions))
      : 0

    return { totalSessions, elapsedSessions, remainingSessions, refundAmount, isSessionBased: true }
  } else {
    // 일수 기반 fallback
    const totalDays = Math.round((currentPeriodEnd.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24))
    const elapsedDays = Math.round((today.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24))
    const remainingDays = Math.max(0, totalDays - elapsedDays)
    const refundAmount = totalDays > 0
      ? Math.round(fee * (remainingDays / totalDays))
      : 0

    return { totalSessions: totalDays, elapsedSessions: elapsedDays, remainingSessions: remainingDays, refundAmount, isSessionBased: false }
  }
}
