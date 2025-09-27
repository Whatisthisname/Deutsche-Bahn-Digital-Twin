// src/test/time.test.ts
import { describe, it, expect } from 'vitest'
import { toMs, coalesceTime, formatTime, TIME_CONSTANTS } from '@/utils/time'

describe('Time Utilities', () => {
    describe('toMs', () => {
        it('should convert seconds to milliseconds', () => {
            expect(toMs(1720003200)).toBe(1720003200000) // 10-digit timestamp
        })

        it('should return milliseconds as-is', () => {
            expect(toMs(1720003200000)).toBe(1720003200000) // 13-digit timestamp
        })

        it('should handle null and undefined', () => {
            expect(toMs(null)).toBeUndefined()
            expect(toMs(undefined)).toBeUndefined()
            expect(toMs('')).toBeUndefined()
        })

        it('should handle invalid numbers', () => {
            expect(toMs('invalid')).toBeUndefined()
            expect(toMs(NaN)).toBeUndefined()
            expect(toMs(Infinity)).toBeUndefined()
        })
    })

    describe('coalesceTime', () => {
        it('should return actual_timestamp if available', () => {
            const event = {
                actual_timestamp: 1720003200000,
                planned_timestamp: 1720003201000,
                ts_ms: 1720003202000,
            }
            expect(coalesceTime(event)).toBe(1720003200000)
        })

        it('should fall back to planned_timestamp if actual_timestamp is missing', () => {
            const event = {
                planned_timestamp: 1720003201000,
                ts_ms: 1720003202000,
            }
            expect(coalesceTime(event)).toBe(1720003201000)
        })

        it('should fall back to ts_ms if other timestamps are missing', () => {
            const event = {
                ts_ms: 1720003202000,
            }
            expect(coalesceTime(event)).toBe(1720003202000)
        })

        it('should return undefined if no valid timestamp is found', () => {
            const event = {}
            expect(coalesceTime(event)).toBeUndefined()
        })
    })

    describe('formatTime', () => {
        it('should format timestamp as ISO string', () => {
            // 2024-07-01T00:00:00.000Z = 1719792000000 milliseconds
            expect(formatTime(1719792000000)).toBe('2024-07-01T00:00:00.000Z')
        })
    })

    describe('TIME_CONSTANTS', () => {
        it('should have correct values', () => {
            expect(TIME_CONSTANTS.DEFAULT_RIDE_DURATION_MS).toBe(2 * 60 * 60 * 1000) // 2 hours
            expect(TIME_CONSTANTS.RIDE_BUFFER_MS).toBe(30 * 60 * 1000) // 30 minutes
            expect(TIME_CONSTANTS.POLLING_INTERVAL_MS).toBe(1000) // 1 second
            expect(TIME_CONSTANTS.TIME_INCREMENT_PER_SECOND_MS).toBe(15 * 60 * 1000) // 15 minutes
        })
    })
})
