// hooks/useStreamingTrainEvents.ts
import { useMemo } from "react";
import { useEventStream } from "@/state/useEventStream";
import { useAllSimpleRides } from "@/state/useSimpleRides";
import { useSimStore } from "@/state/useSimStore";
import { useShouldThrottleRenders } from "@/state/useRenderThrottling";
import { ISO_to_ms } from "@/utils/time";
import type { AggregatedJourney } from "@/state/useSimpleRides";


/** Hook to get visible active events for the current time */
export const useVisibleActiveEvents = () => {
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(s => s.cursorTs) ?? 0;
    const allRides = useAllSimpleRides(processedEvents, currentTime);
    const shouldThrottle = useShouldThrottleRenders();

    return useMemo(() => {
        // If we're throttling renders, return empty array
        if (shouldThrottle) {
            return [];
        }

        const activeRides = allRides.filter(ride => ride.status === "ACTIVE");
        if (!activeRides.length) return [];

        const activeRideIds = new Set(activeRides.map(r => r.rideId));

        // Filter events to only include those from active rides and within time window
        const visibleEvents = processedEvents.filter(event => {
            const eventTime = ISO_to_ms(event.timestamp);
            const rideId = event.id_;

            return eventTime <= currentTime &&
                activeRideIds.has(rideId);
        });

        return visibleEvents;
    }, [processedEvents, allRides, currentTime, shouldThrottle]);
};

/** Hook to get active rides */
export const useActiveRides = (): AggregatedJourney[] => {
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(s => s.cursorTs) ?? 0;
    const allRides = useAllSimpleRides(processedEvents, currentTime);
    const shouldThrottle = useShouldThrottleRenders();

    return useMemo(() => {
        // If we're throttling renders, return empty array
        if (shouldThrottle) {
            return [];
        }

        return allRides.filter(ride => ride.status === "ACTIVE");
    }, [allRides, shouldThrottle]);
};

/** Hook to get all rides (active + finished + canceled) */
export const useAllRides = (): AggregatedJourney[] => {
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(s => s.cursorTs) ?? 0;
    const allRides = useAllSimpleRides(processedEvents, currentTime);
    const shouldThrottle = useShouldThrottleRenders();

    return useMemo(() => {
        // If we're throttling renders, return empty array
        if (shouldThrottle) {
            return [];
        }

        // Sort by start time (newest first)
        return allRides.sort((a, b) => b.startTs - a.startTs);
    }, [allRides, shouldThrottle]);
};
