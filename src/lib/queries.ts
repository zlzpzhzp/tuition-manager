import { supabase } from './supabase'

interface RawGrade {
  id: string
  name: string
  order_index: number
  created_at: string
  tuition_classes?: RawClass[]
}

interface RawClass {
  id: string
  grade_id: string
  name: string
  monthly_fee: number
  subject?: string | null
  class_days?: string | null
  teacher_id?: string | null
  order_index: number
  created_at: string
  tuition_teachers?: Record<string, unknown> | null
  tuition_students?: Record<string, unknown>[]
}

/** 학년 > 반 > 학생 트리 조회 (Supabase raw) */
export async function queryGradesTree() {
  const { data, error } = await supabase
    .from('tuition_grades')
    .select('*, tuition_classes(*, tuition_teachers:teacher_id(*), tuition_students(*))')
    .order('order_index')
    .order('order_index', { referencedTable: 'tuition_classes' })
    .order('name', { referencedTable: 'tuition_classes.tuition_students' })

  return { data: data as RawGrade[] | null, error }
}

/** Supabase 응답을 프론트용 구조로 변환 (tuition_classes → classes, tuition_students → students) */
export function mapGradesTree(data: RawGrade[]) {
  return data.map(g => ({
    ...g,
    classes: (g.tuition_classes ?? []).map(c => ({
      ...c,
      teacher: c.tuition_teachers ?? null,
      students: c.tuition_students ?? [],
    })),
  }))
}

/** 특정 월의 학생별 납부 합계 맵 조회 */
export async function queryPaidMap(billingMonth: string) {
  const { data, error } = await supabase
    .from('tuition_payments')
    .select('student_id, amount')
    .eq('billing_month', billingMonth)

  if (error) return { paidMap: {} as Record<string, number>, error }

  const paidMap: Record<string, number> = {}
  for (const p of (data ?? [])) {
    paidMap[p.student_id] = (paidMap[p.student_id] ?? 0) + p.amount
  }
  return { paidMap, error: null }
}
