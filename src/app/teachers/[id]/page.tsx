'use client'

import { useState, useMemo, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Check, Download } from 'lucide-react'
import type { GradeWithClasses, Payment, Teacher } from '@/types'
import { getStudentFee, getPaymentStatus, PAYMENT_STATUS_LABELS, parseClassDays, countClassDays, DAY_LABELS } from '@/types'
import { getActiveStudents, useGrades, usePayments, getCurrentMonth, formatMonth, safeMutate } from '@/lib/utils'
import useSWR from 'swr'

const TAX_RATE = 0.033 // 3.3%
const DEFAULT_RATIO = 40 // 기본 40%

const fetcher = (url: string) => fetch(url).then(r => r.json())

export default function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: teacherId } = use(params)
  const router = useRouter()

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)
  const [editingRatio, setEditingRatio] = useState(false)
  const [ratioInput, setRatioInput] = useState('')

  const { data: teacher, mutate: mutateTeacher } = useSWR<Teacher>(`/api/teachers/${teacherId}`, fetcher)
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

  const payRatio = teacher?.pay_ratio ?? DEFAULT_RATIO

  // 급여 계산
  const payroll = useMemo(() => {
    const totalFee = teacherStudents.reduce((sum, s) => sum + getStudentFee(s, s.class), 0)
    const totalPaid = teacherStudents.reduce((sum, s) => sum + getStudentPaid(s.id), 0)
    const teacherShare = Math.round(totalPaid * payRatio / 100)
    const totalBonus = bonuses.reduce((sum, b) => sum + b.amount, 0)
    const grossPay = teacherShare + totalBonus
    const tax = Math.round(grossPay * TAX_RATE)
    const netPay = grossPay - tax
    return { totalFee, totalPaid, teacherShare, totalBonus, grossPay, tax, netPay }
  }, [teacherStudents, getStudentPaid, bonuses, payRatio])

  // 반별 수업시수 계산 (해당 월의 수업일수)
  const classSessionCounts = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const monthStart = new Date(y, m - 1, 1)
    const monthEnd = new Date(y, m, 1)
    const map = new Map<string, number>()
    for (const cls of teacherClasses) {
      const days = parseClassDays(cls.class_days)
      if (days && days.length > 0) {
        map.set(cls.id, countClassDays(monthStart, monthEnd, days))
      }
    }
    return map
  }, [teacherClasses, selectedMonth])

  // 학생별 상세 정보 (반별 그룹핑)
  const classDetails = useMemo(() =>
    teacherClasses.map(cls => {
      const students = getActiveStudents(cls.students ?? [], selectedMonth)
      const sessionCount = classSessionCounts.get(cls.id)
      const days = parseClassDays(cls.class_days)
      const studentDetails = students.map(s => {
        const fee = getStudentFee(s, cls)
        const paid = getStudentPaid(s.id)
        const status = getPaymentStatus(paid, fee)
        return { ...s, fee, paid, status }
      })
      const clsFee = studentDetails.reduce((sum, s) => sum + s.fee, 0)
      const clsPaid = studentDetails.reduce((sum, s) => sum + s.paid, 0)
      return { cls, students: studentDetails, sessionCount, days, clsFee, clsPaid }
    })
  , [teacherClasses, selectedMonth, classSessionCounts, getStudentPaid])

  // PDF 다운로드
  const downloadPayslipPDF = useCallback(() => {
    if (!teacher) return
    const [y, m] = selectedMonth.split('-').map(Number)
    const monthLabel = `${y}년 ${m}월`

    // HTML 기반 PDF 생성 (인쇄용)
    const statusLabel = (s: string) => s === 'paid' ? '완납' : s === 'partial' ? '부분' : '미납'
    const statusColor = (s: string) => s === 'paid' ? '#03543F' : s === 'partial' ? '#92400E' : '#9B1C1C'

    let studentRows = ''
    let rowNum = 0
    for (const cd of classDetails) {
      for (const s of cd.students) {
        rowNum++
        studentRows += `
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:6px 8px;text-align:center;font-size:12px;">${rowNum}</td>
            <td style="padding:6px 8px;font-size:12px;">${cd.cls.name}</td>
            <td style="padding:6px 8px;font-size:12px;font-weight:500;">${s.name}</td>
            <td style="padding:6px 8px;text-align:right;font-size:12px;">${s.fee.toLocaleString()}</td>
            <td style="padding:6px 8px;text-align:right;font-size:12px;">${s.paid.toLocaleString()}</td>
            <td style="padding:6px 8px;text-align:center;font-size:11px;color:${statusColor(s.status)};font-weight:600;">${s.status !== 'paid' ? statusLabel(s.status) : ''}</td>
          </tr>`
      }
    }

    let classInfoRows = ''
    for (const cd of classDetails) {
      const daysLabel = cd.days ? cd.days.map(d => DAY_LABELS[d]).join(', ') : '-'
      classInfoRows += `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:6px 8px;font-size:12px;font-weight:500;">${cd.cls.name}</td>
          <td style="padding:6px 8px;text-align:center;font-size:12px;">${cd.students.length}명</td>
          <td style="padding:6px 8px;text-align:center;font-size:12px;">${daysLabel}</td>
          <td style="padding:6px 8px;text-align:center;font-size:12px;">${cd.sessionCount ?? '-'}회</td>
          <td style="padding:6px 8px;text-align:right;font-size:12px;">${cd.clsFee.toLocaleString()}원</td>
          <td style="padding:6px 8px;text-align:right;font-size:12px;">${cd.clsPaid.toLocaleString()}원</td>
        </tr>`
    }

    let bonusRows = ''
    if (bonuses.length > 0) {
      for (const b of bonuses) {
        bonusRows += `
          <tr style="border-bottom:1px solid #e5e7eb;">
            <td style="padding:6px 8px;font-size:12px;">${b.memo || '보너스'}</td>
            <td style="padding:6px 8px;text-align:right;font-size:12px;">+${b.amount.toLocaleString()}원</td>
          </tr>`
      }
    }

    const unpaidCount = classDetails.reduce((sum, cd) => sum + cd.students.filter(s => s.status !== 'paid').length, 0)
    const paidCount = classDetails.reduce((sum, cd) => sum + cd.students.filter(s => s.status === 'paid').length, 0)

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>급여명세서 - ${teacher.name} ${monthLabel}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body { font-family: -apple-system, 'Malgun Gothic', sans-serif; color: #1a1a1a; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  .header { text-align: center; margin-bottom: 24px; border-bottom: 3px solid var(--blue); padding-bottom: 16px; }
  .header h1 { font-size: 22px; color: var(--blue); margin: 0 0 4px; }
  .header p { font-size: 13px; color: #666; margin: 0; }
  .section { margin-bottom: 20px; }
  .section h2 { font-size: 14px; font-weight: 700; color: var(--blue); margin: 0 0 8px; padding-bottom: 4px; border-bottom: 2px solid var(--blue); }
  .summary-table td { padding: 8px; font-size: 13px; }
  .summary-label { color: #666; width: 40%; }
  .summary-value { text-align: right; font-weight: 600; }
  .total-row { background: #f0f2f8; }
  .total-row td { font-weight: 700 !important; font-size: 15px !important; color: var(--blue); }
  th { background: #f3f4f6; font-size: 11px; font-weight: 600; color: #555; padding: 6px 8px; text-align: left; }
  .footer { margin-top: 32px; text-align: center; font-size: 11px; color: #999; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
</style></head><body>
<div class="header">
  <h1>급여명세서</h1>
  <p>${monthLabel} | ${teacher.name} 선생님${teacher.subject ? ' | ' + teacher.subject : ''}</p>
  <p style="font-size:11px;color:#999;margin-top:4px;">급여일: ${y}년 ${m === 12 ? y + 1 : y}년 ${m === 12 ? 1 : m + 1}월 1일</p>
</div>

<div class="section">
  <h2>수업 현황</h2>
  <table>
    <thead><tr>
      <th>반</th><th style="text-align:center;">학생수</th><th style="text-align:center;">수업요일</th>
      <th style="text-align:center;">수업시수</th><th style="text-align:right;">총 원비</th><th style="text-align:right;">수납액</th>
    </tr></thead>
    <tbody>${classInfoRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>학생별 납부 내역 (완납 ${paidCount}명 / 미납·부분 ${unpaidCount}명)</h2>
  <table>
    <thead><tr>
      <th style="text-align:center;width:30px;">No</th><th>반</th><th>이름</th>
      <th style="text-align:right;">원비</th><th style="text-align:right;">수납액</th><th style="text-align:center;">상태</th>
    </tr></thead>
    <tbody>${studentRows}</tbody>
  </table>
</div>

<div class="section">
  <h2>급여 계산</h2>
  <table class="summary-table">
    <tbody>
      <tr style="border-bottom:1px solid #e5e7eb;"><td class="summary-label">총 원비 (예정)</td><td class="summary-value">${payroll.totalFee.toLocaleString()}원</td></tr>
      <tr style="border-bottom:1px solid #e5e7eb;"><td class="summary-label">총 수납액</td><td class="summary-value">${payroll.totalPaid.toLocaleString()}원</td></tr>
      <tr style="border-bottom:1px solid #e5e7eb;"><td class="summary-label">배분 비율</td><td class="summary-value">${payRatio}%</td></tr>
      <tr style="border-bottom:1px solid #e5e7eb;"><td class="summary-label">선생님 배분액 (수납액 × ${payRatio}%)</td><td class="summary-value">${payroll.teacherShare.toLocaleString()}원</td></tr>
      ${bonusRows ? `<tr style="border-bottom:1px solid #e5e7eb;"><td class="summary-label">보너스 합계</td><td class="summary-value" style="color:#059669;">+${payroll.totalBonus.toLocaleString()}원</td></tr>` : ''}
      ${bonusRows}
      <tr style="border-bottom:1px solid #e5e7eb;"><td class="summary-label">세전 합계</td><td class="summary-value">${payroll.grossPay.toLocaleString()}원</td></tr>
      <tr style="border-bottom:1px solid #e5e7eb;"><td class="summary-label">원천징수 (3.3%)</td><td class="summary-value" style="color:#dc2626;">-${payroll.tax.toLocaleString()}원</td></tr>
      <tr class="total-row"><td style="padding:10px 8px;">실수령액</td><td style="padding:10px 8px;text-align:right;">${payroll.netPay.toLocaleString()}원</td></tr>
    </tbody>
  </table>
</div>

<div class="footer">
  <p>본 명세서는 ${monthLabel} 수업분에 대한 급여명세서입니다.</p>
</div>
</body></html>`

    // 숨겨진 iframe으로 인쇄 (페이지 이동 없음)
    let iframe = document.getElementById('payslip-print-frame') as HTMLIFrameElement | null
    if (!iframe) {
      iframe = document.createElement('iframe')
      iframe.id = 'payslip-print-frame'
      iframe.style.position = 'fixed'
      iframe.style.right = '-9999px'
      iframe.style.bottom = '-9999px'
      iframe.style.width = '0'
      iframe.style.height = '0'
      iframe.style.border = 'none'
      document.body.appendChild(iframe)
    }
    const doc = iframe.contentDocument || iframe.contentWindow?.document
    if (!doc) { alert('인쇄를 열 수 없습니다.'); return }
    doc.open()
    doc.write(html)
    doc.close()
    setTimeout(() => {
      iframe!.contentWindow?.print()
    }, 300)
  }, [selectedMonth, teacher, classDetails, bonuses, payroll, payRatio])

  const saveRatio = async () => {
    const val = parseInt(ratioInput)
    if (isNaN(val) || val < 0 || val > 100) return
    await safeMutate(`/api/teachers/${teacherId}`, 'PUT', { pay_ratio: val })
    setEditingRatio(false)
    mutateTeacher()
  }

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
      <div className="h-6 bg-[var(--bg-card-hover)] rounded w-32 mb-4"></div>
      <div className="h-40 bg-[var(--bg-elevated)] rounded-xl"></div>
    </div>
  )

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="p-1 text-[var(--text-4)] hover:text-[var(--text-3)]">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold">{teacher.name}</h1>
          {teacher.subject && <p className="text-xs text-[var(--text-4)]">{teacher.subject}</p>}
        </div>
      </div>

      {/* 월 선택 */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-[var(--bg-elevated)] rounded-lg">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-lg font-bold">{formatMonth(selectedMonth)}</span>
        <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-[var(--bg-elevated)] rounded-lg">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 급여명세서 */}
      <div className="bg-[var(--bg-card)] rounded-xl border p-5 mb-4">
        <h2 className="font-bold text-sm mb-4">급여명세서</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-[var(--text-4)]">담당 반</span>
            <span className="font-medium">{teacherClasses.length}개 ({teacherStudents.length}명)</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-[var(--text-4)]">총 원비</span>
            <span className="font-medium">{payroll.totalFee.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-[var(--text-4)]">수납액</span>
            <span className="font-medium">{payroll.totalPaid.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between items-center py-1.5 border-b">
            <div className="flex items-center gap-1">
              <span className="text-[var(--text-4)]">선생님 배분</span>
              {editingRatio ? (
                <span className="flex items-center gap-1">
                  <span className="text-[var(--text-4)]">(</span>
                  <input
                    type="number"
                    value={ratioInput}
                    onChange={e => setRatioInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveRatio()}
                    className="w-12 px-1 py-0.5 border rounded text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                    min={0} max={100} autoFocus
                  />
                  <span className="text-[var(--text-4)]">%)</span>
                  <button onClick={saveRatio} className="p-1.5 bg-[var(--blue-bg)] hover:bg-[var(--blue-dim)] text-[var(--blue)] rounded-full transition-colors"><Check className="w-3.5 h-3.5" strokeWidth={3} /></button>
                  <button onClick={() => setEditingRatio(false)} className="text-[var(--text-4)]"><X className="w-3.5 h-3.5" /></button>
                </span>
              ) : (
                <button
                  onClick={() => { setEditingRatio(true); setRatioInput(String(payRatio)) }}
                  className="text-[var(--blue)] hover:underline text-sm"
                >
                  ({payRatio}%)
                </button>
              )}
            </div>
            <span className="font-medium text-[var(--blue)]">{payroll.teacherShare.toLocaleString()}원</span>
          </div>

          {/* 보너스 */}
          <div className="flex justify-between items-center py-1.5 border-b">
            <span className="text-[var(--text-4)]">보너스</span>
            <span className="font-medium text-[var(--paid-text)]">+{payroll.totalBonus.toLocaleString()}원</span>
          </div>
          {bonuses.length > 0 && (
            <div className="pl-2 space-y-1 pb-1">
              {bonuses.map(b => (
                <div key={b.id} className="flex items-center justify-between text-xs text-[var(--text-3)]">
                  <span>{b.memo || '보너스'}</span>
                  <div className="flex items-center gap-1">
                    <span>+{b.amount.toLocaleString()}원</span>
                    <button onClick={() => deleteBonus(b.id)} className="p-0.5 text-[var(--text-4)] hover:text-[var(--unpaid-text)]">
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
                className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
                autoFocus
              />
              <input
                type="number"
                value={bonusAmount}
                onChange={e => setBonusAmount(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addBonus()}
                placeholder="금액"
                className="w-24 px-2 py-1 border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-[var(--blue)]"
              />
              <button onClick={addBonus} className="p-1.5 bg-[var(--blue-bg)] hover:bg-[var(--blue-dim)] text-[var(--blue)] rounded-full transition-colors"><Check className="w-3.5 h-3.5" strokeWidth={3} /></button>
              <button onClick={() => setAddingBonus(false)} className="text-[var(--text-4)]"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button
              onClick={() => setAddingBonus(true)}
              className="flex items-center gap-1 text-xs text-[var(--blue)] font-medium hover:opacity-70 py-1"
            >
              <Plus className="w-3.5 h-3.5" /> 보너스 추가
            </button>
          )}

          <div className="flex justify-between py-1.5 border-b">
            <span className="text-[var(--text-4)]">세전 합계</span>
            <span className="font-bold">{payroll.grossPay.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-1.5 border-b">
            <span className="text-[var(--text-4)]">원천징수 (3.3%)</span>
            <span className="font-medium text-[var(--unpaid-text)]">-{payroll.tax.toLocaleString()}원</span>
          </div>
          <div className="flex justify-between py-2 mt-1 bg-[var(--bg-card-hover)] -mx-5 px-5 rounded-b-xl">
            <span className="font-bold">실수령액</span>
            <span className="font-bold text-lg text-[var(--blue)]">{payroll.netPay.toLocaleString()}원</span>
          </div>
        </div>
      </div>

      {/* PDF 다운로드 버튼 */}
      <button
        onClick={downloadPayslipPDF}
        className="w-full py-3 mb-4 text-[var(--blue)] bg-[var(--bg-card)] border border-[var(--blue)] rounded-xl text-sm font-medium hover:bg-[#f0f2f8] flex items-center justify-center gap-2"
      >
        <Download className="w-4 h-4" />
        급여명세서 PDF 다운로드
      </button>

      {/* 반별 학생 상세 */}
      {classDetails.map(({ cls, students, sessionCount, days, clsFee, clsPaid }) => (
        <div key={cls.id} className="bg-[var(--bg-card)] rounded-xl border mb-4 overflow-hidden">
          <div className="px-4 py-3 bg-[var(--bg-card-hover)] border-b">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-bold">{cls.name}</span>
                <span className="text-xs text-[var(--text-4)] ml-2">{students.length}명</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium">{clsPaid.toLocaleString()} <span className="text-xs text-[var(--text-4)]">/ {clsFee.toLocaleString()}원</span></p>
              </div>
            </div>
            {(days || sessionCount) && (
              <div className="flex gap-3 mt-1">
                {days && (
                  <span className="text-[11px] text-[var(--text-4)]">
                    수업요일: {days.map(d => DAY_LABELS[d]).join(', ')}
                  </span>
                )}
                {sessionCount != null && (
                  <span className="text-[11px] text-[var(--text-4)]">
                    이번달 {sessionCount}회
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="divide-y">
            {students.map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{s.name}</span>
                  {s.status !== 'paid' && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{
                        backgroundColor: s.status === 'partial' ? '#FEF3C7' : '#FDE8E8',
                        color: s.status === 'partial' ? '#92400E' : '#9B1C1C',
                      }}
                    >
                      {PAYMENT_STATUS_LABELS[s.status]}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">{s.paid.toLocaleString()}</span>
                  <span className="text-xs text-[var(--text-4)]"> / {s.fee.toLocaleString()}원</span>
                </div>
              </div>
            ))}
            {students.length === 0 && (
              <p className="text-xs text-[var(--text-4)] text-center py-3">학생이 없습니다</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
