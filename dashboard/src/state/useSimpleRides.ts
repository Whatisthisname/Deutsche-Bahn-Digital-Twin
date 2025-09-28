// state/useSimpleRides.ts
import { useMemo } from "react";
import { create } from "zustand";
import type { JourneyEvent } from "@/types/ride";
import { ISO_to_ms } from "@/utils/time";

/** Ride status */
export type RideStatus = "ACTIVE" | "FINISHED" | "CANCELED";

/** Simple ride data computed on-demand from JourneyEvents */
export type AggregatedJourney = {
    rideId: string; // Large integers that exceed JavaScript's safe integer range
    status: RideStatus;
    events: JourneyEvent[];
    // Computed properties
    destination: string;
    startTs: number;
    endTs: number | null;
    isCanceled: boolean;
    lastEventTime: number;
    eventCount: number;
};

/** Optimized ride computation state */
type OptimizedRideState = {
    // Cache for computed rides
    rideCache: Map<string, AggregatedJourney>; // Use string keys for large integers
    // Earliest timestamp of any ongoing ride (sliding window)
    earliestOngoingRideTs: number | null;
    // Last processed event index to avoid recomputation
    lastProcessedIndex: number;

    // Actions
    updateRideCache: (processedEvents: JourneyEvent[], currentTime: number) => void;
    getCachedRides: () => AggregatedJourney[];
    reset: () => void;
};

/**
 * Determine ride status from events
 */
const determineRideStatus = (rideEvents: JourneyEvent[]): RideStatus => {
    // .log(`🔍 determineRideStatus: Checking ${rideEvents.length} events for ride ${rideEvents[0]?.id_}`);

    // 1. CANCELED: Check for cancellation event
    const hasCancellation = rideEvents.some(e => e.event_type === "CANCELLATION");
    if (hasCancellation) {
        return "CANCELED";
    }

    // 2. FINISHED: Check for arrival at final destination
    const hasFinalArrival = rideEvents.some(e =>
        e.event_type === "ARRIVAL" &&
        e.to_station === e.final_destination_station
    );

    if (hasFinalArrival) {
        return "FINISHED";
    }

    // 3. ACTIVE: Default for ongoing rides
    // console.log(`🔍 determineRideStatus: Ride ${rideEvents[0]?.id_} is ACTIVE (no cancellation, no final arrival at ${finalDestination})`);
    return "ACTIVE";
};

/**
 * Create a SimpleRide from events
 */
const aggregatedJourney = (rideId: string, events: JourneyEvent[]): AggregatedJourney => {
    if (events.length === 0) {
        throw new Error(`No events found for ride ${rideId}`);
    }

    const status = determineRideStatus(events);
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    const startTs = ISO_to_ms(firstEvent.timestamp) ?? 0;
    const lastEventTime = ISO_to_ms(lastEvent.timestamp) ?? 0;

    // Determine end time
    let endTs: number | null = null;
    if (status === "FINISHED") {
        // Find the final destination arrival event
        const finalArrival = events.find(e =>
            e.event_type === "ARRIVAL" &&
            e.to_station === e.final_destination_station
        );
        if (finalArrival) {
            endTs = ISO_to_ms(finalArrival.timestamp) ?? null;
        }
    } else if (status === "CANCELED") {
        // Find the cancellation event
        const cancellation = events.find(e => e.event_type === "CANCELLATION");
        if (cancellation) {
            endTs = ISO_to_ms(cancellation.timestamp) ?? null;
        }
    }

    return {
        rideId,
        status,
        events,
        destination: firstEvent.final_destination_station,
        startTs,
        endTs,
        isCanceled: status === "CANCELED",
        lastEventTime,
        eventCount: events.length
    };
};

// Optimized Zustand store for ride computation
export const useOptimizedRides = create<OptimizedRideState>((set, get) => ({
    rideCache: new Map(),
    earliestOngoingRideTs: null,
    lastProcessedIndex: 0,

    updateRideCache: (processedEvents: JourneyEvent[], _currentTime: number) => {
        const state = get();
        const { rideCache, earliestOngoingRideTs, lastProcessedIndex } = state;

        // Binary search to find the start of relevant events
        const getRelevantEvents = () => {
            if (!earliestOngoingRideTs) {
                // No ongoing rides, process all events
                return processedEvents;
            }

            // Binary search for the first event at or after earliestOngoingRideTs
            let left = 0;
            let right = processedEvents.length - 1;
            let startIndex = 0;

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const eventTime = ISO_to_ms(processedEvents[mid].timestamp) ?? 0;

                if (eventTime < earliestOngoingRideTs) {
                    left = mid + 1;
                } else {
                    startIndex = mid;
                    right = mid - 1;
                }
            }

            return processedEvents.slice(startIndex);
        };

        const relevantEvents = getRelevantEvents();

        // Only process new events since last update
        const newEvents = relevantEvents.slice(Math.max(0, lastProcessedIndex - (processedEvents.length - relevantEvents.length)));
        if (newEvents.length === 0) return;

        // Group new events by ride ID
        const eventsByRide = new Map<string, JourneyEvent[]>();
        for (const event of newEvents) {
            if (!eventsByRide.has(event.id_)) {
                eventsByRide.set(event.id_, []);
            }
            eventsByRide.get(event.id_)!.push(event);
        }

        // Update cache for affected rides
        for (const [rideId, newRideEvents] of eventsByRide.entries()) {
            // console.log(`🔧 updateRideCache: Processing ride ${rideId} with ${newRideEvents.length} new events`);

            // Get existing events for this ride from cache or relevant events
            const existingRide = rideCache.get(rideId);
            let allRideEvents: JourneyEvent[];

            if (existingRide) {
                // Merge with existing events
                allRideEvents = [...existingRide.events, ...newRideEvents];
                // console.log(`🔧 updateRideCache: Ride ${rideId} had ${existingRide.events.length} existing events, now has ${allRideEvents.length} total`);
            } else {
                // Get all events for this ride from relevant events
                allRideEvents = relevantEvents.filter(e => e.id_ === rideId);
                // console.log(`🔧 updateRideCache: New ride ${rideId} with ${allRideEvents.length} total events`);
            }

            // Sort by timestamp
            allRideEvents.sort((a, b) => (ISO_to_ms(a.timestamp) ?? 0) - (ISO_to_ms(b.timestamp) ?? 0));

            // Create updated ride
            const updatedRide = aggregatedJourney(rideId, allRideEvents);
            rideCache.set(rideId, updatedRide);

            // console.log(`🔧 updateRideCache: Ride ${rideId} status: ${updatedRide.status}, destination: ${updatedRide.destination}`);
        }

        // Update earliest ongoing ride timestamp
        let newEarliestOngoingTs = earliestOngoingRideTs;
        let activeCount = 0;
        let finishedCount = 0;
        let canceledCount = 0;

        for (const ride of rideCache.values()) {
            if (ride.status === "ACTIVE") {
                activeCount++;
                if (newEarliestOngoingTs === null || ride.startTs < newEarliestOngoingTs) {
                    newEarliestOngoingTs = ride.startTs;
                }
            } else if (ride.status === "FINISHED") {
                finishedCount++;
            } else if (ride.status === "CANCELED") {
                canceledCount++;
            }
        }

        // console.log(`🔧 updateRideCache: Status summary - Active: ${activeCount}, Finished: ${finishedCount}, Canceled: ${canceledCount}, Total: ${rideCache.size}`);

        set({
            rideCache: new Map(rideCache), // Create new Map to trigger updates
            earliestOngoingRideTs: newEarliestOngoingTs,
            lastProcessedIndex: relevantEvents.length
        });
    },

    getCachedRides: () => {
        const state = get();
        return Array.from(state.rideCache.values());
    },

    reset: () => {
        set({
            rideCache: new Map(),
            earliestOngoingRideTs: null,
            lastProcessedIndex: 0
        });
    }
}));

// Optimized React hooks
export const useAllSimpleRides = (processedEvents: JourneyEvent[], currentTime: number): AggregatedJourney[] => {
    const updateRideCache = useOptimizedRides(state => state.updateRideCache);
    const getCachedRides = useOptimizedRides(state => state.getCachedRides);

    return useMemo(() => {
        // Update cache with new events
        updateRideCache(processedEvents, currentTime);

        // Return cached rides
        return getCachedRides();
    }, [processedEvents, currentTime, updateRideCache, getCachedRides]);
};

export const useActiveSimpleRides = (processedEvents: JourneyEvent[], currentTime: number): AggregatedJourney[] => {
    const allRides = useAllSimpleRides(processedEvents, currentTime);

    return useMemo(() => {
        return allRides.filter(ride => ride.status === "ACTIVE");
    }, [allRides]);
};

export const useFinishedSimpleRides = (processedEvents: JourneyEvent[], currentTime: number): AggregatedJourney[] => {
    const allRides = useAllSimpleRides(processedEvents, currentTime);

    return useMemo(() => {
        return allRides.filter(ride => ride.status === "FINISHED");
    }, [allRides]);
};

export const useCanceledSimpleRides = (processedEvents: JourneyEvent[], currentTime: number): AggregatedJourney[] => {
    const allRides = useAllSimpleRides(processedEvents, currentTime);

    return useMemo(() => {
        return allRides.filter(ride => ride.status === "CANCELED");
    }, [allRides]);
};
