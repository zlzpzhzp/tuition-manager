'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, X, Check } from 'lucide-react'
import type { Grade, Class } from '@/types'
import { DAY_LABELS, parseClassDays } from '@/types'
import { safeFetch, safeMutate } from '@/lib/utils'

const SUBJECT_COLORS = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700', 'bg-pink-100 text-pink-700', 'bg-teal-100 text-teal-700', 'bg-yellow-100 text-yellow-700', 'bg-red-100 text-red-700']

export default function SettingsPage() {
  const [grades, setGrades] = useState<(Grade & { classes: Class[] })[]>([])
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const [newGradeName, setNewGradeName] = useState('')
  const [editingGradeId, setEditingGradeId] = useState<string | null>(null)
  const [editGradeName, setEditGradeName] = useState('')

  const [addingClassToGrade, setAddingClassToGrade] = useState<string | null>(null)
  const [newClassName, setNewClassName] = useState('')
  const [newClassFee, setNewClassFee] = useState('')
  const [newClassSubject, setNewClassSubject] = useState('')
  const [newClassDays, setNewClassDays] = useState<number[]>([])
  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [editClassName, setEditClassName] = useState('')
  const [editClassFee, setEditClassFee] = useState('')
  const [editClassSubject, setEditClassSubject] = useState('')
  const [editClassDays, setEditClassDays] = useState<number[]>([])

  const existingSubjects = useMemo(() => {
    const subjects = new Set<string>()
    grades.forEach(g => g.classes?.forEach(c => { if (c.subject) subjects.add(c.subject) }))
    return Array.from(subjects).sort()
  }, [grades])

  const getSubjectColor = useCallback((subject: string) => {
    const idx = existingSubjects.indexOf(subject)
    return SUBJECT_COLORS[idx >= 0 ? idx % SUBJECT_COLORS.length : 0]
  }, [existingSubjects])

  const toggleDay = (days: number[], setDays: (d: number[]) => void, day: number) => {
    setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort())
  }

  const DayPicker = ({ days, setDays }: { days: number[]; setDays: (d: number[]) => void }) => (
    <div className="flex gap-0.5" role="group" aria-label="수업 요일 선택">
      {[1, 2, 3, 4, 5, 6].map(d => (
        <button
          key={d}
          type="button"
          onClick={() => toggleDay(days, setDays, d)}
          className={`w-7 h-7 rounded text-xs font-medium ${
            days.includes(d) ? 'bg-[#1e2d6f] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
          aria-pressed={days.includes(d)}
          aria-label={DAY_LABELS[d]}
        >
          {DAY_LABELS[d]}
        </button>
      ))}
    </div>
  )

  const fetchGrades = useCallback(async () => {
    const { data, error } = await safeFetch<(Grade & { classes: Class[] })[]>('/api/grades')
    if (error) {
      alert(`데이터 로딩 실패: ${error}`)
      setLoading(false)
      return
    }
    setGrades(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchGrades() }, [fetchGrades])

  const toggleGrade = (id: string) => {
    setExpandedGrades(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const addGrade = async () => {
    if (!newGradeName.trim()) return
    const { error } = await safeMutate('/api/grades', 'POST', { name: newGradeName.trim() })
    if (error) { alert(`학년 추가 실패: ${error}`); return }
    setNewGradeName('')
    fetchGrades()
  }

  const updateGrade = async (id: string) => {
    if (!editGradeName.trim()) return
    const { error } = await safeMutate(`/api/grades/${id}`, 'PUT', { name: editGradeName.trim() })
    if (error) { alert(`학년 수정 실패: ${error}`); return }
    setEditingGradeId(null)
    fetchGrades()
  }

  const deleteGrade = async (id: string, name: string) => {
    if (!confirm(`"${name}" 학년을 삭제하시겠습니까?\n하위 반과 학생도 모두 삭제됩니다.`)) return
    const { error } = await safeMutate(`/api/grades/${id}`, 'DELETE')
    if (error) { alert(`학년 삭제 실패: ${error}`); return }
    fetchGrades()
  }

  const addClass = async (gradeId: string) => {
    if (!newClassName.trim()) return
    const { error } = await safeMutate('/api/classes', 'POST', {
      grade_id: gradeId,
      name: newClassName.trim(),
      monthly_fee: parseInt(newClassFee) || 0,
      subject: newClassSubject || null,
      class_days: newClassDays.length > 0 ? newClassDays.join(',') : null,
    })
    if (error) { alert(`반 추가 실패: ${error}`); return }
    setAddingClassToGrade(null)
    setNewClassName(''); setNewClassFee(''); setNewClassSubject(''); setNewClassDays([])
    fetchGrades()
  }

  const updateClass = async (id: string) => {
    if (!editClassName.trim()) return
    const { error } = await safeMutate(`/api/classes/${id}`, 'PUT', {
      name: editClassName.trim(),
      monthly_fee: parseInt(editClassFee) || 0,
      subject: editClassSubject || null,
      class_days: editClassDays.length > 0 ? editClassDays.join(',') : null,
    })
    if (error) { alert(`반 수정 실패: ${error}`); return }
    setEditingClassId(null)
    fetchGrades()
  }

  const deleteClass = async (id: string, name: string) => {
    if (!confirm(`"${name}" 반을 삭제하시겠습니까?`)) return
    const { error } = await safeMutate(`/api/classes/${id}`, 'DELETE')
    if (error) { alert(`반 삭제 실패: ${error}`); return }
    fetchGrades()
  }

  const formatFee = (fee: number) => fee.toLocaleString() + '원'

  if (loading) return (
    <div className="animate-pulse">
      <div className="h-6 bg-gray-200 rounded w-32 mb-6"></div>
      <div className="flex gap-2 mb-6">
        <div className="flex-1 h-10 bg-gray-100 rounded-lg"></div>
        <div className="h-10 bg-gray-200 rounded-lg w-28"></div>
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, gi) => (
          <div key={gi} className="bg-white rounded-xl border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="w-5 h-5 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-28 flex-1"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">학년/반 설정</h1>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={newGradeName}
          onChange={e => setNewGradeName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addGrade()}
          placeholder="새 학년 이름 (예: 초등 3학년)"
          className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
          aria-label="새 학년 이름"
        />
        <button
          onClick={addGrade}
          className="px-4 py-2 bg-[#1e2d6f] text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> 학년 추가
        </button>
      </div>

      {grades.length === 0 ? (
        <div className="text-center py-12 text-gray-400">학년을 추가해주세요</div>
      ) : (
        <div className="space-y-3">
          {grades.map(grade => (
            <div key={grade.id} className="bg-white rounded-xl border overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3">
                <button onClick={() => toggleGrade(grade.id)} className="text-gray-400" aria-label={expandedGrades.has(grade.id) ? '접기' : '펼치기'}>
                  {expandedGrades.has(grade.id) ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                </button>

                {editingGradeId === grade.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text" value={editGradeName} onChange={e => setEditGradeName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && updateGrade(grade.id)}
                      className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
                      autoFocus aria-label="학년 이름 수정"
                    />
                    <button onClick={() => updateGrade(grade.id)} className="text-green-600" aria-label="저장"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingGradeId(null)} className="text-gray-400" aria-label="취소"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 font-semibold text-sm">{grade.name}</span>
                    <span className="text-xs text-gray-400 mr-2">{grade.classes?.length ?? 0}개 반</span>
                    <button onClick={() => { setEditingGradeId(grade.id); setEditGradeName(grade.name) }} className="p-1 text-gray-400 hover:text-gray-600" aria-label="학년 수정">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteGrade(grade.id, grade.name)} className="p-1 text-gray-400 hover:text-red-500" aria-label="학년 삭제">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {expandedGrades.has(grade.id) && (
                <div className="border-t bg-gray-50 px-4 py-3">
                  {grade.classes?.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {grade.classes.map(cls => (
                        <div key={cls.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border">
                          {editingClassId === cls.id ? (
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <input type="text" list="subject-list" value={editClassSubject} onChange={e => setEditClassSubject(e.target.value)} placeholder="과목" className="w-16 px-1 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" />
                                <input type="text" value={editClassName} onChange={e => setEditClassName(e.target.value)} className="flex-1 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" placeholder="반 이름" autoFocus />
                                <input type="number" value={editClassFee} onChange={e => setEditClassFee(e.target.value)} className="w-28 px-2 py-1 border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" placeholder="원비" />
                                <span className="text-xs text-gray-400">원</span>
                                <button onClick={() => updateClass(cls.id)} className="text-green-600" aria-label="저장"><Check className="w-4 h-4" /></button>
                                <button onClick={() => setEditingClassId(null)} className="text-gray-400" aria-label="취소"><X className="w-4 h-4" /></button>
                              </div>
                              <div className="flex items-center gap-2 pl-1">
                                <span className="text-xs text-gray-500">수업 요일</span>
                                <DayPicker days={editClassDays} setDays={setEditClassDays} />
                              </div>
                            </div>
                          ) : (
                            <>
                              {cls.subject && (
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getSubjectColor(cls.subject)}`}>{cls.subject}</span>
                              )}
                              <span className="flex-1 text-sm">{cls.name}</span>
                              {cls.class_days && (
                                <span className="text-xs text-gray-400">{parseClassDays(cls.class_days)?.map(d => DAY_LABELS[d]).join('/')}</span>
                              )}
                              <span className="text-sm font-medium text-[#1e2d6f]">{formatFee(cls.monthly_fee)}</span>
                              <span className="text-xs text-gray-400 ml-1">{cls.students?.length ?? 0}명</span>
                              <button onClick={() => { setEditingClassId(cls.id); setEditClassName(cls.name); setEditClassFee(String(cls.monthly_fee)); setEditClassSubject(cls.subject || ''); setEditClassDays(parseClassDays(cls.class_days) ?? []) }} className="p-1 text-gray-400 hover:text-gray-600" aria-label="반 수정">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteClass(cls.id, cls.name)} className="p-1 text-gray-400 hover:text-red-500" aria-label="반 삭제">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {addingClassToGrade === grade.id ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input type="text" list="subject-list" value={newClassSubject} onChange={e => setNewClassSubject(e.target.value)} placeholder="과목" className="w-16 px-1 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" />
                        <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="반 이름" className="flex-1 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" autoFocus />
                        <input type="number" value={newClassFee} onChange={e => setNewClassFee(e.target.value)} placeholder="원비" className="w-28 px-2 py-1.5 border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" />
                        <span className="text-xs text-gray-400">원</span>
                        <button onClick={() => addClass(grade.id)} className="text-green-600" aria-label="저장"><Check className="w-4 h-4" /></button>
                        <button onClick={() => { setAddingClassToGrade(null); setNewClassName(''); setNewClassFee(''); setNewClassSubject(''); setNewClassDays([]) }} className="text-gray-400" aria-label="취소"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-xs text-gray-500">수업 요일</span>
                        <DayPicker days={newClassDays} setDays={setNewClassDays} />
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setAddingClassToGrade(grade.id); setExpandedGrades(prev => new Set(prev).add(grade.id)) }}
                      className="flex items-center gap-1 text-sm text-[#1e2d6f] font-medium hover:opacity-70"
                    >
                      <Plus className="w-4 h-4" /> 반 추가
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <datalist id="subject-list">
        {existingSubjects.map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  )
}
