import { describe, it, expect } from 'vitest'
import { calcRefund } from '@/types'

describe('calcRefund', () => {
  it('should calculate day-based refund when no class days', () => {
    const enrollment = new Date(2024, 0, 15)
    const withdrawal = new Date(2024, 0, 25)
    const result = calcRefund(300000, enrollment, withdrawal)
    expect(result.isSessionBased).toBe(false)
    expect(result.totalSessions).toBeGreaterThan(0)
    expect(result.refundAmount).toBeGreaterThan(0)
    expect(result.refundAmount).toBeLessThan(300000)
  })

  it('should calculate session-based refund when class days provided', () => {
    const enrollment = new Date(2024, 0, 1)
    const withdrawal = new Date(2024, 0, 15)
    const result = calcRefund(400000, enrollment, withdrawal, '1,3,5')
    expect(result.isSessionBased).toBe(true)
    expect(result.totalSessions).toBeGreaterThan(0)
    expect(result.elapsedSessions).toBeGreaterThan(0)
    expect(result.remainingSessions).toBeGreaterThanOrEqual(0)
  })

  it('should return 0 refund when fee is 0', () => {
    const result = calcRefund(0, new Date(2024, 0, 1), new Date(2024, 0, 15))
    expect(result.refundAmount).toBe(0)
  })

  it('should return full fee when withdrawal is at period start', () => {
    const enrollment = new Date(2024, 0, 1)
    const withdrawal = new Date(2024, 0, 1)
    const result = calcRefund(300000, enrollment, withdrawal)
    expect(result.refundAmount).toBe(300000)
  })

  it('should handle null class_days', () => {
    const result = calcRefund(200000, new Date(2024, 0, 1), new Date(2024, 0, 15), null)
    expect(result.isSessionBased).toBe(false)
  })

  it('should handle empty class_days', () => {
    const result = calcRefund(200000, new Date(2024, 0, 1), new Date(2024, 0, 15), '')
    expect(result.isSessionBased).toBe(false)
  })
})
