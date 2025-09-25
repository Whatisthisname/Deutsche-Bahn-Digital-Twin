import { create } from "zustand";
import { useTrainEvents } from "./useTrainEvents";
import { useSimStore } from "./useSimStore";
import { calculateRideDelays, calculateAnalyticsFromRideDelays } from "@/lib/delayCalculations";

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

// Helper function to normalize time values (copied from useTrainEvents)
const toMs = (v: unknown): number | undefined => {
    if (v == null || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return undefined;
    return String(Math.trunc(n)).length === 10 ? n * 1000 : n;
};

// Create the analytics store
export const useAnalytics = create<AnalyticsState>((set, get) => ({
    analytics: {
        activeTrainCount: 0,
        averageDelay: 0,
        punctualityRate: 0,
        totalEvents: 0,
        lastUpdated: 0,
    },

    computeAnalytics: () => {
        // Get current state from other stores
        const trainEventsState = useTrainEvents.getState();
        const simState = useSimStore.getState();

        // Use the existing proven logic for active rides
        const rides = trainEventsState.rides;
        const t = simState.cursorTs ?? 0;

        // Replicate the classifyRideStatus logic
        const activeRides = Object.values(rides).filter(ride => {
            if (ride.canceled && t >= ride.endTs) return false; // CANCELED_ENDED
            if (t < ride.startTs) return false; // UPCOMING
            if (t < ride.endTs) return true; // ACTIVE
            return false; // ENDED
        });

        // Get visible events using the existing logic
        const allEvents = trainEventsState.allEvents;
        const activeRideIds = new Set(activeRides.map(r => r.rideId));

        const visibleEvents = allEvents.filter(event => {
            const eventTime = toMs(event.arrival_change_time) ??
                toMs(event.departure_change_time) ??
                toMs(event.arrival_planned_time) ??
                toMs(event.departure_planned_time) ??
                toMs(event.ts_ms ?? event.timestamp) ?? 0;

            return eventTime <= t && activeRideIds.has(String(event.train_line_ride_id ?? ""));
        });

        // Count active trains
        const activeTrainCount = activeRides.length;

        // Calculate delays using helper function
        const rideDelays = calculateRideDelays(visibleEvents);
        const analytics = calculateAnalyticsFromRideDelays(rideDelays);

        const newAnalytics: AnalyticsData = {
            activeTrainCount,
            averageDelay: analytics.averageDelay,
            punctualityRate: analytics.punctualityRate,
            totalEvents: visibleEvents.length,
            lastUpdated: simState.cursorTs ?? 0,
        };

        set({ analytics: newAnalytics });
    },
}));

// Hook to get current analytics with automatic updates
export const useCurrentAnalytics = () => {
    const analytics = useAnalytics(state => state.analytics);
    const computeAnalytics = useAnalytics(state => state.computeAnalytics);
    const cursorTs = useSimStore(state => state.cursorTs);
    const allEvents = useTrainEvents(state => state.allEvents);
    const rides = useTrainEvents(state => state.rides);

    // Recompute analytics when cursor time or data changes
    React.useEffect(() => {
        computeAnalytics();
    }, [cursorTs, allEvents, rides, computeAnalytics]);

    return analytics;
};

// Import React for useEffect
import React from "react";