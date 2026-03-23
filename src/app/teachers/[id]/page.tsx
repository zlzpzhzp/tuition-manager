'use client'

import { useState, useMemo, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Check } from 'lucide-react'
import type { GradeWithClasses, Payment, Teacher } from '@/types'
import { getStudentFee } from '@/types'
import { getActiveStudents, useGrades, usePayments, getCurrentMonth, formatMonth, safeFetch, safeMutate } from '@/lib/utils'
import useSWR from 'swr'

const TAX_RATE = 0.033 // 3.3%
const TEACHER_RATIO = 0.4 // 선생님 40%

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: teacherId } = use(params)
  const router = useRouter()

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)

  const { data: teacher } = useSWR<Teacher>(`/api/teachers/${teacherId}`, fetcher)
  const { data: grades = [] } = useGrades<GradeWithClasses[]>()
  const { data: payments = [] } = usePayments<Payment[]>(selectedMonth)
  const { data: bonuses = [], mutate: mutateBonuses } = useSWR<{ id: string; amount: number; memo: string | null; billing_month: string }[]>(
    `/api/teacher-bonuses?teacher_id=${teacherId}&billing_month=${selectedMonth}`, fetcher
  )

  // 보너스 추가 폼
  const [addingBonus, setAddingBonus] = useState(false)
  const [bonusAmount, setBonusAmount] = useState('')
  const [bonusMemo, setBonusMemo] = useState('')

  const navigateMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // 이 선생님의 반 + 학생 목록
  const teacherClasses = useMemo(() =>
    grades.flatMap(g =>
      g.classes.filter(c => c.teacher_id === teacherId).map(c => ({ ...c, gradeName: g.name }))
    )
  , [grades, teacherId])

  const teacherStudents = useMemo(() =>
    teacherClasses.flatMap(c =>
      getActiveStudents(c.students ?? [], selectedMonth).map(s => ({ ...s, class: c }))
    )
  , [teacherClasses, selectedMonth])

  // 납부 집계
  const paidByStudentId = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of payments) map.set(p.student_id, (map.get(p.student_id) ?? 0) + p.amount)
    return map
  }, [payments])

  const getStudentPaid = useCallback((studentId: string) =>
    paidByStudentId.get(studentId) ?? 0
  , [paidByStudentId])

  // 급여 계산
  const payroll = useMemo(() => {
    const totalFee = teacherStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
    const totalPaid = teacherStudents.reduce((sum, s) => sum + getStudentPaid(s.id), 0)
    const teacherShare = Math.round(totalPaid * TEACHER_RATIO)
    const totalBonus = bonuses.reduce((sum, b) => sum + b.amount, 0)
    const grossPay = teacherShare + totalBonus
    const tax = Math.round(grossPay * TAX_RATE)
    const netPay = grossPay - tax
    return { totalFee, totalPaid, teacherShare, totalBonus, grossPay, tax, netPay }
  }, [teacherStudents, getStudentPaid, bonuses])

  const addBonus = async () => {
    const amt = parseInt(bonusAmount)
    if (!amt || amt <= 0) return
    await safeMutate('/api/teacher-bonuses', 'POST', {
      teacher_id: teacherId,
      billing_month: selectedMonth,
      amount: amt,
      memo: bonusMemo.trim() || null,
    })
    setBonusAmount('')
    setBonusMemo('')
    setAddingBonus(false)
    mutateBonuses()
  }

  const deleteBonus = async (bonusId: string) => {
    if (!confirm('이 보너스를 삭제하시겠습니까?')) return
    await safeMutate(`/api/teacher-bonuses/${bonusId}`, 'DELETE')
    mutateBonuses()
  }

  if (!teacher) return (
    <div className="animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
      <div className="h-40 bg-gray-100 rounded-xl"></div>
    </div>
  )

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="p-1 text-gray-400 hover:text-gray-600">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">{teacher.name}</h1>
          {teacher.subject && <p className="text-xs text-gray-400">{teacher.subject}</p>}
        </div>
      </div>

      {/* 월 선택 */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-lg font-bold">{formatMonth(selectedMonth)}</span>
        <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 급여명세서 */}
      <div className="bg-white rounded-xl border p-5 mb-4">
        <h2 className="font-bold text-sm mb-4">급여명세서</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">담당 반</span>
            <span className="font-medium">{teacherClasses.length}개 ({teacherStudents.length}명)</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">총 원비</span>
            <span className="font-medium">{payroll.totalFee.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">수납액</span>
            <span className="font-medium">{payroll.totalPaid.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">선생님 배분 (40%)</span>
            <span className="font-medium text-[#1e2d6f]">{payroll.teacherShare.toLocaleString()}원</span>
          </div>

          {/* 보너스 */}
          <div className="flex justify-between items-center py-1.5 border-b">
            <span className="text-gray-400">보너스</span>
            <span className="font-medium text-green-600">+{payroll.totalBonus.toLocaleString()}원</span>
          </div>
          {bonuses.length > 0 && (
            <div className="pl-2 space-y-1 pb-1">
              {bonuses.map(b => (
                <div key={b.id} className="flex items-center justify-between text-xs text-gray-500">
                  <span>{b.memo || '보너스'}</span>
                  <div className="flex items-center gap-1">
                    <span>+{b.amount.toLocaleString()}원</span>
                    <button onClick={() => deleteBonus(b.id)} className="p-0.5 text-gray-300 hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {addingBonus ? (
            <div className="flex items-center gap-2 py-1">
              <input
                type="text"
                value={bonusMemo}
                onChange={e => setBonusMemo(e.target.value)}
                placeholder="항목명"
                className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
                autoFocus
              />
              <input
                type="number"
                value={bonusAmount}
                onChange={e => setBonusAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addBonus()}
                placeholder="금액"
                className="w-24 px-2 py-1 border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
              />
              <button onClick={addBonus} className="text-green-600"><Check className="w-4 h-4" /></button>
              <button onClick={() => setAddingBonus(false)} className="text-gray-400"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button
              onClick={() => setAddingBonus(true)}
              className="flex items-center gap-1 text-xs text-[#1e2d6f] font-medium hover:opacity-70 py-1"
            >
              <Plus className="w-3.5 h-3.5" /> 보너스 추가
            </button>
          )}

          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">세전 합계</span>
            <span className="font-bold">{payroll.grossPay.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">원천징수 (3.3%)</span>
            <span className="font-medium text-red-500">-{payroll.tax.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-2 mt-1 bg-gray-50 -mx-5 px-5 rounded-b-xl">
            <span className="font-bold">실수령액</span>
            <span className="font-bold text-lg text-[#1e2d6f]">{payroll.netPay.toLocaleString()}원</span>
          </div>
        </div>
      </div>

      {/* 담당 반 상세 */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-bold text-sm mb-3">담당 반별 수납 현황</h2>
        {teacherClasses.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">배정된 반이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {teacherClasses.map(cls => {
              const students = getActiveStudents(cls.students ?? [], selectedMonth)
              const clsFee = students.reduce((sum, s) => sum + getStudentFee(s, cls), 0)
              const clsPaid = students.reduce((sum, s) => sum + getStudentPaid(s.id), 0)
              return (
                <div key={cls.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                  <div>
                    <span className="text-sm font-medium">{cls.name}</span>
                    <span className="text-xs text-gray-400 ml-2">{students.length}명</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{clsPaid.toLocaleString()}원</p>
                    <p className="text-xs text-gray-400">/ {clsFee.toLocaleString()}원</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
