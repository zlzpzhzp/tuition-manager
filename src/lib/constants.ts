import type { PaymentMethod } from '@/types'

export const METHOD_OPTIONS: [PaymentMethod, string][] = [
  ['card', '카드결제'],
  ['transfer', '계좌이체'],
  ['cash', '현금'],
  ['payssam', '결제선생'],
  ['other', '기타'],
]

export const METHOD_OPTIONS_SHORT: [PaymentMethod, string][] = [
  ['card', '카드'],
  ['transfer', '이체'],
  ['cash', '현금'],
  ['payssam', '결선'],
  ['other', '기타'],
]

// 결제 내역 표시용 (기존 비대면 기록 포함)
export const METHOD_LABELS: Record<string, string> = {
  remote: '비대면',
  card: '카드',
  transfer: '이체',
  cash: '현금',
  payssam: '결선',
  other: '기타',
}
