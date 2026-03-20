'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, ChevronDown, X, Check, ArrowRightLeft, ChevronUp, LogOut, ScrollText } from 'lucide-react'
import type { Grade, Class, Student } from '@/types'
import { DAY_LABELS, parseClassDays } from '@/types'
import { getActiveStudents, safeMutate, safeFetch, useGrades, revalidateGrades } from '@/lib/utils'

const SUBJECT_COLORS = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700', 'bg-pink-100 text-pink-700', 'bg-teal-100 text-teal-700', 'bg-yellow-100 text-yellow-700', 'bg-red-100 text-red-700']

type GradeWithClasses = import('@/types').Grade & { classes: (Class & { students?: Student[] })[] }

export default function SettingsPage() {
  const router = useRouter()
  const { data: grades = [], isLoading: loading } = useGrades<GradeWithClasses[]>()
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

  // 감사 로그
  const [showLogs, setShowLogs] = useState(false)
  const [logs, setLogs] = useState<{ id: string; entity_type: string; action: string; summary: string; details: Record<string, unknown> | null; created_at: string }[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  const loadLogs = async () => {
    setShowLogs(true)
    setLogsLoading(true)
    const { data } = await safeFetch<typeof logs>('/api/audit-logs?limit=100')
    setLogs(data ?? [])
    setLogsLoading(false)
  }

  // 학생 반이동
  const [transferClass, setTransferClass] = useState<(Class & { students?: Student[] }) | null>(null)
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set())
  const [targetClassId, setTargetClassId] = useState<string>('')
  const [transferring, setTransferring] = useState(false)

  const existingSubjects = useMemo(() => {
    const subjects = new Set<string>()
    grades.forEach(g => g.classes?.forEach(c => { if (c.subject) subjects.add(c.subject) }))
    return Array.from(subjects).sort()
  }, [grades])

  const getSubjectColor = useCallback((subject: string) => {
    const idx = existingSubjects.indexOf(subject)
    return SUBJECT_COLORS[idx >= 0 ? idx % SUBJECT_COLORS.length : 0]
  }, [existingSubjects])

  const allClasses = useMemo(() =>
    grades.flatMap(g => g.classes.map(c => ({ ...c, gradeName: g.name })))
  , [grades])

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

  const fetchGrades = revalidateGrades

  // ─── 반 추가 폼 초기화 ───
  const resetClassForm = () => {
    setNewClassName(''); setNewClassFee(''); setNewClassSubject(''); setNewClassDays([])
  }

  const openClassFormForGrade = (gradeId: string) => {
    resetClassForm()
    setAddingClassToGrade(gradeId)
  }

  const addClass = async () => {
    if (!newClassName.trim() || !addingClassToGrade) return
    const feeValue = newClassFee.trim() ? parseInt(newClassFee) : 0
    const { error } = await safeMutate('/api/classes', 'POST', {
      grade_id: addingClassToGrade,
      name: newClassName.trim(),
      monthly_fee: isNaN(feeValue) ? 0 : feeValue,
      subject: newClassSubject || null,
      class_days: newClassDays.length > 0 ? newClassDays.join(',') : null,
    })
    if (error) { alert(`반 추가 실패: ${error}`); return }
    setAddingClassToGrade(null)
    resetClassForm()
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

  // ─── 학생 반이동 ───
  const openTransfer = (cls: Class & { students?: Student[] }) => {
    setTransferClass(cls)
    setSelectedStudents(new Set())
    setTargetClassId('')
  }

  const toggleStudentSelect = (id: string) => {
    setSelectedStudents(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAllStudents = () => {
    if (!transferClass?.students) return
    const active = getActiveStudents(transferClass.students)
    if (selectedStudents.size === active.length) {
      setSelectedStudents(new Set())
    } else {
      setSelectedStudents(new Set(active.map(s => s.id)))
    }
  }

  const executeTransfer = async () => {
    if (selectedStudents.size === 0 || !targetClassId) return
    setTransferring(true)
    const promises = Array.from(selectedStudents).map(sid =>
      safeMutate(`/api/students/${sid}`, 'PUT', { class_id: targetClassId })
    )
    const results = await Promise.all(promises)
    const failed = results.filter(r => r.error)
    if (failed.length > 0) {
      alert(`${failed.length}명 이동 실패`)
    }
    setTransferring(false)
    setTransferClass(null)
    setSelectedStudents(new Set())
    setTargetClassId('')
    fetchGrades()
  }

  const swapClassOrder = async (gradeId: string, idx: number, dir: -1 | 1) => {
    const grade = grades.find(g => g.id === gradeId)
    if (!grade) return
    const classes = grade.classes
    const targetIdx = idx + dir
    if (targetIdx < 0 || targetIdx >= classes.length) return
    const a = classes[idx]
    const b = classes[targetIdx]
    // swap order_index
    await Promise.all([
      safeMutate(`/api/classes/${a.id}`, 'PUT', { order_index: b.order_index }),
      safeMutate(`/api/classes/${b.id}`, 'PUT', { order_index: a.order_index }),
    ])
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
        {Array.from({ length: 3 }, (_, gi) => (
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
      <h1 className="text-xl font-bold mb-6">과목/반 설정</h1>

      {/* 학년별 반 관리 */}
      {grades.length === 0 ? (
        <div className="text-center py-12 text-gray-400">반을 추가해주세요</div>
      ) : (
        <div className="space-y-2 mb-6">
          {grades.map((grade) => {
            const totalStudents = grade.classes.reduce((sum, cls) => sum + getActiveStudents(cls.students ?? []).length, 0)
            return (
              <div key={grade.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3">
                  <span className="flex-1 font-semibold text-sm">{grade.name}</span>
                  <span className="text-xs text-gray-400 mr-1">{grade.classes.length}개 반</span>
                  <span className="text-xs text-gray-400">{totalStudents}명</span>
                </div>

                <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
                  {grade.classes.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {grade.classes.map((cls, clsIdx) => (
                        <div key={cls.id} className="flex items-center gap-1.5 sm:gap-2 bg-white rounded-lg px-2 sm:px-3 py-2">
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
                              {/* 순서 변경 버튼 */}
                              <div className="flex flex-col shrink-0">
                                <button
                                  onClick={() => swapClassOrder(grade.id, clsIdx, -1)}
                                  disabled={clsIdx === 0}
                                  className="p-0 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:hover:text-gray-300"
                                  aria-label="위로"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => swapClassOrder(grade.id, clsIdx, 1)}
                                  disabled={clsIdx === grade.classes.length - 1}
                                  className="p-0 text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:hover:text-gray-300"
                                  aria-label="아래로"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {cls.subject && (
                                <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full shrink-0 ${getSubjectColor(cls.subject)}`}>{cls.subject}</span>
                              )}
                              <span className="flex-1 text-xs sm:text-sm truncate min-w-0">{cls.name}</span>
                              {cls.class_days && (
                                <span className="text-[10px] sm:text-xs text-gray-400 shrink-0 hidden sm:inline">{parseClassDays(cls.class_days)?.map(d => DAY_LABELS[d]).join('/')}</span>
                              )}
                              <span className="text-xs sm:text-sm font-medium text-[#1e2d6f] shrink-0">{formatFee(cls.monthly_fee)}</span>
                              <span className="text-[10px] sm:text-xs text-gray-400 shrink-0">{getActiveStudents(cls.students ?? []).length}명</span>
                              <button onClick={() => openTransfer(cls)} className="p-0.5 sm:p-1 text-gray-400 hover:text-[#1e2d6f] shrink-0" aria-label="학생 반이동" title="학생 반이동">
                                <ArrowRightLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                              <button onClick={() => { setEditingClassId(cls.id); setEditClassName(cls.name); setEditClassFee(String(cls.monthly_fee)); setEditClassSubject(cls.subject || ''); setEditClassDays(parseClassDays(cls.class_days) ?? []) }} className="p-0.5 sm:p-1 text-gray-400 hover:text-gray-600 shrink-0" aria-label="반 수정">
                                <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                              <button onClick={() => deleteClass(cls.id, cls.name)} className="p-0.5 sm:p-1 text-gray-400 hover:text-red-500 shrink-0" aria-label="반 삭제">
                                <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
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
                        <input
                          type="text" list="subject-list" value={newClassSubject} onChange={e => setNewClassSubject(e.target.value)}
                          placeholder="과목" className="w-16 px-1 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
                        />
                        <input
                          type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addClass()}
                          placeholder="반 이름" className="flex-1 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" autoFocus
                        />
                        <input
                          type="number" value={newClassFee} onChange={e => setNewClassFee(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && addClass()}
                          placeholder="원비" className="w-28 px-2 py-1.5 border rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]"
                        />
                        <span className="text-xs text-gray-400">원</span>
                        <button onClick={() => addClass()} className="text-green-600" aria-label="저장"><Check className="w-4 h-4" /></button>
                        <button onClick={() => { setAddingClassToGrade(null); resetClassForm() }} className="text-gray-400" aria-label="취소"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="flex items-center gap-2 pl-1">
                        <span className="text-xs text-gray-500">수업 요일</span>
                        <DayPicker days={newClassDays} setDays={setNewClassDays} />
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => openClassFormForGrade(grade.id)}
                      className="flex items-center gap-1 text-sm text-[#1e2d6f] font-medium hover:opacity-70"
                    >
                      <Plus className="w-4 h-4" /> 반 추가
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <datalist id="subject-list">
        {existingSubjects.map(s => <option key={s} value={s} />)}
      </datalist>

      {/* 로그 & 로그아웃 */}
      <div className="mt-12 pt-6 border-t space-y-3">
        <button
          onClick={loadLogs}
          className="w-full py-3 text-gray-600 bg-white border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
        >
          <ScrollText className="w-4 h-4" />
          변경 로그
        </button>
        <button
          onClick={async () => {
            if (!confirm('로그아웃 하시겠습니까?')) return
            await fetch('/api/auth/logout', { method: 'POST' })
            router.push('/login')
            router.refresh()
          }}
          className="w-full py-3 text-red-500 bg-white border border-red-200 rounded-xl text-sm font-medium hover:bg-red-50 flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          로그아웃
        </button>
      </div>

      {/* 학생 반이동 모달 */}
      {transferClass && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setTransferClass(null)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
              <div>
                <h2 className="font-bold text-sm">학생 반이동</h2>
                <p className="text-xs text-gray-400 mt-0.5">{transferClass.name}</p>
              </div>
              <button onClick={() => setTransferClass(null)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="닫기">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {/* 학생 선택 */}
              {(() => {
                const activeStudents = getActiveStudents(transferClass.students ?? [])
                if (activeStudents.length === 0) return (
                  <p className="text-sm text-gray-400 text-center py-6">이 반에 학생이 없습니다</p>
                )
                return (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">{selectedStudents.size}명 선택</span>
                      <button onClick={selectAllStudents} className="text-xs text-[#1e2d6f] font-medium">
                        {selectedStudents.size === activeStudents.length ? '선택 해제' : '전체 선택'}
                      </button>
                    </div>
                    <div className="space-y-1 mb-4">
                      {activeStudents.map(s => (
                        <button
                          key={s.id}
                          onClick={() => toggleStudentSelect(s.id)}
                          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                            selectedStudents.has(s.id) ? 'bg-[#1e2d6f]/10 text-[#1e2d6f]' : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            selectedStudents.has(s.id) ? 'bg-[#1e2d6f] border-[#1e2d6f]' : 'border-gray-300'
                          }`}>
                            {selectedStudents.has(s.id) && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <span className="font-medium">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )
              })()}

              {/* 이동할 반 선택 */}
              {selectedStudents.size > 0 && (
                <div>
                  <label className="text-xs text-gray-500 mb-1.5 block font-medium">이동할 반</label>
                  <select
                    value={targetClassId}
                    onChange={e => setTargetClassId(e.target.value)}
                    className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f] bg-white"
                  >
                    <option value="">반 선택...</option>
                    {allClasses.filter(c => c.id !== transferClass.id).map(c => (
                      <option key={c.id} value={c.id}>{c.gradeName} &gt; {c.name} ({formatFee(c.monthly_fee)})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* 하단 실행 버튼 */}
            {selectedStudents.size > 0 && targetClassId && (
              <div className="px-5 py-4 border-t shrink-0">
                <button
                  onClick={executeTransfer}
                  disabled={transferring}
                  className="w-full py-2.5 bg-[#1e2d6f] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {transferring ? (
                    <>처리 중...</>
                  ) : (
                    <>
                      <ArrowRightLeft className="w-4 h-4" />
                      {selectedStudents.size}명 반이동
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 감사 로그 모달 */}
      {showLogs && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowLogs(false)}>
          <div className="bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-center justify-between shrink-0">
              <h2 className="font-bold text-sm">변경 로그</h2>
              <button onClick={() => setShowLogs(false)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="닫기">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {logsLoading ? (
                <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">로그가 없습니다</div>
              ) : (
                <div className="space-y-2">
                  {logs.map(log => {
                    const actionColor = log.action === 'create' ? 'text-green-600 bg-green-50' : log.action === 'delete' ? 'text-red-600 bg-red-50' : 'text-blue-600 bg-blue-50'
                    const actionLabel = log.action === 'create' ? '생성' : log.action === 'delete' ? '삭제' : '수정'
                    const date = new Date(log.created_at)
                    const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                    return (
                      <div key={log.id} className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5 ${actionColor}`}>{actionLabel}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 break-words">{log.summary}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{timeStr}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
