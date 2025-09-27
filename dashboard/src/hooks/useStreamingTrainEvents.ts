// hooks/useStreamingTrainEvents.ts
import { useMemo } from "react";
import { useProcessedEvents } from "@/state/useEventStream";
import { useActiveIncrementalRides, useIncrementalRides, determineRideStatus } from "@/state/useIncrementalRides";
import { useSimStore } from "@/state/useSimStore";
import { useShouldThrottleRenders } from "@/state/useRenderThrottling";
import { coalesceTime } from "@/utils/time";

/** Journey event type */
type JourneyEvent = {
    event_type?: 'departure' | 'arrival';
    train_line_ride_id?: string | number;
    from_station?: string;
    to_station?: string;
    train_line_station_num?: number;
    delay_in_min?: number;
    actual_timestamp?: number;
    planned_timestamp?: number;
    expected_arrival_timestamp?: number;
    expected_departure_timestamp?: number;
    final_destination_station?: string;
    is_canceled?: boolean;
};

/** Hook to get visible active events for the current time */
export const useVisibleActiveEvents = () => {
    const processedEvents = useProcessedEvents();
    const activeRides = useActiveIncrementalRides();
    const currentTime = useSimStore(s => s.cursorTs) ?? 0;
    const shouldThrottle = useShouldThrottleRenders();

    return useMemo(() => {
        // If we're throttling renders, return empty array
        if (shouldThrottle) {
            return [];
        }

        if (!activeRides.length) return [];

        const activeRideIds = new Set(activeRides.map(r => r.rideId));

        // Filter events to only include those from active rides and within time window
        const visibleEvents = processedEvents.filter(event => {
            const eventTime = coalesceTime(event) ?? 0;
            const rideId = String(event.train_line_ride_id ?? "");

            return eventTime <= currentTime &&
                activeRideIds.has(rideId);
        });

        return visibleEvents as JourneyEvent[];
    }, [processedEvents, activeRides, currentTime, shouldThrottle]);
};

/** Hook to get active rides */
export const useActiveRides = () => {
    const activeRides = useActiveIncrementalRides();
    const shouldThrottle = useShouldThrottleRenders();

    return useMemo(() => {
        // If we're throttling renders, return empty array
        if (shouldThrottle) {
            return [];
        }

        return activeRides;
    }, [activeRides, shouldThrottle]);
};

/** Hook to get all rides (active + finished + canceled) */
export const useAllRides = () => {
    const rides = useIncrementalRides(state => state.rides);
    const finishedRides = useIncrementalRides(state => state.finishedRides);
    const canceledRides = useIncrementalRides(state => state.canceledRides);
    const shouldThrottle = useShouldThrottleRenders();

    return useMemo(() => {
        // If we're throttling renders, return empty array
        if (shouldThrottle) {
            return [];
        }

        // Combine all rides with their status
        const allRides = [
            ...Array.from(rides.values()).map(ride => ({ ...ride, status: determineRideStatus(ride) })),
            ...Array.from(finishedRides.values()).map(ride => ({ ...ride, status: "FINISHED" as const })),
            ...Array.from(canceledRides.values()).map(ride => ({ ...ride, status: "CANCELED" as const }))
        ];

        // Sort by start time (newest first)
        return allRides.sort((a, b) => b.startTs - a.startTs);
    }, [rides, finishedRides, canceledRides, shouldThrottle]);
};
