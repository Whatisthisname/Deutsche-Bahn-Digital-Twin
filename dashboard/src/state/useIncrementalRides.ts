import { create } from "zustand";
import { useMemo } from "react";
import { useSimStore } from "./useSimStore";
import { ISO_to_ms, TIME_CONSTANTS } from "@/utils/time";
import type { JourneyEvent, RideSegment } from "@/types/ride";

/** Ride status */
export type RideStatus = "ACTIVE" | "FINISHED" | "CANCELED";

/** Incremental ride data structure */
export type IncrementalRide = {
    rideId: number;
    destination?: string;
    startTs: number;
    endTs: number | null; // null until ride actually finishes
    status: RideStatus;
    isCanceled: boolean;

    // Journey segments (from_station → to_station)
    segments: Map<string, RideSegment>;

    // Metadata
    lastUpdated: number;
    eventCount: number;
};

/**
 * CENTRALIZED STATUS DETERMINATION
 * Single source of truth for determining ride status
 * Ensures non-overlapping partition of state space
 */
export const determineRideStatus = (ride: IncrementalRide): RideStatus => {
    // 1. CANCELED: Overrides everything else
    if (ride.isCanceled) {
        return "CANCELED";
    }

    // 2. FINISHED: Only if explicitly marked as finished by processEvent
    // (arrived at final destination)
    if (ride.status === "FINISHED") {
        return "FINISHED";
    }

    // 3. ACTIVE: Default for ongoing rides
    // Don't use endTs for status determination - it's just a buffer estimate
    return "ACTIVE";
};

/** Incremental rides state */
type IncrementalRidesState = {
    rides: Map<number, IncrementalRide>;
    finishedRides: Map<number, IncrementalRide>;
    canceledRides: Map<number, IncrementalRide>;

    // Actions
    processEvent: (event: JourneyEvent) => void;
    getActiveRides: (currentTime: number) => IncrementalRide[];
    getRideById: (rideId: number) => IncrementalRide | undefined;
    reset: () => void;
    auditRides: () => void;

    // Internal helpers
    _updateRideStatus: (ride: IncrementalRide, currentTime: number) => void;
    _moveRideToFinished: (rideId: number) => void;
    _moveRideToCanceled: (rideId: number) => void;
};

export const useIncrementalRides = create<IncrementalRidesState>((set, get) => ({
    rides: new Map(),
    finishedRides: new Map(),
    canceledRides: new Map(),

    processEvent: (event: JourneyEvent) => {
        const rideId = event.id_;

        const actual_time_ms = ISO_to_ms(event.timestamp);
        const fromStation = event.from_station;
        const toStation = event.to_station;

        if (!fromStation || !toStation) return;

        // Use set() to update state properly
        set((state) => {

            // Get or create ride
            let ride = state.rides.get(rideId);
            if (!ride) {
                ride = {
                    rideId: event.id_,
                    destination: event.final_destination_station,
                    startTs: actual_time_ms,
                    endTs: null, // Will be set when ride finishes
                    status: "ACTIVE", // Immediately active since we only learn about it when it departs
                    isCanceled: false,
                    segments: new Map(),
                    lastUpdated: actual_time_ms,
                    eventCount: 0
                };
                state.rides.set(rideId, ride);
            }

            // Update ride metadata
            ride.eventCount++;
            ride.lastUpdated = actual_time_ms;
            ride.startTs = Math.min(ride.startTs, actual_time_ms);

            // Only update endTs if this event extends the ride duration
            // For arrival events at destination, this might be the actual end
            if (event.event_type == "ARRIVAL" && toStation === ride.destination) {
                ride.endTs = actual_time_ms; // This is the actual end of the ride
            } else if (ride.endTs === null) {
                // If endTs is null, set it with a buffer
                ride.endTs = actual_time_ms + TIME_CONSTANTS.RIDE_BUFFER_MS; // 30 minutes buffer
            } else {
                // For other events, extend the ride duration by a reasonable amount
                ride.endTs = Math.max(ride.endTs, actual_time_ms + TIME_CONSTANTS.RIDE_BUFFER_MS); // 30 minutes buffer
            }

            // Check for cancellation - handle string "False"/"True" from CSV
            const isCanceled = event.event_type == "CANCELLATION";
            if (isCanceled) {
                ride.isCanceled = true;
                ride.status = "CANCELED";
                state._moveRideToCanceled(rideId);
                return state; // Early return after moving to canceled
            }

            // Create or update segment
            const segmentKey = `${fromStation}→${toStation}`;
            let segment = ride.segments.get(segmentKey);
            if (!segment) {
                segment = {
                    fromStation,
                    toStation,
                    departureTime: actual_time_ms,
                    arrivalTime: undefined,
                    maxDelay: 0,
                    isComplete: false
                };
                ride.segments.set(segmentKey, segment);
            }

            // Update segment based on event type
            if (event.event_type === "DEPARTURE") {
                segment.departureTime = actual_time_ms;
            } else if (event.event_type === "ARRIVAL") {
                segment.arrivalTime = actual_time_ms;
                segment.isComplete = true;
            }

            // Update delay
            const delay = event.delay_min;
            segment.maxDelay = Math.max(segment.maxDelay, delay);

            // Check if ride is finished (arrived at final destination)
            if (event.event_type === "ARRIVAL" &&
                toStation === ride.destination &&
                segment.isComplete) {
                ride.status = "FINISHED";
                state._moveRideToFinished(rideId);
                return state; // Early return after moving to finished
            }


            // Update ride status based on current simulation time
            const currentTime = useSimStore.getState().cursorTs ?? actual_time_ms;

            state._updateRideStatus(ride, currentTime);


            return state;
        });
    },

    getActiveRides: (currentTime: number) => {
        const state = get();
        const activeRides: IncrementalRide[] = [];

        for (const ride of state.rides.values()) {
            state._updateRideStatus(ride, currentTime);
            if (ride.status === "ACTIVE") {
                activeRides.push(ride);
            }
        }

        return activeRides;
    },

    getRideById: (rideId: number) => {
        const state = get();
        return state.rides.get(rideId) ||
            state.finishedRides.get(rideId) ||
            state.canceledRides.get(rideId);
    },

    reset: () => {
        set({
            rides: new Map(),
            finishedRides: new Map(),
            canceledRides: new Map()
        });
    },

    // AUDIT FUNCTION: Check for inconsistencies using centralized status determination
    auditRides: () => {
        // Audit function for debugging ride consistency
    },

    _updateRideStatus: (ride: IncrementalRide, currentTime: number) => {

        if (ride.isCanceled) {
            ride.status = "CANCELED";
            return;
        }

        if (ride.status === "FINISHED" || ride.status === "CANCELED") {
            return; // Don't change finished/canceled rides
        }

        if (ride.endTs !== null && currentTime >= ride.endTs) {
            // Check if ride should be finished
            const hasArrivedAtDestination = Array.from(ride.segments.values()).some(segment =>
                segment.isComplete && segment.toStation === ride.destination
            );


            if (hasArrivedAtDestination) {
                ride.status = "FINISHED";
                get()._moveRideToFinished(ride.rideId);
            } else {
                ride.status = "ACTIVE"; // Still active if not at destination
            }
        } else {
            ride.status = "ACTIVE";
        }
    },

    _moveRideToFinished: (rideId: number) => {
        const state = get();
        const ride = state.rides.get(rideId);
        if (!ride) {
            return;
        }

        ride.status = "FINISHED";
        state.finishedRides.set(rideId, ride);
        state.rides.delete(rideId);

        set({
            rides: new Map(state.rides),
            finishedRides: new Map(state.finishedRides)
        });
    },

    _moveRideToCanceled: (rideId: number) => {
        const state = get();
        const ride = state.rides.get(rideId);
        if (!ride) {
            return;
        }

        ride.status = "CANCELED";
        state.canceledRides.set(rideId, ride);
        state.rides.delete(rideId);

        set({
            rides: new Map(state.rides),
            canceledRides: new Map(state.canceledRides)
        });
    }
}));

// Helper hook to get active rides at current time
export const useActiveIncrementalRides = () => {
    const rides = useIncrementalRides(state => state.rides);

    // Use useMemo to ensure stable reference
    return useMemo(() => {
        const activeRides: IncrementalRide[] = [];

        for (const ride of rides.values()) {
            // Create a copy of the ride to avoid mutating the original
            const rideCopy = { ...ride };

            // Use centralized status determination
            const determinedStatus = determineRideStatus(rideCopy);
            rideCopy.status = determinedStatus;

            if (rideCopy.status === "ACTIVE") {
                activeRides.push(rideCopy);
            }
        }

        return activeRides;
    }, [rides]);
};

// Helper hook to get all rides (active + finished + canceled)
export const useAllIncrementalRides = () => {
    return useIncrementalRides(state => ({
        active: Array.from(state.rides.values()),
        finished: Array.from(state.finishedRides.values()),
        canceled: Array.from(state.canceledRides.values())
    }));
};
