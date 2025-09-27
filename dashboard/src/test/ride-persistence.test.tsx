// src/test/ride-persistence.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIncrementalRides } from '@/state/useIncrementalRides'

// Mock the sim store to avoid circular dependencies
vi.mock('@/state/useSimStore', () => ({
    useSimStore: {
        getState: vi.fn(() => ({ cursorTs: 1719792000000 })), // 2024-07-01T00:00:00.000Z
    },
}))

describe('Ride Persistence Issue', () => {
    beforeEach(() => {
        // Reset the store before each test
        const { result } = renderHook(() => useIncrementalRides())
        act(() => {
            result.current.reset()
        })
    })

    it('CRITICAL: Should persist rides after creation', () => {
        const { result } = renderHook(() => useIncrementalRides())

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

        // Process the event
        act(() => {
            result.current.processEvent(mockEvent)
        })

        // Check that the ride was created
        const rides = result.current.rides
        console.log('Rides after creation:', rides.size)
        console.log('Ride details:', rides.get('test-ride-123'))

        expect(rides.size).toBe(1)
        expect(rides.has('test-ride-123')).toBe(true)

        const ride = rides.get('test-ride-123')
        expect(ride).toBeDefined()
        expect(ride?.rideId).toBe('test-ride-123')
    })

    it('CRITICAL: Should maintain ride count across multiple events', () => {
        const { result } = renderHook(() => useIncrementalRides())

        const mockEvent1 = {
            train_line_ride_id: 'test-ride-123',
            event_type: 'departure',
            from_station: 'Berlin Hbf',
            to_station: 'Hamburg Hbf',
            final_destination_station: 'Hamburg Hbf',
            actual_timestamp: 1719792000000,
            planned_timestamp: 1719792000000,
            is_canceled: false,
        }

        const mockEvent2 = {
            train_line_ride_id: 'test-ride-456',
            event_type: 'departure',
            from_station: 'Munich Hbf',
            to_station: 'Stuttgart Hbf',
            final_destination_station: 'Stuttgart Hbf',
            actual_timestamp: 1719792000000,
            planned_timestamp: 1719792000000,
            is_canceled: false,
        }

        // Process first event
        act(() => {
            result.current.processEvent(mockEvent1)
        })

        console.log('After first event:', result.current.rides.size)

        // Process second event
        act(() => {
            result.current.processEvent(mockEvent2)
        })

        console.log('After second event:', result.current.rides.size)
        console.log('All rides:', Array.from(result.current.rides.keys()))

        expect(result.current.rides.size).toBe(2)
        expect(result.current.rides.has('test-ride-123')).toBe(true)
        expect(result.current.rides.has('test-ride-456')).toBe(true)
    })

    it('CRITICAL: Should not lose rides when processing duplicate events', () => {
        const { result } = renderHook(() => useIncrementalRides())

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

        // Process the same event multiple times
        act(() => {
            result.current.processEvent(mockEvent)
        })

        console.log('After first processing:', result.current.rides.size)

        act(() => {
            result.current.processEvent(mockEvent)
        })

        console.log('After second processing:', result.current.rides.size)

        // Should still have only 1 ride, but with increased event count
        expect(result.current.rides.size).toBe(1)
        const ride = result.current.rides.get('test-ride-123')
        expect(ride?.eventCount).toBe(2)
    })
})
