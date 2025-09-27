// src/test/EventProcessor.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import EventProcessor from '@/components/EventProcessor'
import { useEventStream } from '@/state/useEventStream'
import { useIncrementalRides } from '@/state/useIncrementalRides'

// Mock the stores
vi.mock('@/state/useEventStream', () => ({
    useEventStream: vi.fn(),
}))

vi.mock('@/state/useIncrementalRides', () => ({
    useIncrementalRides: vi.fn(),
}))

describe('EventProcessor Integration', () => {
    const mockProcessEvent = vi.fn()
    const mockProcessedEvents = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()

        // Setup default mocks
        vi.mocked(useEventStream).mockReturnValue({
            processedEvents: mockProcessedEvents,
        } as any)

        vi.mocked(useIncrementalRides).mockReturnValue({
            processEvent: mockProcessEvent,
        } as any)
    })

    it('should process events when processedEvents changes', () => {
        const mockEvents = [
            {
                train_line_ride_id: 'test-ride-123',
                event_type: 'departure',
                from_station: 'Berlin Hbf',
                to_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000,
            },
            {
                train_line_ride_id: 'test-ride-456',
                event_type: 'arrival',
                from_station: 'Hamburg Hbf',
                to_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000,
            },
        ]

        mockProcessedEvents.mockReturnValue(mockEvents)

        render(<EventProcessor />)

        // The component should call processEvent for each event
        expect(mockProcessEvent).toHaveBeenCalledTimes(2)
        expect(mockProcessEvent).toHaveBeenCalledWith(mockEvents[0])
        expect(mockProcessEvent).toHaveBeenCalledWith(mockEvents[1])
    })

    it('should not process events when processedEvents is empty', () => {
        mockProcessedEvents.mockReturnValue([])

        render(<EventProcessor />)

        expect(mockProcessEvent).not.toHaveBeenCalled()
    })

    it('should only process new events (not re-process old ones)', () => {
        const initialEvents = [
            {
                train_line_ride_id: 'test-ride-123',
                event_type: 'departure',
                from_station: 'Berlin Hbf',
                to_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000,
            },
        ]

        const additionalEvents = [
            ...initialEvents,
            {
                train_line_ride_id: 'test-ride-456',
                event_type: 'arrival',
                from_station: 'Hamburg Hbf',
                to_station: 'Hamburg Hbf',
                actual_timestamp: 1720003200000,
            },
        ]

        // First render with initial events
        mockProcessedEvents.mockReturnValue(initialEvents)
        const { rerender } = render(<EventProcessor />)

        expect(mockProcessEvent).toHaveBeenCalledTimes(1)

        // Second render with additional events
        mockProcessedEvents.mockReturnValue(additionalEvents)
        rerender(<EventProcessor />)

        // Should only process the new event, not re-process the old one
        expect(mockProcessEvent).toHaveBeenCalledTimes(2)
    })
})
