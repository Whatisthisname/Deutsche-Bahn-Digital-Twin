// src/test/useActiveIncrementalRides.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIncrementalRides, useActiveIncrementalRides } from '@/state/useIncrementalRides'

// Mock the sim store
const mockGetState = vi.fn(() => ({ cursorTs: 1719792000000 }))

vi.mock('@/state/useSimStore', () => ({
    useSimStore: Object.assign(
        vi.fn((selector) => {
            const state = { cursorTs: 1719792000000 }
            return selector ? selector(state) : state
        }),
        { getState: mockGetState }
    ),
}))

describe('useActiveIncrementalRides Hook', () => {
    beforeEach(() => {
        // Reset the store before each test
        const { result } = renderHook(() => useIncrementalRides())
        act(() => {
            result.current.reset()
        })
    })

    it('Should return empty array when no rides exist', () => {
        const { result } = renderHook(() => useActiveIncrementalRides())

        expect(result.current).toEqual([])
    })

    it('Should return active rides only', () => {
        const { result: storeResult } = renderHook(() => useIncrementalRides())
        const { result: activeResult } = renderHook(() => useActiveIncrementalRides())

        const mockEvent = {
            train_line_ride_id: 'test-ride-123',
            event_type: 'departure',
            from_station: 'Berlin Hbf',
            to_station: 'Hamburg Hbf',
            final_destination_station: 'Hamburg Hbf',
            actual_timestamp: 1719792000000,
            planned_timestamp: 1719792000000,
            is_canceled: false,
        }

        // Set current time to be within the ride duration
        mockGetState.mockReturnValue({ cursorTs: 1719792000000 + 1800000 }) // 30 minutes after start

        act(() => {
            storeResult.current.processEvent(mockEvent)
        })

        console.log('Total rides:', storeResult.current.rides.size)
        console.log('Active rides:', activeResult.current.length)
        console.log('Active ride details:', activeResult.current)

        expect(activeResult.current.length).toBe(1)
        expect(activeResult.current[0].rideId).toBe('test-ride-123')
        expect(activeResult.current[0].status).toBe('ACTIVE')
    })

    it('Should not return upcoming rides', () => {
        const { result: storeResult } = renderHook(() => useIncrementalRides())
        const { result: activeResult } = renderHook(() => useActiveIncrementalRides())

        const mockEvent = {
            train_line_ride_id: 'test-ride-123',
            event_type: 'departure',
            from_station: 'Berlin Hbf',
            to_station: 'Hamburg Hbf',
            final_destination_station: 'Hamburg Hbf',
            actual_timestamp: 1719792000000,
            planned_timestamp: 1719792000000,
            is_canceled: false,
        }

        // Set current time to be before the ride start
        mockGetState.mockReturnValue({ cursorTs: 1719792000000 - 3600000 }) // 1 hour before start

        act(() => {
            storeResult.current.processEvent(mockEvent)
        })

        console.log('Total rides:', storeResult.current.rides.size)
        console.log('Active rides:', activeResult.current.length)

        expect(storeResult.current.rides.size).toBe(1)
        expect(activeResult.current.length).toBe(0) // Should not return upcoming rides
    })

    it('Should not return finished rides', () => {
        const { result: storeResult } = renderHook(() => useIncrementalRides())
        const { result: activeResult } = renderHook(() => useActiveIncrementalRides())

        const mockEvent = {
            train_line_ride_id: 'test-ride-123',
            event_type: 'arrival',
            from_station: 'Hamburg Hbf',
            to_station: 'Hamburg Hbf',
            final_destination_station: 'Hamburg Hbf',
            actual_timestamp: 1719792000000,
            planned_timestamp: 1719792000000,
            is_canceled: false,
        }

        act(() => {
            storeResult.current.processEvent(mockEvent)
        })

        console.log('Total rides:', storeResult.current.rides.size)
        console.log('Finished rides:', storeResult.current.finishedRides.size)
        console.log('Active rides:', activeResult.current.length)

        expect(storeResult.current.rides.size).toBe(0) // Should be moved to finished
        expect(storeResult.current.finishedRides.size).toBe(1)
        expect(activeResult.current.length).toBe(0) // Should not return finished rides
    })
})
