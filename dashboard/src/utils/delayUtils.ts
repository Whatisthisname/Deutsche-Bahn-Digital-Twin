// utils/delayUtils.ts
// Utilities for calculating delays from journey events

import type { JourneyEvent } from '@/types/ride';

/**
 * Calculate delay between events in minutes
 * @param currentEvent The event to calculate delay for
 * @param pastEvent The previous event in the journey (null if first event)
 * @returns Delay in minutes (positive = late, negative = early, 0 = on time)
 */
export function calculateDelayMinutes(currentEvent: JourneyEvent, pastEvent: JourneyEvent | null): number {
    if (pastEvent === null) {
        return 0.0; // No previous event
    }

    const currentTime = new Date(currentEvent.timestamp).getTime();
    const pastExpectedTime = pastEvent.expected_next_event_time
        ? new Date(pastEvent.expected_next_event_time).getTime()
        : currentTime;

    return (currentTime - pastExpectedTime) / (1000 * 60); // Convert to minutes
}

/**
 * Calculate delay for a single event using its own expected_next_event_time
 * This is useful when we have expected time for the current event itself
 */
export function calculateEventDelay(event: JourneyEvent): number {
    if (!event.expected_next_event_time) {
        return 0.0; // No expected time available
    }

    const actualTime = new Date(event.timestamp).getTime();
    const expectedTime = new Date(event.expected_next_event_time).getTime();

    return (actualTime - expectedTime) / (1000 * 60); // Convert to minutes
}
