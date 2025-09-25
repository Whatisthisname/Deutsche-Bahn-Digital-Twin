import React from "react";
import { create } from "zustand";
import { useGraphStructure } from "./useGraphStructure";
import { useVisibleActiveEvents } from "./useTrainEvents";

// Dynamic station features that update in real-time
export interface DynamicStationFeatures {
    // Delay statistics
    totalDelaySum: number;
    rideCount: number;
    maxDelay: number;
    minDelay: number;

    // Real-time metrics
    currentDelay: number;
    lastUpdated: number;

    // Calculated metrics
    averageDelay: number;
    punctualityRate: number; // percentage of rides with delay < 6 minutes

    // Trend metrics (for future EMA implementation)
    delayTrend: number; // positive = increasing delays, negative = decreasing
}

// Station features state
type StationFeaturesState = {
    features: Map<number, DynamicStationFeatures>; // station ID -> features
    lastUpdateTime: number;

    // Actions
    updateFeatures: (events: any[]) => void;
    getStationFeatures: (stationId: number) => DynamicStationFeatures | null;
    getAllStationFeatures: () => Array<{
        stationId: number;
        stationName: string;
        features: DynamicStationFeatures;
    }>;
    reset: () => void;
};

// Helper function to calculate delay for a ride
function calculateRideDelay(events: any[]): number {
    if (events.length === 0) return 0;

    // Sort by station number to get correct sequence
    const sortedEvents = events.slice().sort(
        (a, b) => Number(a.train_line_station_num ?? 0) - Number(b.train_line_station_num ?? 0)
    );

    // Calculate max delay for this ride (same logic as map)
    let maxDelay = 0;
    for (const event of sortedEvents) {
        const delay = Number(event.delay_in_min ?? 0);
        maxDelay = Math.max(maxDelay, delay);
    }

    return maxDelay;
}

// Create the station features store
export const useStationFeatures = create<StationFeaturesState>()((set, get) => ({
    features: new Map(),
    lastUpdateTime: 0,

    updateFeatures: (events: any[]) => {
        const graph = useGraphStructure.getState().graph;
        if (!graph) return;

        const currentTime = Date.now();
        const newFeatures = new Map<number, DynamicStationFeatures>();

        // Initialize features for all stations with fresh defaults
        Object.entries(graph.stations).forEach(([stationIdStr, station]) => {
            const stationId = parseInt(stationIdStr);

            // Always start with fresh defaults - no accumulation of historical data
            const baseFeatures: DynamicStationFeatures = {
                totalDelaySum: 0,
                rideCount: 0,
                maxDelay: 0,
                minDelay: Infinity,
                currentDelay: 0,
                lastUpdated: currentTime,
                averageDelay: 0,
                punctualityRate: 0,
                delayTrend: 0,
            };

            newFeatures.set(stationId, baseFeatures);
        });

        // Group events by ride and process journey segments
        const byRide = new Map<string, any[]>();
        for (const event of events) {
            const rideId = String(event.train_line_ride_id ?? "");
            if (!rideId) continue;

            // For journey events, we need to handle both from_station and to_station
            const fromStation = event.from_station;
            const toStation = event.to_station;

            if (!fromStation && !toStation) continue;

            if (!byRide.has(rideId)) {
                byRide.set(rideId, []);
            }
            byRide.get(rideId)!.push(event);
        }

        // Process each ride and update station features
        for (const [rideId, rideEvents] of byRide) {
            if (rideEvents.length === 0) continue;

            // For journey events, calculate delay per journey segment
            const journeySegments = new Map<string, any[]>();

            // Group events by journey segment (from_station → to_station)
            for (const event of rideEvents) {
                const segmentKey = `${event.from_station}→${event.to_station}`;
                if (!journeySegments.has(segmentKey)) {
                    journeySegments.set(segmentKey, []);
                }
                journeySegments.get(segmentKey)!.push(event);
            }

            // Track which stations this ride has already been counted for
            const stationsCountedForThisRide = new Set<number>();

            // Process each journey segment
            for (const [segmentKey, segmentEvents] of journeySegments) {
                const segmentDelay = calculateRideDelay(segmentEvents);

                // Update features for both from_station and to_station
                for (const event of segmentEvents) {
                    const fromStation = event.from_station;
                    const toStation = event.to_station;

                    // Update from_station features
                    if (fromStation) {
                        const fromStationId = graph.stationNameToId[fromStation];
                        if (fromStationId !== undefined) {
                            const features = newFeatures.get(fromStationId)!;

                            // Only count this ride once per station
                            if (!stationsCountedForThisRide.has(fromStationId)) {
                                features.rideCount++;
                                stationsCountedForThisRide.add(fromStationId);
                            }

                            features.totalDelaySum += segmentDelay;
                            features.maxDelay = Math.max(features.maxDelay, segmentDelay);
                            features.minDelay = Math.min(features.minDelay, segmentDelay);
                            features.currentDelay = segmentDelay;
                            features.lastUpdated = currentTime;
                            features.averageDelay = features.rideCount > 0 ?
                                features.totalDelaySum / features.rideCount : 0;
                            features.punctualityRate = features.averageDelay < 6 ? 100 : 0;
                        }
                    }

                    // Update to_station features
                    if (toStation) {
                        const toStationId = graph.stationNameToId[toStation];
                        if (toStationId !== undefined) {
                            const features = newFeatures.get(toStationId)!;

                            // Only count this ride once per station
                            if (!stationsCountedForThisRide.has(toStationId)) {
                                features.rideCount++;
                                stationsCountedForThisRide.add(toStationId);
                            }

                            features.totalDelaySum += segmentDelay;
                            features.maxDelay = Math.max(features.maxDelay, segmentDelay);
                            features.minDelay = Math.min(features.minDelay, segmentDelay);
                            features.currentDelay = segmentDelay;
                            features.lastUpdated = currentTime;
                            features.averageDelay = features.rideCount > 0 ?
                                features.totalDelaySum / features.rideCount : 0;
                            features.punctualityRate = features.averageDelay < 6 ? 100 : 0;
                        }
                    }
                }
            }
        }

        set({
            features: newFeatures,
            lastUpdateTime: currentTime
        });
    },

    getStationFeatures: (stationId: number) => {
        return get().features.get(stationId) || null;
    },

    getAllStationFeatures: () => {
        const graph = useGraphStructure.getState().graph;
        if (!graph) return [];

        return Array.from(get().features.entries()).map(([stationId, features]) => ({
            stationId,
            stationName: graph.stations[stationId.toString()]?.name || `Station ${stationId}`,
            features,
        }));
    },

    reset: () => {
        set({
            features: new Map(),
            lastUpdateTime: 0
        });
    },
}));

// Hook to automatically update features when events change with debouncing
export function useDynamicStationFeatures() {
    const events = useVisibleActiveEvents();
    const updateFeatures = useStationFeatures(state => state.updateFeatures);
    const features = useStationFeatures(state => state.features);
    const lastUpdateTime = useStationFeatures(state => state.lastUpdateTime);

    // Debounced update to reduce computation frequency during playback
    React.useEffect(() => {
        if (events.length === 0) return;

        const timeoutId = setTimeout(() => {
            updateFeatures(events);
        }, 150); // Debounce updates by 150ms

        return () => clearTimeout(timeoutId);
    }, [events, updateFeatures]); // Depend on events to trigger updates when timeline changes

    return {
        features,
        lastUpdateTime,
        getAllStationFeatures: useStationFeatures.getState().getAllStationFeatures,
        getStationFeatures: useStationFeatures.getState().getStationFeatures,
    };
}
