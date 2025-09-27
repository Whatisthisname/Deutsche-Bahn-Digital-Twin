// src/test/useIncrementalRides.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIncrementalRides } from '@/state/useIncrementalRides'
import { useSimStore } from '@/state/useSimStore'
import { TIME_CONSTANTS } from '@/utils/time'

// Mock the sim store
vi.mock('@/state/useSimStore', () => ({
    useSimStore: {
        getState: vi.fn(() => ({ cursorTs: 1720003200000 })), // 2024-07-01T00:00:00.000Z
    },
}))

describe('useIncrementalRides', () => {
    beforeEach(() => {
        // Reset the store before each test
        const { result } = renderHook(() => useIncrementalRides())
        act(() => {
            result.current.reset()
        })
    })

    describe('Ride Creation', () => {
        it('should create a new ride when processing first event', () => {
            const { result } = renderHook(() => useIncrementalRides())

            const mockEvent = {
                train_line_ride_id: 'test-ride-123',
                event_type: 'departure',
                from_station: 'Berlin Hbf',
                to_station: 'Hamburg Hbf',
                final_destination_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000, // 2024-07-01T00:00:00.000Z
                planned_timestamp: 1720003200000,
                is_canceled: false,
            }

            act(() => {
                result.current.processEvent(mockEvent)
            })

            const rides = result.current.rides
            expect(rides.size).toBe(1)

            const ride = rides.get('test-ride-123')
            expect(ride).toBeDefined()
            expect(ride?.rideId).toBe('test-ride-123')
            expect(ride?.destination).toBe('Hamburg Hbf')
            expect(ride?.startTs).toBe(1720003200000)
            expect(ride?.endTs).toBe(1720003200000 + TIME_CONSTANTS.DEFAULT_RIDE_DURATION_MS)
            expect(ride?.status).toBe('UPCOMING')
            expect(ride?.isCanceled).toBe(false)
        })

        it('should update existing ride when processing additional events', () => {
            const { result } = renderHook(() => useIncrementalRides())

            const mockEvent1 = {
                train_line_ride_id: 'test-ride-123',
                event_type: 'departure',
                from_station: 'Berlin Hbf',
                to_station: 'Hamburg Hbf',
                final_destination_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000,
                planned_timestamp: 1720003200000,
                is_canceled: false,
            }

            const mockEvent2 = {
                train_line_ride_id: 'test-ride-123',
                event_type: 'arrival',
                from_station: 'Hamburg Hbf',
                to_station: 'Hamburg Hbf',
                final_destination_station: 'Hamburg Hbf',
                actual_timestamp: 1720011600000, // 1 hour later
                planned_timestamp: 1720011600000,
                is_canceled: false,
            }

            act(() => {
                result.current.processEvent(mockEvent1)
                result.current.processEvent(mockEvent2)
            })

            const rides = result.current.rides
            expect(rides.size).toBe(1)

            const ride = rides.get('test-ride-123')
            expect(ride).toBeDefined()
            expect(ride?.eventCount).toBe(2)
            expect(ride?.startTs).toBe(1720003200000) // Should remain the earliest
            expect(ride?.endTs).toBe(1720011600000) // Should be updated to arrival time
        })

        it('should NOT create duplicate rides for the same rideId', () => {
            const { result } = renderHook(() => useIncrementalRides())

            const mockEvent = {
                train_line_ride_id: 'test-ride-123',
                event_type: 'departure',
                from_station: 'Berlin Hbf',
                to_station: 'Hamburg Hbf',
                final_destination_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000,
                planned_timestamp: 1720003200000,
                is_canceled: false,
            }

            act(() => {
                result.current.processEvent(mockEvent)
                result.current.processEvent(mockEvent) // Same event twice
            })

            const rides = result.current.rides
            expect(rides.size).toBe(1) // Should still be only 1 ride

            const ride = rides.get('test-ride-123')
            expect(ride?.eventCount).toBe(2) // But event count should increase
        })
    })

    describe('Ride Status Calculation', () => {
        it('should mark ride as UPCOMING when current time is before start time', () => {
            const { result } = renderHook(() => useIncrementalRides())

            const mockEvent = {
                train_line_ride_id: 'test-ride-123',
                event_type: 'departure',
                from_station: 'Berlin Hbf',
                to_station: 'Hamburg Hbf',
                final_destination_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000, // 2024-07-01T00:00:00.000Z
                planned_timestamp: 1720003200000,
                is_canceled: false,
            }

            // Mock current time to be before the ride start
            vi.mocked(useSimStore.getState).mockReturnValue({
                cursorTs: 1720003200000 - 3600000 // 1 hour before
            })

            act(() => {
                result.current.processEvent(mockEvent)
            })

            const rides = result.current.rides
            const ride = rides.get('test-ride-123')
            expect(ride?.status).toBe('UPCOMING')
        })

        it('should mark ride as ACTIVE when current time is within ride duration', () => {
            const { result } = renderHook(() => useIncrementalRides())

            const mockEvent = {
                train_line_ride_id: 'test-ride-123',
                event_type: 'departure',
                from_station: 'Berlin Hbf',
                to_station: 'Hamburg Hbf',
                final_destination_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000,
                planned_timestamp: 1720003200000,
                is_canceled: false,
            }

            // Mock current time to be within the ride duration
            vi.mocked(useSimStore.getState).mockReturnValue({
                cursorTs: 1720003200000 + 1800000 // 30 minutes after start
            })

            act(() => {
                result.current.processEvent(mockEvent)
            })

            const rides = result.current.rides
            const ride = rides.get('test-ride-123')
            expect(ride?.status).toBe('ACTIVE')
        })

        it('should mark ride as FINISHED when it arrives at destination', () => {
            const { result } = renderHook(() => useIncrementalRides())

            const mockEvent = {
                train_line_ride_id: 'test-ride-123',
                event_type: 'arrival',
                from_station: 'Hamburg Hbf',
                to_station: 'Hamburg Hbf',
                final_destination_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000,
                planned_timestamp: 1720003200000,
                is_canceled: false,
            }

            act(() => {
                result.current.processEvent(mockEvent)
            })

            const rides = result.current.rides
            const finishedRides = result.current.finishedRides

            // Ride should be moved to finished rides
            expect(rides.size).toBe(0)
            expect(finishedRides.size).toBe(1)

            const finishedRide = finishedRides.get('test-ride-123')
            expect(finishedRide?.status).toBe('FINISHED')
        })
    })

    describe('Ride Persistence', () => {
        it('should persist rides across multiple processEvent calls', () => {
            const { result } = renderHook(() => useIncrementalRides())

            const mockEvent1 = {
                train_line_ride_id: 'test-ride-123',
                event_type: 'departure',
                from_station: 'Berlin Hbf',
                to_station: 'Hamburg Hbf',
                final_destination_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000,
                planned_timestamp: 1720003200000,
                is_canceled: false,
            }

            const mockEvent2 = {
                train_line_ride_id: 'test-ride-456',
                event_type: 'departure',
                from_station: 'Munich Hbf',
                to_station: 'Stuttgart Hbf',
                final_destination_station: 'Stuttgart Hbf',
                actual_timestamp: 1720003200000,
                planned_timestamp: 1720003200000,
                is_canceled: false,
            }

            act(() => {
                result.current.processEvent(mockEvent1)
            })

            expect(result.current.rides.size).toBe(1)

            act(() => {
                result.current.processEvent(mockEvent2)
            })

            expect(result.current.rides.size).toBe(2)
            expect(result.current.rides.has('test-ride-123')).toBe(true)
            expect(result.current.rides.has('test-ride-456')).toBe(true)
        })
    })
})
