'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, ChevronDown, X, Check, ArrowRightLeft, ChevronUp, LogOut, ScrollText, UserCircle } from 'lucide-react'
import type { Grade, Class, Student, Teacher } from '@/types'
import { DAY_LABELS, parseClassDays } from '@/types'
import { getActiveStudents, safeMutate, safeFetch, useGrades, revalidateGrades, useTeachers, revalidateTeachers } from '@/lib/utils'

const SUBJECT_BG_COLORS = [
  { bg: '#E8EAF0', color: '#2B3A67' },
  { bg: '#E8F5E9', color: '#2E7D32' },
  { bg: '#F3E5F5', color: '#7B1FA2' },
  { bg: '#FFF3E0', color: '#E65100' },
  { bg: '#FFEBEE', color: '#C62828' },
  { bg: '#E3F2FD', color: '#1565C0' },
]

type GradeWithClasses = import('@/types').Grade & { classes: (Class & { students?: Student[] })[] }

export default function SettingsPage() {
  const router = useRouter()
  const { data: grades = [], isLoading: loading } = useGrades<GradeWithClasses[]>()
  const { data: teachers = [] } = useTeachers<Teacher[]>()
  const [addingClassToGrade, setAddingClassToGrade] = useState<string | null>(null)
  const [newClassName, setNewClassName] = useState('')
  const [newClassFee, setNewClassFee] = useState('')
  const [newClassSubject, setNewClassSubject] = useState('')
  const [newClassDays, setNewClassDays] = useState<number[]>([])
  const [newClassTeacherId, setNewClassTeacherId] = useState('')
  const [editingClassId, setEditingClassId] = useState<string | null>(null)
  const [editClassName, setEditClassName] = useState('')
  const [editClassFee, setEditClassFee] = useState('')
  const [editClassSubject, setEditClassSubject] = useState('')
  const [editClassDays, setEditClassDays] = useState<number[]>([])
  const [editClassTeacherId, setEditClassTeacherId] = useState('')

  // 선생님 관리
  const [showTeacherManager, setShowTeacherManager] = useState(false)
  const [addingTeacher, setAddingTeacher] = useState(false)
  const [newTeacherName, setNewTeacherName] = useState('')
  const [newTeacherPhone, setNewTeacherPhone] = useState('')
  const [newTeacherSubject, setNewTeacherSubject] = useState('')
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null)
  const [editTeacherName, setEditTeacherName] = useState('')
  const [editTeacherPhone, setEditTeacherPhone] = useState('')
  const [editTeacherSubject, setEditTeacherSubject] = useState('')

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
    return SUBJECT_BG_COLORS[idx >= 0 ? idx % SUBJECT_BG_COLORS.length : 0]
  }, [existingSubjects])

  const allClasses = useMemo(() =>
    grades.flatMap(g => g.classes.map(c => ({ ...c, gradeName: g.name })))
  , [grades])

  const toggleDay = (days: number[], setDays: (d: number[]) => void, day: number) => {
    setDays(days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort())
  }

  const DayPicker = ({ days, setDays }: { days: number[]; setDays: (d: number[]) => void }) => (
    <div style={{ display: 'flex', gap: 4 }} role="group" aria-label="수업 요일 선택">
      {[1, 2, 3, 4, 5, 6].map(d => (
        <button
          key={d}
          type="button"
          onClick={() => toggleDay(days, setDays, d)}
          className="ios-tap"
          style={{
            width: 28, height: 28, borderRadius: 6, fontSize: 13, fontWeight: 600,
            background: days.includes(d) ? 'var(--accent)' : 'var(--bg-primary)',
            color: days.includes(d) ? '#fff' : 'var(--text-secondary)',
          }}
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
    setNewClassName(''); setNewClassFee(''); setNewClassSubject(''); setNewClassDays([]); setNewClassTeacherId('')
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
      teacher_id: newClassTeacherId || null,
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
      teacher_id: editClassTeacherId || null,
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

  // ─── 선생님 CRUD ───
  const addTeacher = async () => {
    if (!newTeacherName.trim()) return
    const { error } = await safeMutate('/api/teachers', 'POST', {
      name: newTeacherName.trim(),
      phone: newTeacherPhone || null,
      subject: newTeacherSubject || null,
    })
    if (error) { alert(`선생님 등록 실패: ${error}`); return }
    setAddingTeacher(false)
    setNewTeacherName(''); setNewTeacherPhone(''); setNewTeacherSubject('')
    revalidateTeachers()
  }

  const updateTeacher = async (id: string) => {
    if (!editTeacherName.trim()) return
    const { error } = await safeMutate(`/api/teachers/${id}`, 'PUT', {
      name: editTeacherName.trim(),
      phone: editTeacherPhone || null,
      subject: editTeacherSubject || null,
    })
    if (error) { alert(`선생님 수정 실패: ${error}`); return }
    setEditingTeacherId(null)
    revalidateTeachers()
  }

  const deleteTeacher = async (id: string, name: string) => {
    if (!confirm(`"${name}" 선생님을 삭제하시겠습니까?\n배정된 반에서도 해제됩니다.`)) return
    const { error } = await safeMutate(`/api/teachers/${id}`, 'DELETE')
    if (error) { alert(`선생님 삭제 실패: ${error}`); return }
    revalidateTeachers()
    fetchGrades()
  }

  const getTeacherName = (teacherId?: string | null) => {
    if (!teacherId) return null
    return teachers.find(t => t.id === teacherId)?.name ?? null
  }

  const formatFee = (fee: number) => fee.toLocaleString() + '원'

  if (loading) return (
    <div className="animate-pulse" style={{ padding: '0 16px' }}>
      <div style={{ height: 24, background: '#E5E7EB', borderRadius: 6, width: 128, marginBottom: 24 }}></div>
      {Array.from({ length: 3 }, (_, gi) => (
        <div key={gi} style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ padding: '12px 16px' }}>
            <div style={{ height: 16, background: '#E5E7EB', borderRadius: 4, width: 112 }}></div>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div>
      <div style={{ padding: '20px 16px 12px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, color: 'var(--text-primary)' }}>과목/반 설정</h1>
      </div>

      {/* 학년별 반 관리 */}
      {grades.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-tertiary)', fontSize: 15 }}>반을 추가해주세요</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          {grades.map((grade) => {
            const totalStudents = grade.classes.reduce((sum, cls) => sum + getActiveStudents(cls.students ?? []).length, 0)
            return (
              <div key={grade.id}>
                {/* 학년 헤더 */}
                <div style={{ padding: '0 16px', marginBottom: 6 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3 }}>{grade.name}</span>
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>{grade.classes.length}개 반</span>
                  <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>{totalStudents}명</span>
                </div>

                <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', margin: '0 16px', overflow: 'hidden' }}>
                  {grade.classes.length > 0 && (
                    <div>
                      {grade.classes.map((cls, clsIdx) => (
                        <div key={cls.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 56, padding: '0 16px', borderBottom: clsIdx < grade.classes.length - 1 ? '0.5px solid var(--separator)' : 'none' }}>
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
                              {teachers.length > 0 && (
                                <div className="flex items-center gap-2 pl-1">
                                  <span className="text-xs text-gray-500">선생님</span>
                                  <select value={editClassTeacherId} onChange={e => setEditClassTeacherId(e.target.value)} className="px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f] bg-white">
                                    <option value="">없음</option>
                                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}{t.subject ? ` (${t.subject})` : ''}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              {/* 순서 변경 */}
                              <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                                <button onClick={() => swapClassOrder(grade.id, clsIdx, -1)} disabled={clsIdx === 0} className="ios-tap" style={{ padding: 0, color: 'var(--text-tertiary)', opacity: clsIdx === 0 ? 0.2 : 1 }} aria-label="위로">
                                  <ChevronUp style={{ width: 14, height: 14 }} />
                                </button>
                                <button onClick={() => swapClassOrder(grade.id, clsIdx, 1)} disabled={clsIdx === grade.classes.length - 1} className="ios-tap" style={{ padding: 0, color: 'var(--text-tertiary)', opacity: clsIdx === grade.classes.length - 1 ? 0.2 : 1 }} aria-label="아래로">
                                  <ChevronDown style={{ width: 14, height: 14 }} />
                                </button>
                              </div>
                              {cls.subject && (() => {
                                const sc = getSubjectColor(cls.subject)
                                return <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, background: sc.bg, color: sc.color, fontWeight: 600, flexShrink: 0 }}>{cls.subject}</span>
                              })()}
                              <span style={{ flex: 1, fontSize: 17, fontWeight: 600, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{cls.name}</span>
                              <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>{formatFee(cls.monthly_fee)}</span>
                              <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-secondary)', flexShrink: 0 }}>{getActiveStudents(cls.students ?? []).length}명</span>
                              <button onClick={() => openTransfer(cls)} className="ios-tap" style={{ padding: 4, color: 'var(--text-secondary)' }} aria-label="학생 반이동">
                                <ArrowRightLeft style={{ width: 16, height: 16 }} />
                              </button>
                              <button onClick={() => { setEditingClassId(cls.id); setEditClassName(cls.name); setEditClassFee(String(cls.monthly_fee)); setEditClassSubject(cls.subject || ''); setEditClassDays(parseClassDays(cls.class_days) ?? []); setEditClassTeacherId(cls.teacher_id || '') }} className="ios-tap" style={{ padding: 4, color: 'var(--text-secondary)' }} aria-label="반 수정">
                                <Pencil style={{ width: 16, height: 16 }} />
                              </button>
                              <button onClick={() => deleteClass(cls.id, cls.name)} className="ios-tap" style={{ padding: 4, color: 'var(--text-secondary)' }} aria-label="반 삭제">
                                <Trash2 style={{ width: 16, height: 16 }} />
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
                      {teachers.length > 0 && (
                        <div className="flex items-center gap-2 pl-1">
                          <span className="text-xs text-gray-500">선생님</span>
                          <select value={newClassTeacherId} onChange={e => setNewClassTeacherId(e.target.value)} className="px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f] bg-white">
                            <option value="">없음</option>
                            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}{t.subject ? ` (${t.subject})` : ''}</option>)}
                          </select>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: 16 }}>
                      <button onClick={() => openClassFormForGrade(grade.id)} className="ios-tap"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 17, fontWeight: 600, color: 'var(--color-blue)' }}
                      >
                        <Plus style={{ width: 16, height: 16 }} /> 반 추가
                      </button>
                    </div>
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

      {/* 선생님 관리 */}
      <div style={{ padding: '0 16px', marginTop: 24 }}>
        <button
          onClick={() => setShowTeacherManager(!showTeacherManager)}
          className="ios-tap"
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}
        >
          <UserCircle style={{ width: 20, height: 20 }} />
          선생님 관리
          <ChevronDown style={{ width: 16, height: 16, transition: 'transform 0.2s', transform: showTeacherManager ? 'rotate(180deg)' : 'none' }} />
        </button>

        {showTeacherManager && (
          <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--card-radius)', overflow: 'hidden' }}>
            <div style={{ padding: 16 }}>
              {teachers.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {teachers.map((teacher, idx) => (
                    <div key={teacher.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, borderBottom: idx < teachers.length - 1 ? '0.5px solid var(--separator)' : 'none' }}>
                      {editingTeacherId === teacher.id ? (
                        <div className="flex-1 flex items-center gap-2">
                          <input type="text" value={editTeacherName} onChange={e => setEditTeacherName(e.target.value)} placeholder="이름" className="w-20 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" autoFocus />
                          <input type="text" value={editTeacherSubject} onChange={e => setEditTeacherSubject(e.target.value)} placeholder="담당 과목" className="w-20 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" />
                          <input type="tel" value={editTeacherPhone} onChange={e => setEditTeacherPhone(e.target.value)} placeholder="연락처" className="w-28 px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" />
                          <button onClick={() => updateTeacher(teacher.id)} className="text-green-600 shrink-0" aria-label="저장"><Check className="w-4 h-4" /></button>
                          <button onClick={() => setEditingTeacherId(null)} className="text-gray-400 shrink-0" aria-label="취소"><X className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: 17, fontWeight: 600 }}>{teacher.name}</span>
                          {teacher.subject && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{teacher.subject}</span>}
                          {teacher.phone && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{teacher.phone}</span>}
                          <span style={{ flex: 1 }} />
                          <button onClick={() => { setEditingTeacherId(teacher.id); setEditTeacherName(teacher.name); setEditTeacherPhone(teacher.phone || ''); setEditTeacherSubject(teacher.subject || '') }} className="ios-tap" style={{ padding: 4, color: 'var(--text-secondary)' }} aria-label="수정">
                            <Pencil style={{ width: 16, height: 16 }} />
                          </button>
                          <button onClick={() => deleteTeacher(teacher.id, teacher.name)} className="ios-tap" style={{ padding: 4, color: 'var(--text-secondary)' }} aria-label="삭제">
                            <Trash2 style={{ width: 16, height: 16 }} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {addingTeacher ? (
                <div className="flex items-center gap-2">
                  <input type="text" value={newTeacherName} onChange={e => setNewTeacherName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTeacher()} placeholder="이름" className="w-20 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" autoFocus />
                  <input type="text" value={newTeacherSubject} onChange={e => setNewTeacherSubject(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTeacher()} placeholder="담당 과목" className="w-20 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" />
                  <input type="tel" value={newTeacherPhone} onChange={e => setNewTeacherPhone(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTeacher()} placeholder="연락처" className="w-28 px-2 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2d6f]" />
                  <button onClick={addTeacher} className="text-green-600 shrink-0" aria-label="저장"><Check className="w-4 h-4" /></button>
                  <button onClick={() => { setAddingTeacher(false); setNewTeacherName(''); setNewTeacherPhone(''); setNewTeacherSubject('') }} className="text-gray-400 shrink-0" aria-label="취소"><X className="w-4 h-4" /></button>
                </div>
              ) : (
                <button onClick={() => setAddingTeacher(true)} className="ios-tap"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 17, fontWeight: 600, color: 'var(--color-blue)' }}
                >
                  <Plus style={{ width: 16, height: 16 }} /> 선생님 추가
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 로그 & 로그아웃 */}
      <div style={{ margin: '32px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          onClick={loadLogs}
          className="ios-tap"
          style={{
            width: '100%', height: 50, borderRadius: 12, fontSize: 17, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'var(--bg-card)', color: 'var(--text-primary)',
            border: '1px solid var(--separator)',
          }}
        >
          <ScrollText style={{ width: 16, height: 16 }} />
          변경 로그
        </button>
        <button
          onClick={async () => {
            if (!confirm('로그아웃 하시겠습니까?')) return
            await fetch('/api/auth/logout', { method: 'POST' })
            router.push('/login')
            router.refresh()
          }}
          className="ios-tap"
          style={{
            width: '100%', height: 50, borderRadius: 12, fontSize: 17, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            color: 'var(--color-red)',
            border: '1px solid rgba(255,59,48,0.3)',
          }}
        >
          <LogOut style={{ width: 16, height: 16 }} />
          로그아웃
        </button>
      </div>

      {/* 학생 반이동 모달 */}
      {transferClass && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-backdrop" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setTransferClass(null)}>
          <div className="w-full sm:max-w-md max-h-[80vh] flex flex-col animate-modal-up" style={{ background: 'var(--bg-card)', borderRadius: '16px 16px 0 0' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid var(--separator)', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700 }}>학생 반이동</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>{transferClass.name}</p>
              </div>
              <button onClick={() => setTransferClass(null)} className="ios-tap" style={{ padding: 4, color: 'var(--text-secondary)' }} aria-label="닫기">
                <X style={{ width: 20, height: 20 }} />
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
              <div style={{ padding: '12px 20px', borderTop: '0.5px solid var(--separator)', flexShrink: 0 }}>
                <button onClick={executeTransfer} disabled={transferring} className="ios-tap"
                  style={{ width: '100%', height: 50, borderRadius: 12, fontSize: 17, fontWeight: 600, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: transferring ? 0.5 : 1 }}
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-backdrop" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowLogs(false)}>
          <div className="w-full sm:max-w-lg max-h-[85vh] flex flex-col animate-modal-up" style={{ background: 'var(--bg-card)', borderRadius: '16px 16px 0 0' }} onClick={e => e.stopPropagation()}>
            {/* 핸들바 */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
              <div style={{ width: 36, height: 5, borderRadius: 2.5, background: 'var(--text-tertiary)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', flexShrink: 0 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>변경 로그</h2>
              <button onClick={() => setShowLogs(false)} className="ios-tap" style={{ padding: 4, color: 'var(--text-secondary)' }} aria-label="닫기">
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px' }}>
              {logsLoading ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 15 }}>불러오는 중...</div>
              ) : logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 15 }}>로그가 없습니다</div>
              ) : (
                <div>
                  {logs.map((log, idx) => {
                    let badgeBg: string, badgeColor: string
                    if (log.action === 'create') { badgeBg = 'var(--badge-paid-bg)'; badgeColor = 'var(--badge-paid-text)' }
                    else if (log.action === 'delete') { badgeBg = 'var(--badge-unpaid-bg)'; badgeColor = 'var(--badge-unpaid-text)' }
                    else { badgeBg = '#E3F2FD'; badgeColor = '#1565C0' }
                    const actionLabel = log.action === 'create' ? '생성' : log.action === 'delete' ? '삭제' : '수정'
                    const date = new Date(log.created_at)
                    const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
                    return (
                      <div key={log.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: idx < logs.length - 1 ? '0.5px solid var(--separator)' : 'none' }}>
                        <span style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, fontWeight: 600, flexShrink: 0, marginTop: 2, background: badgeBg, color: badgeColor }}>{actionLabel}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 15, fontWeight: 400, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{log.summary}</p>
                          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{timeStr}</p>
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
