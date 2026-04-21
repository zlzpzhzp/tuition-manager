export const REGULAR_TUITION_MESSAGE = `안녕하세요. 디엠학원 결제링크입니다. 감사합니다😁

☀️문의 : 02-6203-7725
☀️홈페이지 : https://dminstitute.co`

export function getRegularTuitionTitle(
  subject: string | null | undefined,
  billingMonth: string,
  className?: string | null,
  electives?: string[] | null,
): string {
  const label = subject === '영어' ? '영어' : subject === '수학' ? '수학' : '학원'
  const m = parseInt(billingMonth.split('-')[1] ?? '0', 10)
  const cls = className?.trim()
  const base = cls ? `디엠${label} ${cls} ${m}월 정규원비` : `디엠${label} ${m}월 정규원비`
  const els = (electives ?? []).filter(e => e && e.trim())
  return els.length > 0 ? `${base} + ${els.join('/')}` : base
}
