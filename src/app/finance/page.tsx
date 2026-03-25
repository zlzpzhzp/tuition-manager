'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Check, X, Lock } from 'lucide-react'
import type { Payment, GradeWithClasses, Teacher } from '@/types'
import { getStudentFee } from '@/types'
import { getActiveStudents, useGrades, usePayments, useTeachers, getCurrentMonth, formatMonth, safeMutate } from '@/lib/utils'
import useSWR from 'swr'

interface Expense {
  id: string
  billing_month: string
  category: 'fixed' | 'variable'
  name: string
  amount: number
  memo: string | null
}

const fetcher = (url: string) => fetch(url).then(r => r.json())

const FINANCE_PIN = '327575'

export default function FinancePage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem('finance_auth') === 'true') {
      setAuthenticated(true)
    }
  }, [])

  const handlePinSubmit = () => {
    if (pin === FINANCE_PIN) {
      setAuthenticated(true)
      sessionStorage.setItem('finance_auth', 'true')
      setPinError(false)
    } else {
      setPinError(true)
      setPin('')
    }
  }

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)

  const { data: grades = [] } = useGrades<GradeWithClasses[]>()
  const { data: payments = [] } = usePayments<Payment[]>(selectedMonth)
  const { data: teachers = [] } = useTeachers<Teacher[]>()
  const { data: expenses = [], mutate: mutateExpenses } = useSWR<Expense[]>(
    `/api/expenses?billing_month=${selectedMonth}`, fetcher
  )
  const { data: bonuses = [] } = useSWR<{ teacher_id: string; amount: number }[]>(
    `/api/teacher-bonuses?billing_month=${selectedMonth}`, fetcher
  )

  // 추가 폼
  const [addingCategory, setAddingCategory] = useState<'fixed' | 'variable' | null>(null)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newMemo, setNewMemo] = useState('')

  // 수정
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')

  const navigateMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  // 수입 계산
  const totalRevenue = useMemo(() =>
    payments.reduce((sum, p) => sum + p.amount, 0)
  , [payments])

  // 전체 학생 원비 합계
  const totalFee = useMemo(() =>
    grades.flatMap(g =>
      g.classes.flatMap(c =>
        getActiveStudents(c.students ?? [], selectedMonth).map(s => getStudentFee(s, c))
      )
    ).reduce((sum, fee) => sum + fee, 0)
  , [grades, selectedMonth])

  // 선생님 급여 자동 계산
  const teacherPayroll = useMemo(() => {
    const paidByStudent = new Map<string, number>()
    for (const p of payments) paidByStudent.set(p.student_id, (paidByStudent.get(p.student_id) ?? 0) + p.amount)

    return teachers.map(teacher => {
      const teacherClasses = grades.flatMap(g =>
        g.classes.filter(c => c.teacher_id === teacher.id)
      )
      const teacherStudents = teacherClasses.flatMap(c =>
        getActiveStudents(c.students ?? [], selectedMonth).map(s => ({ ...s, class: c }))
      )
      const paid = teacherStudents.reduce((sum, s) => sum + (paidByStudent.get(s.id) ?? 0), 0)
      const ratio = teacher.pay_ratio ?? 40
      const share = Math.round(paid * ratio / 100)
      const bonus = bonuses.filter(b => b.teacher_id === teacher.id).reduce((sum, b) => sum + b.amount, 0)
      const gross = share + bonus
      const tax = Math.round(gross * 0.033)
      return { teacher, share, bonus, gross, tax, net: gross - tax }
    }).filter(t => t.gross > 0)
  }, [teachers, grades, payments, bonuses, selectedMonth])

  const totalTeacherPay = useMemo(() =>
    teacherPayroll.reduce((sum, t) => sum + t.net, 0)
  , [teacherPayroll])

  const totalTeacherTax = useMemo(() =>
    teacherPayroll.reduce((sum, t) => sum + t.tax, 0)
  , [teacherPayroll])

  // 고정비 / 변동비
  const fixedExpenses = expenses.filter(e => e.category === 'fixed')
  const variableExpenses = expenses.filter(e => e.category === 'variable')
  const totalFixed = fixedExpenses.reduce((sum, e) => sum + e.amount, 0)
  const totalVariable = variableExpenses.reduce((sum, e) => sum + e.amount, 0)

  // 총 지출 & 손익
  const totalExpense = totalTeacherPay + totalTeacherTax + totalFixed + totalVariable
  const profit = totalRevenue - totalExpense

  // CRUD
  const addExpense = async () => {
    if (!newName.trim() || !addingCategory) return
    await safeMutate('/api/expenses', 'POST', {
      billing_month: selectedMonth,
      category: addingCategory,
      name: newName.trim(),
      amount: parseInt(newAmount) || 0,
      memo: newMemo.trim() || null,
    })
    setNewName(''); setNewAmount(''); setNewMemo(''); setAddingCategory(null)
    mutateExpenses()
  }

  const updateExpense = async (id: string) => {
    if (!editName.trim()) return
    await safeMutate(`/api/expenses/${id}`, 'PUT', {
      name: editName.trim(),
      amount: parseInt(editAmount) || 0,
    })
    setEditingId(null)
    mutateExpenses()
  }

  const deleteExpense = async (id: string, name: string) => {
    if (!confirm(`"${name}" 항목을 삭제하시겠습니까?`)) return
    await safeMutate(`/api/expenses/${id}`, 'DELETE')
    mutateExpenses()
  }

  const renderExpenseSection = (title: string, category: 'fixed' | 'variable', items: Expense[], total: number) => (
    <div className="bg-white rounded-xl border p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-sm">{title}</h2>
        <span className="text-sm font-medium text-gray-500">{total.toLocaleString()}원</span>
      </div>

      {items.length > 0 && (
        <div className="space-y-1 mb-3">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 py-1.5 border-b last:border-b-0">
              {editingId === item.id ? (
                <>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" autoFocus />
                  <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && updateExpense(item.id)} className="w-28 px-2 py-1 border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" />
                  <span className="text-xs text-gray-400">원</span>
                  <button onClick={() => updateExpense(item.id)} className="text-green-600"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{item.name}</span>
                  {item.memo && <span className="text-xs text-gray-400">{item.memo}</span>}
                  <span className="text-sm font-medium">{item.amount.toLocaleString()}원</span>
                  <button onClick={() => { setEditingId(item.id); setEditName(item.name); setEditAmount(String(item.amount)) }} className="p-0.5 text-gray-300 hover:text-gray-600">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => deleteExpense(item.id, item.name)} className="p-0.5 text-gray-300 hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {addingCategory === category ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="항목명" className="flex-1 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" autoFocus />
            <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExpense()} placeholder="금액" className="w-28 px-2 py-1.5 border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" />
            <span className="text-xs text-gray-400">원</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="text" value={newMemo} onChange={e => setNewMemo(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExpense()} placeholder="비고 (선택)" className="flex-1 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" />
            <button onClick={addExpense} className="text-green-600"><Check className="w-4 h-4" /></button>
            <button onClick={() => { setAddingCategory(null); setNewName(''); setNewAmount(''); setNewMemo('') }} className="text-gray-400"><X className="w-4 h-4" /></button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingCategory(category)}
          className="flex items-center gap-1 text-sm text-[#1e2d6f] font-medium hover:opacity-70"
        >
          <Plus className="w-4 h-4" /> 항목 추가
        </button>
      )}
    </div>
  )

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="bg-white rounded-xl border p-8 w-full max-w-xs text-center">
          <Lock className="w-10 h-10 text-[#1e2d6f] mx-auto mb-4" />
          <h1 className="text-lg font-bold mb-1">원장 전용</h1>
          <p className="text-sm text-gray-400 mb-6">PIN 번호를 입력하세요</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setPinError(false) }}
            onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
            placeholder="••••••"
            className={`w-full text-center text-2xl tracking-[0.5em] px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1e2d6f] ${pinError ? 'border-red-400' : ''}`}
            autoFocus
          />
          {pinError && <p className="text-xs text-red-500 mt-2">PIN이 올바르지 않습니다</p>}
          <button
            onClick={handlePinSubmit}
            className="w-full mt-4 py-2.5 rounded-lg text-white font-medium text-sm"
            style={{ backgroundColor: '#1e2d6f' }}
          >
            확인
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* 월 선택 */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold">{formatMonth(selectedMonth)} 재정</h1>
        <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-gray-100 rounded-lg">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 손익 요약 */}
      <div className="bg-white rounded-xl border p-5 mb-4">
        <h2 className="font-bold text-sm mb-3">월별 손익 요약</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">총 원비 (예정)</span>
            <span className="font-medium">{totalFee.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400 font-medium">총 수입 (수납액)</span>
            <span className="font-bold text-blue-600">{totalRevenue.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">선생님 급여 (실지급)</span>
            <span className="font-medium text-red-500">-{totalTeacherPay.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">원천징수세 (3.3%)</span>
            <span className="font-medium text-red-500">-{totalTeacherTax.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">고정비</span>
            <span className="font-medium text-red-500">-{totalFixed.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-gray-400">변동비</span>
            <span className="font-medium text-red-500">-{totalVariable.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-2 mt-1 bg-gray-50 -mx-5 px-5 rounded-b-xl">
            <span className="font-bold">순이익</span>
            <span className={`font-bold text-lg ${profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {profit >= 0 ? '+' : ''}{profit.toLocaleString()}원
            </span>
          </div>
        </div>
      </div>

      {/* 선생님 급여 자동 계산 */}
      <div className="bg-white rounded-xl border p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">선생님 급여</h2>
          <span className="text-sm font-medium text-gray-500">총 {(totalTeacherPay + totalTeacherTax).toLocaleString()}원</span>
        </div>
        {teacherPayroll.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">이번 달 선생님 급여가 없습니다</p>
        ) : (
          <div className="space-y-1">
            {teacherPayroll.map(({ teacher, share, bonus, gross, tax, net }) => (
              <div key={teacher.id} className="flex items-center justify-between py-1.5 border-b last:border-b-0">
                <div>
                  <span className="text-sm font-medium">{teacher.name}</span>
                  <span className="text-xs text-gray-400 ml-1">({teacher.pay_ratio ?? 40}%)</span>
                  {bonus > 0 && <span className="text-xs text-green-600 ml-1">+보너스 {bonus.toLocaleString()}</span>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{net.toLocaleString()}원</p>
                  <p className="text-[10px] text-gray-400">세전 {gross.toLocaleString()} / 세금 {tax.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 고정비 */}
      {renderExpenseSection('고정비', 'fixed', fixedExpenses, totalFixed)}

      {/* 변동비 */}
      {renderExpenseSection('변동비', 'variable', variableExpenses, totalVariable)}
    </div>
  )
}
