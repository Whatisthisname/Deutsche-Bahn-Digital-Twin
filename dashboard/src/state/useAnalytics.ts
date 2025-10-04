import { create } from "zustand";
import { useSimStore } from "./useSimStore";
import { calculateRideDelays, calculateAnalyticsFromRideDelays } from "@/lib/delayCalculations";
import { useEventStream } from "./useEventStream";
import { useAllJourneys } from "./useAggregatedJourneys";
import type { ArrivalOrDepartureEvent } from "@/types/ride";
import type { Journey } from "./useAggregatedJourneys";
import React from "react";

// Analytics data structure
export type AnalyticsData = {
    activeTrainCount: number;
    averageDelay: number;
    punctualityRate: number; // percentage of trains with delay < 6 minutes
    totalEvents: number;
    lastUpdated: number;
};

// Analytics store state
type AnalyticsState = {
    analytics: AnalyticsData;
    computeAnalytics: (processedEvents: ArrivalOrDepartureEvent[], allRides: Journey[], currentTime: number) => void;
};

// Helper function to normalize time values
const toMs = (v: unknown): number | undefined => {
    if (v == null || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return undefined;
    return String(Math.trunc(n)).length === 10 ? n * 1000 : n;
};

// Create the analytics store
export const useAnalytics = create<AnalyticsState>((set) => ({
    analytics: {
        activeTrainCount: 0,
        averageDelay: 0,
        punctualityRate: 0,
        totalEvents: 0,
        lastUpdated: 0,
    },

    computeAnalytics: (processedEvents, allRides, currentTime) => {
        // Filter to active rides
        const activeRides = allRides.filter(ride => ride.status === "ACTIVE");

        // Count active trains
        const activeTrainCount = activeRides.length;

        // Get visible events for analytics calculation
        const activeRideIds = new Set(activeRides.map(r => r.rideId));
        const visibleEvents = processedEvents.filter(event => {
            const eventTime = toMs(event.timestamp);
            const rideId = event.id_;

            return eventTime != null && eventTime <= currentTime && activeRideIds.has(rideId);
        });

        // Calculate delays using helper function
        const rideDelays = calculateRideDelays(visibleEvents);
        const analytics = calculateAnalyticsFromRideDelays(rideDelays);

        const newAnalytics: AnalyticsData = {
            activeTrainCount,
            averageDelay: analytics.averageDelay,
            punctualityRate: analytics.punctualityRate,
            totalEvents: visibleEvents.length,
            lastUpdated: currentTime,
        };

        set({ analytics: newAnalytics });
    },
}));

// Hook to get current analytics with automatic updates
export const useCurrentAnalytics = () => {
    const analytics = useAnalytics(state => state.analytics);
    const computeAnalytics = useAnalytics(state => state.computeAnalytics);
    const cursorTs = useSimStore(state => state.cursorTs);
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(state => state.cursorTs) ?? 0;
    const allRides = useAllJourneys(processedEvents, currentTime);

    // Recompute analytics when cursor time or data changes
    React.useEffect(() => {
        computeAnalytics(processedEvents, allRides, cursorTs ?? 0);
    }, [cursorTs, processedEvents, allRides, computeAnalytics]);

    return analytics;
};