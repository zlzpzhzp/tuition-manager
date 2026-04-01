/** 오늘 날짜를 YYYY-MM-DD 형식으로 반환 (로컬 타임존 기준) */
export function getTodayString(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
