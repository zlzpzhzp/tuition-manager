'use client'

import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Pencil, Check, X, Lock } from 'lucide-react'
import { TButton } from '@/components/motion'
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

const FINANCE_PIN = '151004'

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

  const [addingCategory, setAddingCategory] = useState<'fixed' | 'variable' | null>(null)
  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newMemo, setNewMemo] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editAmount, setEditAmount] = useState('')

  const navigateMonth = (delta: number) => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const totalRevenue = useMemo(() =>
    payments.reduce((sum, p) => sum + p.amount, 0)
  , [payments])

  const totalFee = useMemo(() =>
    grades.flatMap(g =>
      g.classes.flatMap(c =>
        getActiveStudents(c.students ?? [], selectedMonth).map(s => getStudentFee(s, c))
      )
    ).reduce((sum, fee) => sum + fee, 0)
  , [grades, selectedMonth])

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

  const fixedExpenses = expenses.filter(e => e.category === 'fixed')
  const variableExpenses = expenses.filter(e => e.category === 'variable')
  const totalFixed = fixedExpenses.reduce((sum, e) => sum + e.amount, 0)
  const totalVariable = variableExpenses.reduce((sum, e) => sum + e.amount, 0)

  const totalExpense = totalTeacherPay + totalTeacherTax + totalFixed + totalVariable
  const profit = totalRevenue - totalExpense

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
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-[15px]">{title}</h2>
        <span className="text-sm font-semibold text-[var(--text-4)] tabular-nums">{total.toLocaleString()}원</span>
      </div>

      {items.length > 0 && (
        <div className="space-y-0 mb-3">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-2 py-2.5 border-b border-[var(--border)] last:border-b-0">
              {editingId === item.id ? (
                <>
                  <input type="text" value={editName} onChange={e => setEditName(e.target.value)} className="flex-1 px-2.5 py-1.5 bg-[var(--bg-card-hover)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:bg-[var(--bg-card)]" autoFocus />
                  <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && updateExpense(item.id)} className="w-28 px-2.5 py-1.5 bg-[var(--bg-card-hover)] border border-[var(--border)] rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:bg-[var(--bg-card)]" />
                  <span className="text-xs text-[var(--text-4)]">원</span>
                  <TButton onClick={() => updateExpense(item.id)} className="p-1.5 bg-[var(--blue-bg)] hover:bg-[var(--blue-dim)] text-[var(--blue)] rounded-full transition-colors"><Check className="w-3.5 h-3.5" strokeWidth={3} /></TButton>
                  <TButton onClick={() => setEditingId(null)} className="p-1.5 text-[var(--text-4)] hover:bg-[var(--bg-elevated)] rounded-lg"><X className="w-4 h-4" /></TButton>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{item.name}</span>
                  {item.memo && <span className="text-xs text-[var(--text-4)]">{item.memo}</span>}
                  <span className="text-sm font-semibold tabular-nums">{item.amount.toLocaleString()}원</span>
                  <TButton onClick={() => { setEditingId(item.id); setEditName(item.name); setEditAmount(String(item.amount)) }} className="p-2 -m-1 text-[var(--text-4)] hover:text-[var(--text-3)] transition-colors">
                    <Pencil className="w-4 h-4" />
                  </TButton>
                  <TButton onClick={() => deleteExpense(item.id, item.name)} className="p-2 -m-1 text-[var(--text-4)] hover:text-[var(--unpaid-text)] transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </TButton>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {addingCategory === category ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="항목명" className="flex-1 px-2.5 py-1.5 bg-[var(--bg-card-hover)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:bg-[var(--bg-card)]" autoFocus />
            <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExpense()} placeholder="금액" className="w-28 px-2.5 py-1.5 bg-[var(--bg-card-hover)] border border-[var(--border)] rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:bg-[var(--bg-card)]" />
            <span className="text-xs text-[var(--text-4)]">원</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="text" value={newMemo} onChange={e => setNewMemo(e.target.value)} onKeyDown={e => e.key === 'Enter' && addExpense()} placeholder="비고 (선택)" className="flex-1 px-2.5 py-1.5 bg-[var(--bg-card-hover)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:bg-[var(--bg-card)]" />
            <TButton onClick={addExpense} className="p-1.5 bg-[var(--blue-bg)] hover:bg-[var(--blue-dim)] text-[var(--blue)] rounded-full transition-colors"><Check className="w-3.5 h-3.5" strokeWidth={3} /></TButton>
            <TButton onClick={() => { setAddingCategory(null); setNewName(''); setNewAmount(''); setNewMemo('') }} className="p-1.5 text-[var(--text-4)] hover:bg-[var(--bg-elevated)] rounded-lg"><X className="w-4 h-4" /></TButton>
          </div>
        </div>
      ) : (
        <TButton
          onClick={() => setAddingCategory(category)}
          className="flex items-center gap-1 text-sm text-[var(--blue)] font-semibold hover:opacity-70 transition-opacity"
        >
          <Plus className="w-4 h-4" /> 항목 추가
        </TButton>
      )}
    </div>
  )

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="card-elevated p-8 w-full max-w-xs text-center">
          <div className="w-14 h-14 bg-gradient-to-br from-[#3182f6] to-[#1b64da] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-[#3182f6]/20">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold mb-1">원장 전용</h1>
          <p className="text-sm text-[var(--text-4)] mb-6">PIN 번호를 입력하세요</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={e => {
              const val = e.target.value.replace(/\D/g, '')
              setPin(val)
              setPinError(false)
              if (val.length === 6) {
                if (val === FINANCE_PIN) {
                  setAuthenticated(true)
                  sessionStorage.setItem('finance_auth', 'true')
                } else {
                  setPinError(true)
                  setTimeout(() => setPin(''), 300)
                }
              }
            }}
            onKeyDown={e => e.key === 'Enter' && handlePinSubmit()}
            placeholder="••••••"
            className={`w-full text-center text-2xl tracking-[0.5em] px-4 py-3.5 bg-[var(--bg-card-hover)] border rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--blue)] focus:bg-[var(--bg-card)] transition-all ${pinError ? 'border-[var(--unpaid-text)] bg-[var(--unpaid-bg)]' : 'border-[var(--border)]'}`}
            autoFocus
          />
          {pinError && <p className="text-xs text-[var(--unpaid-text)] mt-2">PIN이 올바르지 않습니다</p>}
          <TButton
            onClick={handlePinSubmit}
            className="w-full mt-4 py-3 rounded-xl text-white font-semibold text-sm bg-[var(--blue)] hover:opacity-90 transition-opacity active:scale-[0.98]"
          >
            확인
          </TButton>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 월 선택 */}
      <div className="flex items-center justify-center gap-4 mb-2">
        <TButton onClick={() => navigateMonth(-1)} className="p-2 hover:bg-[var(--bg-elevated)] rounded-xl transition-colors">
          <ChevronLeft className="w-5 h-5 text-[var(--text-3)]" />
        </TButton>
        <h1 className="text-lg font-bold tracking-tight">{formatMonth(selectedMonth)} 재정</h1>
        <TButton onClick={() => navigateMonth(1)} className="p-2 hover:bg-[var(--bg-elevated)] rounded-xl transition-colors">
          <ChevronRight className="w-5 h-5 text-[var(--text-3)]" />
        </TButton>
      </div>

      {/* 손익 요약 */}
      <div className="card overflow-hidden">
        <div className="p-5 pb-0">
          <h2 className="font-bold text-[15px] mb-3">월별 손익 요약</h2>
          <div className="space-y-0 text-sm">
            <div className="flex justify-between py-2.5 border-b border-[var(--border)]">
              <span className="text-[var(--text-4)]">총 원비 (예정)</span>
              <span className="font-medium tabular-nums">{totalFee.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between py-2.5 border-b border-[var(--border)]">
              <span className="text-[var(--text-3)] font-medium">총 수입 (수납액)</span>
              <span className="font-bold text-[var(--blue)] tabular-nums">{totalRevenue.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between py-2.5 border-b border-[var(--border)]">
              <span className="text-[var(--text-4)]">선생님 급여 (실지급)</span>
              <span className="font-medium text-[var(--unpaid-text)] tabular-nums">-{totalTeacherPay.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between py-2.5 border-b border-[var(--border)]">
              <span className="text-[var(--text-4)]">원천징수세 (3.3%)</span>
              <span className="font-medium text-[var(--unpaid-text)] tabular-nums">-{totalTeacherTax.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between py-2.5 border-b border-[var(--border)]">
              <span className="text-[var(--text-4)]">고정비</span>
              <span className="font-medium text-[var(--unpaid-text)] tabular-nums">-{totalFixed.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between py-2.5">
              <span className="text-[var(--text-4)]">변동비</span>
              <span className="font-medium text-[var(--unpaid-text)] tabular-nums">-{totalVariable.toLocaleString()}원</span>
            </div>
          </div>
        </div>
        <div className={`flex justify-between items-center py-4 px-5 mt-2 ${profit >= 0 ? 'bg-[var(--blue-bg)]' : 'bg-[var(--red-dim)]'}`}>
          <span className="font-bold text-sm">순이익</span>
          <span className={`font-bold text-xl tabular-nums ${profit >= 0 ? 'text-[var(--blue)]' : 'text-[var(--unpaid-text)]'}`}>
            {profit >= 0 ? '+' : ''}{profit.toLocaleString()}원
          </span>
        </div>
      </div>

      {/* 선생님 급여 자동 계산 */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[15px]">선생님 급여</h2>
          <span className="text-sm font-semibold text-[var(--text-4)] tabular-nums">총 {(totalTeacherPay + totalTeacherTax).toLocaleString()}원</span>
        </div>
        {teacherPayroll.length === 0 ? (
          <p className="text-sm text-[var(--text-4)] text-center py-3">이번 달 선생님 급여가 없습니다</p>
        ) : (
          <div className="space-y-0">
            {teacherPayroll.map(({ teacher, bonus, gross, tax, net }) => (
              <div key={teacher.id} className="flex items-center justify-between py-2.5 border-b border-[var(--border)] last:border-b-0">
                <div>
                  <span className="text-sm font-semibold">{teacher.name}</span>
                  <span className="text-xs text-[var(--text-4)] ml-1.5">({teacher.pay_ratio ?? 40}%)</span>
                  {bonus > 0 && <span className="text-xs text-emerald-600 ml-1.5">+보너스 {bonus.toLocaleString()}</span>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{net.toLocaleString()}원</p>
                  <p className="text-[10px] text-[var(--text-4)]">세전 {gross.toLocaleString()} / 세금 {tax.toLocaleString()}</p>
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
