// src/test/integration.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIncrementalRides } from '@/state/useIncrementalRides'

// Mock the sim store
vi.mock('@/state/useSimStore', () => ({
    useSimStore: {
        getState: vi.fn(() => ({ cursorTs: 1719792000000 })), // 2024-07-01T00:00:00.000Z
    },
}))

describe('Integration Test - Real Data Flow', () => {
    beforeEach(() => {
        // Reset the store before each test
        const { result } = renderHook(() => useIncrementalRides())
        act(() => {
            result.current.reset()
        })
    })

    it('Should handle the exact events from console logs', () => {
        const { result } = renderHook(() => useIncrementalRides())

        // These are the exact events from the console logs
        const events = [
            {
                train_line_ride_id: '3199623009169073885-2407010011',
                event_type: 'departure',
                from_station: 'Berlin Ostbahnhof',
                to_station: 'Berlin Hbf',
                final_destination_station: 'Basel SBB',
                actual_timestamp: 1719792000000, // 2024-07-01T00:15:00.000Z
                planned_timestamp: 1719792000000,
                is_canceled: false,
            },
            {
                train_line_ride_id: '-309830498189753415-2406301934',
                event_type: 'arrival',
                from_station: 'Essen Hbf',
                to_station: 'Duisburg Hbf',
                final_destination_station: 'Köln Hbf',
                actual_timestamp: 1719792000000, // 2024-07-01T00:16:00.000Z
                planned_timestamp: 1719792000000,
                is_canceled: false,
            },
            {
                train_line_ride_id: '-309830498189753415-2406301934',
                event_type: 'departure',
                from_station: 'Duisburg Hbf',
                to_station: 'Düsseldorf Flughafen',
                final_destination_station: 'Köln Hbf',
                actual_timestamp: 1719792000000, // Same timestamp as arrival
                planned_timestamp: 1719792000000,
                is_canceled: false,
            },
        ]

        // Process all events
        events.forEach(event => {
            act(() => {
                result.current.processEvent(event)
            })
        })

        console.log('Final rides count:', result.current.rides.size)
        console.log('All ride IDs:', Array.from(result.current.rides.keys()))

        // Should have 2 unique rides
        expect(result.current.rides.size).toBe(2)
        expect(result.current.rides.has('3199623009169073885-2407010011')).toBe(true)
        expect(result.current.rides.has('-309830498189753415-2406301934')).toBe(true)
    })

    it('Should handle events with missing station data', () => {
        const { result } = renderHook(() => useIncrementalRides())

        const eventWithMissingData = {
            train_line_ride_id: 'test-ride-123',
            event_type: 'departure',
            from_station: '', // Empty station
            to_station: 'Hamburg Hbf',
            final_destination_station: 'Hamburg Hbf',
            actual_timestamp: 1719792000000,
            planned_timestamp: 1719792000000,
            is_canceled: false,
        }

        act(() => {
            result.current.processEvent(eventWithMissingData)
        })

        // Should not create a ride with missing station data
        expect(result.current.rides.size).toBe(0)
    })

    it('Should handle events with null rideId', () => {
        const { result } = renderHook(() => useIncrementalRides())

        const eventWithNullId = {
            train_line_ride_id: null,
            event_type: 'departure',
            from_station: 'Berlin Hbf',
            to_station: 'Hamburg Hbf',
            final_destination_station: 'Hamburg Hbf',
            actual_timestamp: 1719792000000,
            planned_timestamp: 1719792000000,
            is_canceled: false,
        }

        act(() => {
            result.current.processEvent(eventWithNullId)
        })

        // Should not create a ride with null rideId
        expect(result.current.rides.size).toBe(0)
    })
})
