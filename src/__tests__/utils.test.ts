import { describe, it, expect } from 'vitest'
import {
  getPaymentDueDay,
  getPrevMonth,
  formatMonth,
  getCurrentMonth,
  getUnpaidLabelText,
  encodePaymentMethod,
  decodePaymentMemo,
} from '@/lib/utils'
import type { Student } from '@/types'

const mockStudent = (enrollmentDate: string): Student => ({
  id: 'test-1',
  class_id: 'class-1',
  name: 'Test Student',
  enrollment_date: enrollmentDate,
  created_at: '2024-01-01',
})

describe('getPaymentDueDay', () => {
  it('returns the day of enrollment date', () => {
    expect(getPaymentDueDay(mockStudent('2024-01-15'))).toBe(15)
    expect(getPaymentDueDay(mockStudent('2024-03-01'))).toBe(1)
    expect(getPaymentDueDay(mockStudent('2024-12-31'))).toBe(31)
  })
})

describe('getPrevMonth', () => {
  it('returns previous month', () => {
    expect(getPrevMonth('2024-03')).toBe('2024-02')
    expect(getPrevMonth('2024-01')).toBe('2023-12')
    expect(getPrevMonth('2025-07')).toBe('2025-06')
  })
})

describe('formatMonth', () => {
  it('formats month string to Korean', () => {
    expect(formatMonth('2024-03')).toBe('2024년 3월')
    expect(formatMonth('2024-12')).toBe('2024년 12월')
    expect(formatMonth('2025-01')).toBe('2025년 1월')
  })
})

describe('getCurrentMonth', () => {
  it('returns current month in YYYY-MM format', () => {
    const result = getCurrentMonth()
    expect(result).toMatch(/^\d{4}-\d{2}$/)
  })
})

describe('encodePaymentMethod', () => {
  it('passes through normal methods', () => {
    expect(encodePaymentMethod('card', 'some memo')).toEqual({
      dbMethod: 'card',
      dbMemo: 'some memo',
    })
    expect(encodePaymentMethod('transfer', null)).toEqual({
      dbMethod: 'transfer',
      dbMemo: null,
    })
  })

  it('encodes "other" as cash with tagged memo', () => {
    expect(encodePaymentMethod('other', '서울페이')).toEqual({
      dbMethod: 'cash',
      dbMemo: '[기타:서울페이]',
    })
  })

  it('uses default when other has no memo', () => {
    expect(encodePaymentMethod('other', null)).toEqual({
      dbMethod: 'cash',
      dbMemo: '[기타:기타]',
    })
  })
})

describe('decodePaymentMemo', () => {
  it('returns null for empty input', () => {
    expect(decodePaymentMemo(null)).toEqual({ cleanMemo: null, otherMethod: null })
    expect(decodePaymentMemo(undefined)).toEqual({ cleanMemo: null, otherMethod: null })
    expect(decodePaymentMemo('')).toEqual({ cleanMemo: null, otherMethod: null })
  })

  it('decodes tagged memo', () => {
    expect(decodePaymentMemo('[기타:서울페이]')).toEqual({
      cleanMemo: null,
      otherMethod: '서울페이',
    })
  })

  it('preserves remaining memo after tag', () => {
    expect(decodePaymentMemo('[기타:서울페이]추가 메모')).toEqual({
      cleanMemo: '추가 메모',
      otherMethod: '서울페이',
    })
  })

  it('returns normal memo without tag', () => {
    expect(decodePaymentMemo('일반 메모')).toEqual({
      cleanMemo: '일반 메모',
      otherMethod: null,
    })
  })
})

describe('getUnpaidLabelText', () => {
  it('returns formatted label with scheduled for future month', () => {
    const result = getUnpaidLabelText(mockStudent('2024-01-15'), '2099-03')
    expect(result).toBe('3/15 예정')
  })

  it('respects override due day', () => {
    const result = getUnpaidLabelText(mockStudent('2024-01-15'), '2099-05', 20)
    expect(result).toBe('5/20 예정')
  })
})
