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
            // Essential debugging for ride creation
            if (!state.rides.has(rideId)) {
                console.log(`🚂 Creating new ride: ${rideId} (${event.event_type} from ${fromStation} to ${toStation})`);
            }

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
                console.log(`🔍 IncrementalRides: Ride created successfully - total rides: ${state.rides.size}`);
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
                console.log(`🚫 IncrementalRides: Ride ${rideId} marked as CANCELED - event.is_canceled: ${event.is_canceled} (parsed as: ${isCanceled})`);
                ride.isCanceled = true;
                ride.status = "CANCELED";
                state._moveRideToCanceled(rideId);
                console.log(`🚫 IncrementalRides: Ride ${rideId} moved to canceled rides`);
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
                console.log(`🏁 IncrementalRides: Ride ${rideId} FINISHED - arrived at ${ride.destination}`);
                ride.status = "FINISHED";
                state._moveRideToFinished(rideId);
                console.log(`🏁 IncrementalRides: Ride ${rideId} moved to finished rides`);
                return state; // Early return after moving to finished
            }

            // CRITICAL DEBUG: Check if ride should be finished but isn't
            if (ride.destination && toStation === ride.destination && event.event_type === 'arrival') {
                console.log(`🚨 CRITICAL: Ride ${rideId} arrived at destination ${ride.destination} but segment.isComplete=${segment.isComplete}, status=${ride.status}`);
            }

            // Update ride status based on current simulation time
            const currentTime = useSimStore.getState().cursorTs ?? eventTime;

            state._updateRideStatus(ride, currentTime);

            // Debug: Check if ride should be moved but wasn't
            if (ride.status === "FINISHED" && state.rides.has(rideId)) {
                console.log(`🚨 IncrementalRides: WARNING - Ride ${rideId} is FINISHED but still in rides Map!`);
            }
            if (ride.status === "CANCELED" && state.rides.has(rideId)) {
                console.log(`🚨 IncrementalRides: WARNING - Ride ${rideId} is CANCELED but still in rides Map!`);
            }

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
        console.log(`🔍 IncrementalRides: RESET called - clearing all rides`);
        set({
            rides: new Map(),
            finishedRides: new Map(),
            canceledRides: new Map()
        });
        console.log(`🔍 IncrementalRides: RESET completed - all maps cleared`);
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

        console.log(`🔍 AUDIT: Total rides audit (using centralized status determination):`, {
            ridesMap: state.rides.size,
            finishedMap: state.finishedRides.size,
            canceledMap: state.canceledRides.size,
            total: state.rides.size + state.finishedRides.size + state.canceledRides.size,
            ridesInMapBreakdown: statusBreakdown,
            inconsistentRides: ridesInMap.filter(ride => {
                const determinedStatus = determineRideStatus(ride);
                return determinedStatus !== ride.status;
            }).map(ride => ({
                rideId: ride.rideId,
                storedStatus: ride.status,
                determinedStatus: determineRideStatus(ride),
                isCanceled: ride.isCanceled,
                endTs: ride.endTs,
                destination: ride.destination
            }))
        });
    },

    _updateRideStatus: (ride: IncrementalRide, currentTime: number) => {
        console.log(`IncrementalRides: _updateRideStatus for ${ride.rideId}:`, {
            currentTime: new Date(currentTime).toISOString(),
            startTs: new Date(ride.startTs).toISOString(),
            endTs: ride.endTs ? new Date(ride.endTs).toISOString() : 'null',
            currentStatus: ride.status,
            isCanceled: ride.isCanceled,
            destination: ride.destination
        });

        if (ride.isCanceled) {
            ride.status = "CANCELED";
            console.log(`IncrementalRides: Ride ${ride.rideId} marked as CANCELED`);
            return;
        }

        if (ride.status === "FINISHED" || ride.status === "CANCELED") {
            console.log(`IncrementalRides: Ride ${ride.rideId} already ${ride.status}, skipping`);
            return; // Don't change finished/canceled rides
        }

        if (ride.endTs !== null && currentTime >= ride.endTs) {
            // Check if ride should be finished
            const hasArrivedAtDestination = Array.from(ride.segments.values()).some(segment =>
                segment.isComplete && segment.toStation === ride.destination
            );

            console.log(`IncrementalRides: Ride ${ride.rideId} currentTime >= endTs, checking destination:`, {
                hasArrivedAtDestination,
                segments: Array.from(ride.segments.values()).map(s => ({
                    fromStation: s.fromStation,
                    toStation: s.toStation,
                    isComplete: s.isComplete
                })),
                destination: ride.destination
            });

            if (hasArrivedAtDestination) {
                ride.status = "FINISHED";
                console.log(`IncrementalRides: Ride ${ride.rideId} marked as FINISHED and moved to finished rides`);
                get()._moveRideToFinished(ride.rideId);
            } else {
                ride.status = "ACTIVE"; // Still active if not at destination
                console.log(`IncrementalRides: Ride ${ride.rideId} marked as ACTIVE (not at destination yet)`);
            }
        } else {
            ride.status = "ACTIVE";
            console.log(`IncrementalRides: Ride ${ride.rideId} marked as ACTIVE (within time range)`);
        }
    },

    _moveRideToFinished: (rideId: string) => {
        console.log(`🔍 _moveRideToFinished: Moving ride ${rideId} to finished`);
        const state = get();
        const ride = state.rides.get(rideId);
        if (!ride) {
            console.log(`🔍 _moveRideToFinished: Ride ${rideId} not found in active rides`);
            return;
        }

        console.log(`🔍 _moveRideToFinished: Ride ${rideId} found, moving from active (${state.rides.size}) to finished (${state.finishedRides.size})`);
        ride.status = "FINISHED";
        state.finishedRides.set(rideId, ride);
        state.rides.delete(rideId);

        console.log(`🔍 _moveRideToFinished: After move - active: ${state.rides.size}, finished: ${state.finishedRides.size}`);
        set({
            rides: new Map(state.rides),
            finishedRides: new Map(state.finishedRides)
        });
    },

    _moveRideToCanceled: (rideId: string) => {
        console.log(`🔍 _moveRideToCanceled: Moving ride ${rideId} to canceled`);
        const state = get();
        const ride = state.rides.get(rideId);
        if (!ride) {
            console.log(`🔍 _moveRideToCanceled: Ride ${rideId} not found in active rides`);
            return;
        }

        console.log(`🔍 _moveRideToCanceled: Ride ${rideId} found, moving from active (${state.rides.size}) to canceled (${state.canceledRides.size})`);
        ride.status = "CANCELED";
        state.canceledRides.set(rideId, ride);
        state.rides.delete(rideId);

        console.log(`🔍 _moveRideToCanceled: After move - active: ${state.rides.size}, canceled: ${state.canceledRides.size}`);
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

        // Only log when active rides count changes significantly
        if (activeRides.length > 0) {
            console.log(`🎯 Active rides: ${activeRides.length}/${rides.size} (${new Date(currentTime).toISOString()})`);
        } else {
            console.log(`🔍 useActiveIncrementalRides: No active rides found (total: ${rides.size})`);
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
