import { create } from "zustand";
import { useAllRides } from "@/hooks/useStreamingTrainEvents";
import { useSimStore } from "./useSimStore";
import { calculateRideDelays, calculateAnalyticsFromRideDelays } from "@/lib/delayCalculations";
import { useProcessedEvents } from "./useEventStream";

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
    computeAnalytics: () => void;
};

// Helper function to normalize time values
const toMs = (v: unknown): number | undefined => {
    if (v == null || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return undefined;
    return String(Math.trunc(n)).length === 10 ? n * 1000 : n;
};

// Best-effort timestamp from a row
const coalesceTime = (r: any) =>
    toMs(r.actual_timestamp) ??
    toMs(r.planned_timestamp) ??
    toMs(r.arrival_change_time) ??
    toMs(r.departure_change_time) ??
    toMs(r.arrival_planned_time) ??
    toMs(r.departure_planned_time) ??
    toMs(r.ts_ms) ??
    toMs(r.timestamp);

// Create the analytics store
export const useAnalytics = create<AnalyticsState>((set) => ({
    analytics: {
        activeTrainCount: 0,
        averageDelay: 0,
        punctualityRate: 0,
        totalEvents: 0,
        lastUpdated: 0,
    },

    computeAnalytics: () => {
        // Get current state from other stores
        const simState = useSimStore.getState();
        const processedEvents = useProcessedEvents();
        const currentTime = simState.cursorTs ?? 0;

        // Get active rides from the incremental rides system
        const activeRides = useAllRides();

        // Count active trains
        const activeTrainCount = activeRides.length;

        // Get visible events for analytics calculation
        const activeRideIds = new Set(activeRides.map(r => r.rideId));
        const visibleEvents = processedEvents.filter(event => {
            const eventTime = coalesceTime(event) ?? 0;
            const rideId = String(event.train_line_ride_id ?? "");

            return eventTime <= currentTime && activeRideIds.has(rideId);
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
    const processedEvents = useProcessedEvents();
    const activeRides = useAllRides();

    // Recompute analytics when cursor time or data changes
    React.useEffect(() => {
        computeAnalytics();
    }, [cursorTs, processedEvents.length, activeRides.length, computeAnalytics]);

    return analytics;
};

// Import React for useEffect
import React from "react";