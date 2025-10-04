// hooks/useStreamingTrainEvents.ts
import { useMemo } from "react";
import { useEventStream } from "@/state/useEventStream";
import { useAllJourneys as internal_useAllJourneys } from "@/state/useJourneys";
import { useSimStore } from "@/state/useSimStore";
import { useShouldThrottleRenders } from "@/state/useRenderThrottling";
import { ISO_to_ms } from "@/utils/time";
import type { Journey } from "@/state/useJourneys";


/** Hook to get visible active events for the current time */
export const useVisibleActiveEvents = () => {
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(s => s.cursorTs) ?? 0;
    const allJourneys = internal_useAllJourneys(processedEvents, currentTime);
    const shouldThrottle = useShouldThrottleRenders();

    return useMemo(() => {
        // If we're throttling renders, return empty array
        if (shouldThrottle) {
            return [];
        }

        const activeJourneys = allJourneys.filter(ride => ride.status === "ACTIVE");
        if (!activeJourneys.length) return [];

        const activeRideIds = new Set(activeJourneys.map(r => r.rideId));

        // Filter events to only include those from active rides and within time window
        const visibleEvents = processedEvents.filter(event => {
            const eventTime = ISO_to_ms(event.timestamp);
            const rideId = event.id_;

            return eventTime <= currentTime &&
                activeRideIds.has(rideId);
        });

        return visibleEvents;
    }, [processedEvents, allJourneys, currentTime, shouldThrottle]);
};

/** Hook to get active journeys */
export const useActiveJourneys = (): Journey[] => {
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(s => s.cursorTs) ?? 0;
    const allJourneys = internal_useAllJourneys(processedEvents, currentTime);
    const shouldThrottle = useShouldThrottleRenders();

    return useMemo(() => {
        // If we're throttling renders, return empty array
        if (shouldThrottle) {
            return [];
        }

        return allJourneys.filter(ride => ride.status === "ACTIVE");
    }, [allJourneys, shouldThrottle]);
};


export const allCanceledRideRate = () => {
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(s => s.cursorTs) ?? 0;
    const allJourneys = internal_useAllJourneys(processedEvents, currentTime);
    const shouldThrottle = useShouldThrottleRenders();

    return useMemo(() => {
        // If we're throttling renders, return 0
        if (shouldThrottle) {
            return 0;
        }

        const canceled = allJourneys.filter(ride => ride.status === "CANCELED");
        if (allJourneys.length === 0) return 0;
        return (canceled.length / allJourneys.length) * 100;
    }, [allJourneys, shouldThrottle]);
}

/** Hook to get all journeys (active + finished + canceled) */
export const useAllJourneys = (): Journey[] => {
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(s => s.cursorTs) ?? 0;
    const allJourneys = internal_useAllJourneys(processedEvents, currentTime);
    const shouldThrottle = useShouldThrottleRenders();

    return useMemo(() => {
        // If we're throttling renders, return empty array
        if (shouldThrottle) {
            return [];
        }

        // Sort by start time (newest first)
        return allJourneys.sort((a, b) => b.startTs - a.startTs);
    }, [allJourneys, shouldThrottle]);
};
