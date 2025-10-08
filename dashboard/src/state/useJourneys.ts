// state/useSimpleRides.ts
import { useMemo } from "react";
import { create } from "zustand";
import type { ArrivalOrDepartureEvent as ArrivalOrDepartureEvent } from "@/types/ride";
import { ISO_to_ms } from "@/utils/time";
import { predictNextDelay } from "@/lib/mlPrediction";
import { useGraphStructure } from "./useGraphStructure";

/** Ride status */
export type JourneyStatus = "ACTIVE" | "FINISHED" | "CANCELED";

export type Journey = {
    rideId: string;
    status: JourneyStatus;
    events: ArrivalOrDepartureEvent[];
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
    rideCache: Map<string, Journey>;
    // Earliest timestamp of any ongoing ride (sliding window)
    earliestOngoingRideTs: number | null;
    // Last processed event index to avoid recomputation
    lastProcessedIndex: number;

    // Actions
    updateRideCache: (processedEvents: ArrivalOrDepartureEvent[], currentTime: number) => void;
    getCachedRides: () => Journey[];
    reset: () => void;
};

/**
 * Determine ride status from events
 */
const determineRideStatus = (events: ArrivalOrDepartureEvent[]): JourneyStatus => {
    // .log(`🔍 determineRideStatus: Checking ${rideEvents.length} events for ride ${rideEvents[0]?.id_}`);

    // 1. CANCELED: Check for cancellation event
    const hasCancellation = events.some(e => e.event_type === "CANCELLATION");
    if (hasCancellation) {
        return "CANCELED";
    }

    // 2. FINISHED: Check for arrival at final destination
    const hasFinalArrival = events.some(e =>
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
const journey = (rideId: string, events: ArrivalOrDepartureEvent[]): Journey => {
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
export const useAggregatedJourneysStore = create<OptimizedRideState>((set, get) => ({
    rideCache: new Map(),
    earliestOngoingRideTs: null,
    lastProcessedIndex: 0,
    updateRideCache: (processedEvents: ArrivalOrDepartureEvent[], _currentTime: number) => {
        const state = get();
        const { rideCache, earliestOngoingRideTs, lastProcessedIndex } = state;

        // Get the graph structure
        const graph = useGraphStructure.getState().graph;

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
        const eventsByRide = new Map<string, ArrivalOrDepartureEvent[]>();
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
            let allRideEvents: ArrivalOrDepartureEvent[];

            if (existingRide) {
                // Merge with existing events
                allRideEvents = [...existingRide.events, ...newRideEvents];
                // console.log(`🔧 updateRideCache: Ride ${rideId} had ${existingRide.events.length} existing events, now has ${allRideEvents.length} total`);
            } else {
                // Get all events for this ride from relevant events
                allRideEvents = relevantEvents.filter(e => e.id_ === rideId);
                // console.log(`🔧 updateRideCache: New ride ${rideId} with ${allRideEvents.length} total events`);
            }

            for (let i = 0; i < allRideEvents.length; i++) {
                const list = allRideEvents.slice(0, i+1);
                // Use the imported graph only if it is defined
                const pred = graph ? predictNextDelay(list, graph) : null;
                if (pred == undefined) {
                    throw new Error(`Prediction failed for ride ${rideId} at event index ${i}`);
                }
                if (pred?.predictedDelay == undefined) {
                   throw new Error(`Prediction returned null delay for ride ${rideId} at event index ${i}`);
                }
                allRideEvents[i].predicted_delay = pred?.predictedDelay;
            }


            // Sort by timestamp
            allRideEvents.sort((a, b) => (ISO_to_ms(a.timestamp) ?? 0) - (ISO_to_ms(b.timestamp) ?? 0));

            // Create updated ride
            const updatedRide = journey(rideId, allRideEvents);
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


export const useAllJourneys = (processedEvents: ArrivalOrDepartureEvent[], currentTime: number): Journey[] => {
    const updateRideCache = useAggregatedJourneysStore(state => state.updateRideCache);
    const getCachedRides = useAggregatedJourneysStore(state => state.getCachedRides);

    return useMemo(() => {
        // Update cache with new events
        updateRideCache(processedEvents, currentTime);

        // Return cached rides
        return getCachedRides();
    }, [processedEvents, currentTime, updateRideCache, getCachedRides]);
};

export const useActiveJourneys = (processedEvents: ArrivalOrDepartureEvent[], currentTime: number): Journey[] => {
    const allRides = useAllJourneys(processedEvents, currentTime);

    return useMemo(() => {
        return allRides.filter(ride => ride.status === "ACTIVE");
    }, [allRides]);
};

export const useFinishedJourneys = (processedEvents: ArrivalOrDepartureEvent[], currentTime: number): Journey[] => {
    const allRides = useAllJourneys(processedEvents, currentTime);

    return useMemo(() => {
        return allRides.filter(ride => ride.status === "FINISHED");
    }, [allRides]);
};

export const useCanceledJourneys = (processedEvents: ArrivalOrDepartureEvent[], currentTime: number): Journey[] => {
    const allRides = useAllJourneys(processedEvents, currentTime);

    return useMemo(() => {
        return allRides.filter(ride => ride.status === "CANCELED");
    }, [allRides]);
};

