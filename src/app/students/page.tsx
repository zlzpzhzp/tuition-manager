'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, ChevronDown, ChevronRight, UserCircle } from 'lucide-react'
import type { Grade, Class, Student } from '@/types'
import { getStudentFee } from '@/types'
import StudentModal from '@/components/StudentModal'
import { safeFetch, safeMutate } from '@/lib/utils'

type GradeWithClasses = Grade & { classes: (Class & { students: Student[] })[] }

export default function StudentsPage() {
  const [grades, setGrades] = useState<GradeWithClasses[]>([])
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set())
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [preselectedClassId, setPreselectedClassId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const { data, error } = await safeFetch<GradeWithClasses[]>('/api/grades')
    if (error) {
      alert(`데이터 로딩 실패: ${error}`)
      setLoading(false)
      return
    }
    const grades = data ?? []
    setGrades(grades)
    if (grades.length > 0 && expandedGrades.size === 0) {
      setExpandedGrades(new Set(grades.map((g: Grade) => g.id)))
    }
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData() }, [fetchData])

  const toggleGrade = (id: string) => {
    setExpandedGrades(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleClass = (id: string) => {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleAddStudent = (classId?: string) => {
    setEditingStudent(null)
    setPreselectedClassId(classId ?? null)
    setShowModal(true)
  }

  const handleSave = async (data: Partial<Student>) => {
    const url = editingStudent ? `/api/students/${editingStudent.id}` : '/api/students'
    const method = editingStudent ? 'PUT' : 'POST'
    const { error } = await safeMutate(url, method, data)
    if (error) {
      alert(`저장 실패: ${error}`)
      return
    }
    setShowModal(false)
    fetchData()
  }

  const totalStudents = grades.reduce(
    (sum, g) => sum + g.classes.reduce((s, c) => s + (c.students?.filter(st => !st.withdrawal_date).length ?? 0), 0),
    0
  )

  if (loading) return (
    <div className="animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-6 bg-gray-200 rounded w-24 mb-2"></div>
          <div className="h-4 bg-gray-100 rounded w-20"></div>
        </div>
        <div className="h-9 bg-gray-200 rounded-lg w-24"></div>
      </div>
      <div className="space-y-3">
        {[...Array(3)].map((_, gi) => (
          <div key={gi} className="bg-white rounded-xl border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3">
              <div className="w-5 h-5 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-24 flex-1"></div>
              <div className="h-3 bg-gray-100 rounded w-8"></div>
            </div>
            <div className="border-t">
              {[...Array(2)].map((_, ci) => (
                <div key={ci} className="border-b last:border-b-0">
                  <div className="flex items-center gap-2 px-6 py-2.5 bg-gray-50">
                    <div className="w-4 h-4 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded w-20 flex-1"></div>
                    <div className="h-3 bg-gray-200 rounded w-16"></div>
                    <div className="h-3 bg-gray-100 rounded w-8"></div>
                  </div>
                  <div className="px-6 py-2 space-y-1">
                    {[...Array(3)].map((_, si) => (
                      <div key={si} className="flex items-center gap-3 px-3 py-2">
                        <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                        <div className="flex-1">
                          <div className="h-4 bg-gray-200 rounded w-16 mb-1"></div>
                          <div className="h-3 bg-gray-100 rounded w-32"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">학생 관리</h1>
          <p className="text-sm text-gray-400 mt-1">재원생 {totalStudents}명</p>
        </div>
        <button
          onClick={() => handleAddStudent()}
          className="px-4 py-2 bg-[#1e2d6f] text-white rounded-lg text-sm font-medium flex items-center gap-1 hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> 학생 등록
        </button>
      </div>

      {grades.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          먼저 설정에서 학년/반을 추가해주세요
        </div>
      ) : (
        <div className="space-y-3">
          {grades.map(grade => (
            <div key={grade.id} className="bg-white rounded-xl border overflow-hidden">
              <button
                onClick={() => toggleGrade(grade.id)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left"
                aria-expanded={expandedGrades.has(grade.id)}
              >
                {expandedGrades.has(grade.id) ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                <span className="font-semibold text-sm flex-1">{grade.name}</span>
                <span className="text-xs text-gray-400">
                  {grade.classes.reduce((s, c) => s + (c.students?.filter(st => !st.withdrawal_date).length ?? 0), 0)}명
                </span>
              </button>

              {expandedGrades.has(grade.id) && (
                <div className="border-t">
                  {grade.classes.map(cls => {
                    const activeStudents = cls.students?.filter(s => !s.withdrawal_date) ?? []
                    return (
                      <div key={cls.id} className="border-b last:border-b-0">
                        <button
                          onClick={() => toggleClass(cls.id)}
                          className="w-full flex items-center gap-2 px-6 py-2.5 text-left bg-gray-50 hover:bg-gray-100"
                          aria-expanded={expandedClasses.has(cls.id)}
                        >
                          {expandedClasses.has(cls.id) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                          <span className="text-sm font-medium flex-1">{cls.name}</span>
                          <span className="text-xs text-[#1e2d6f] font-medium mr-2">{cls.monthly_fee.toLocaleString()}원</span>
                          <span className="text-xs text-gray-400">{activeStudents.length}명</span>
                        </button>

                        {expandedClasses.has(cls.id) && (
                          <div className="px-6 py-2">
                            {activeStudents.length > 0 ? (
                              <div className="space-y-1">
                                {activeStudents.map(student => (
                                  <Link
                                    key={student.id}
                                    href={`/students/${student.id}`}
                                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
                                  >
                                    <UserCircle className="w-8 h-8 text-gray-300" />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium">{student.name}</div>
                                      <div className="text-xs text-gray-400">
                                        등원 {student.enrollment_date} · {getStudentFee(student, cls).toLocaleString()}원
                                      </div>
                                    </div>
                                  </Link>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 py-2">등록된 학생이 없습니다</p>
                            )}
                            <button
                              onClick={() => handleAddStudent(cls.id)}
                              className="flex items-center gap-1 text-xs text-[#1e2d6f] font-medium mt-2 mb-1 hover:opacity-70"
                            >
                              <Plus className="w-3.5 h-3.5" /> 이 반에 학생 추가
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <StudentModal
          student={editingStudent}
          grades={grades}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}
