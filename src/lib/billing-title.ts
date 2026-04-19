export const REGULAR_TUITION_MESSAGE = '안녕하세요. 디엠학원 결제링크입니다. 감사합니다😁'

export function getRegularTuitionTitle(subject: string | null | undefined, billingMonth: string): string {
  const label = subject === '영어' ? '영어' : subject === '수학' ? '수학' : '학원'
  const m = parseInt(billingMonth.split('-')[1] ?? '0', 10)
  return `디엠${label} ${m}월 정규원비`
}
