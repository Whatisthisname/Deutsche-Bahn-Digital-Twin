import { create } from "zustand";
import { useMemo } from "react";
import { useSimStore } from "./useSimStore";
import { coalesceTime, TIME_CONSTANTS } from "@/utils/time";

/** Ride status */
export type RideStatus = "ACTIVE" | "FINISHED" | "CANCELED";

/** Incremental ride data structure */
export type IncrementalRide = {
    rideId: string;
    destination?: string;
    startTs: number;
    endTs: number | null; // null until ride actually finishes
    status: RideStatus;
    isCanceled: boolean;

    // Journey segments (from_station → to_station)
    segments: Map<string, {
        fromStation: string;
        toStation: string;
        departureTime: number;
        arrivalTime?: number;
        maxDelay: number;
        isComplete: boolean;
    }>;

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
    rides: Map<string, IncrementalRide>;
    finishedRides: Map<string, IncrementalRide>;
    canceledRides: Map<string, IncrementalRide>;

    // Actions
    processEvent: (event: any) => void;
    getActiveRides: (currentTime: number) => IncrementalRide[];
    getRideById: (rideId: string) => IncrementalRide | undefined;
    reset: () => void;
    auditRides: () => void;

    // Internal helpers
    _updateRideStatus: (ride: IncrementalRide, currentTime: number) => void;
    _moveRideToFinished: (rideId: string) => void;
    _moveRideToCanceled: (rideId: string) => void;
};

export const useIncrementalRides = create<IncrementalRidesState>((set, get) => ({
    rides: new Map(),
    finishedRides: new Map(),
    canceledRides: new Map(),

    processEvent: (event: any) => {
        const rideId = String(event.train_line_ride_id ?? "");
        if (!rideId) return;

        const eventTime = coalesceTime(event) ?? 0;
        const fromStation = event.from_station;
        const toStation = event.to_station;

        if (!fromStation || !toStation) return;

        // Use set() to update state properly
        set((state) => {

            // Get or create ride
            let ride = state.rides.get(rideId);
            if (!ride) {
                ride = {
                    rideId,
                    destination: event.final_destination_station,
                    startTs: eventTime,
                    endTs: null, // Will be set when ride finishes
                    status: "ACTIVE", // Immediately active since we only learn about it when it departs
                    isCanceled: false,
                    segments: new Map(),
                    lastUpdated: eventTime,
                    eventCount: 0
                };
                state.rides.set(rideId, ride);
            }

            // Update ride metadata
            ride.eventCount++;
            ride.lastUpdated = eventTime;
            ride.startTs = Math.min(ride.startTs, eventTime);

            // Only update endTs if this event extends the ride duration
            // For arrival events at destination, this might be the actual end
            if (event.event_type === 'arrival' && toStation === ride.destination) {
                ride.endTs = eventTime; // This is the actual end of the ride
            } else if (ride.endTs === null) {
                // If endTs is null, set it with a buffer
                ride.endTs = eventTime + TIME_CONSTANTS.RIDE_BUFFER_MS; // 30 minutes buffer
            } else {
                // For other events, extend the ride duration by a reasonable amount
                ride.endTs = Math.max(ride.endTs, eventTime + TIME_CONSTANTS.RIDE_BUFFER_MS); // 30 minutes buffer
            }

            // Check for cancellation - handle string "False"/"True" from CSV
            const isCanceled = event.is_canceled === true || event.is_canceled === "True" || event.is_canceled === "true";
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
                    departureTime: eventTime,
                    arrivalTime: undefined,
                    maxDelay: 0,
                    isComplete: false
                };
                ride.segments.set(segmentKey, segment);
            }

            // Update segment based on event type
            if (event.event_type === 'departure') {
                segment.departureTime = eventTime;
            } else if (event.event_type === 'arrival') {
                segment.arrivalTime = eventTime;
                segment.isComplete = true;
            }

            // Update delay
            const delay = Number(event.delay_in_min ?? 0);
            segment.maxDelay = Math.max(segment.maxDelay, delay);

            // Check if ride is finished (arrived at final destination)
            if (event.event_type === 'arrival' &&
                toStation === ride.destination &&
                segment.isComplete) {
                ride.status = "FINISHED";
                state._moveRideToFinished(rideId);
                return state; // Early return after moving to finished
            }


            // Update ride status based on current simulation time
            const currentTime = useSimStore.getState().cursorTs ?? eventTime;

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

    getRideById: (rideId: string) => {
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
        const state = get();
        const ridesInMap = Array.from(state.rides.values());

        // Use centralized status determination for consistency
        const statusBreakdown = ridesInMap.reduce((acc, ride) => {
            const determinedStatus = determineRideStatus(ride);
            acc[determinedStatus] = (acc[determinedStatus] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

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

    _moveRideToFinished: (rideId: string) => {
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

    _moveRideToCanceled: (rideId: string) => {
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
    const currentTime = useSimStore(state => state.cursorTs) ?? 0;

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
    }, [rides, currentTime]);
};

// Helper hook to get all rides (active + finished + canceled)
export const useAllIncrementalRides = () => {
    return useIncrementalRides(state => ({
        active: Array.from(state.rides.values()),
        finished: Array.from(state.finishedRides.values()),
        canceled: Array.from(state.canceledRides.values())
    }));
};
