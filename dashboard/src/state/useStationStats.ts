// useStationStats.ts
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { useGraphStructure } from "./useGraphStructure";
import { useActiveRides } from "@/hooks/useStreamingTrainEvents";
import type { AggregatedJourney } from "@/state/useSimpleRides";
import { calculateDelayMinutes } from "@/utils/delayUtils";

const PUNCTUAL_THRESHOLD_MIN = 6; // rides with delay < 6 min are considered punctual
const UPDATE_DEBOUNCE_MS = 50;

export interface StationRuntimeStats {
    // aggregates over rides touching this station (per update pass)
    rideCount: number;
    totalDelaySum: number; // minutes
    maxDelay: number;      // minutes
    minDelay: number;      // minutes (Infinity when no rides)
    currentDelay: number;  // minutes (last segment processed)
    lastUpdated: number;   // epoch ms

    // derived per-station
    averageDelay: number;       // minutes
    punctualRideCount: number;  // rides with delay < threshold (approx)
    punctualityRate: number;    // %
    delayTrend: number;         // placeholder for future EMA
}

type StationStatsMap = Map<string, StationRuntimeStats>;

type NetworkStatsState = {
    byStation: StationStatsMap;
    lastUpdated: number;
    recomputeFromRides: (rides: AggregatedJourney[]) => void;
    reset: () => void;
};


function computeRideDelayMinutesForEachBit(ride: AggregatedJourney): number[] {
    if (ride.events.length === 0) return [];

    // Calculate delay using consecutive events from the ride timeline
    const delays: number[] = [];
    for (let i = 1; i < ride.events.length; i++) {
        const currentEvent = ride.events[i];
        const pastEvent = ride.events[i - 1];
        const delay = calculateDelayMinutes(currentEvent, pastEvent);
        delays.push(delay);
    }
    return delays;
}


export const useStationStatsStore = create<NetworkStatsState>()((set) => ({
    byStation: new Map(),
    lastUpdated: 0,

    recomputeFromRides: (events: AggregatedJourney[]) => {
        const graph = useGraphStructure.getState().graph;
        if (!graph) throw new Error("Graph structure not loaded");

        const now = Date.now();
        const nextMap: StationStatsMap = new Map();

        // init all stations with fresh defaults (no historical carry-over)
        for (const stationId of Object.keys(graph.stations)) {
            nextMap.set(stationId, {
                rideCount: 0,
                totalDelaySum: 0,
                maxDelay: 0,
                minDelay: Infinity,
                currentDelay: 0,
                lastUpdated: now,
                averageDelay: 0,
                punctualRideCount: 0,
                punctualityRate: 0,
                delayTrend: 0,
            });
        }


        // process each ride
        for (const aggJourney of events) {
            if (!aggJourney.events.length) continue;
            const rideDelays = computeRideDelayMinutesForEachBit(aggJourney);

            // Track which stations this ride has already been counted for
            const countedStations = new Set<string>();

            // Now we have delays for each segment between events
            for (let i = 1; i < aggJourney.events.length; i++) {
                const fromEvent = aggJourney.events[i - 1];
                const toEvent = aggJourney.events[i];
                const delay = rideDelays[i - 1]; // delay for this segment
                const stations: string[] = [];
                if (fromEvent.event_type == "DEPARTURE" && toEvent.event_type == "ARRIVAL") {
                    // Map station names to station IDs
                    const fromStationId = graph.stationNameToId?.[fromEvent.to_station];
                    const toStationId = graph.stationNameToId?.[toEvent.from_station];
                    if (fromStationId) stations.push(fromStationId);
                    if (toStationId) stations.push(toStationId);
                } else if (fromEvent.event_type == "ARRIVAL" && toEvent.event_type == "DEPARTURE") {
                    // Map station names to station IDs
                    const fromStationId = graph.stationNameToId?.[fromEvent.to_station];
                    const toStationId = graph.stationNameToId?.[toEvent.from_station];
                    if (fromStationId) stations.push(fromStationId);
                    if (toStationId) stations.push(toStationId);
                } else {
                    throw new Error("Unknown event sequence in ride");
                }
                for (const stationId of stations) {
                    const stats = nextMap.get(stationId);
                    if (!stats) continue; // should not happen

                    // Count this ride only once per station
                    if (!countedStations.has(stationId)) {
                        stats.rideCount += 1;
                        countedStations.add(stationId);

                        // For punctuality, check if this ride is punctual (use max delay)
                        const maxRideDelay = Math.max(...rideDelays);
                        if (maxRideDelay < PUNCTUAL_THRESHOLD_MIN) {
                            stats.punctualRideCount += 1;
                        }
                    }

                    // Delay aggregates (accumulate all segment delays for this station)
                    stats.totalDelaySum += delay / 2; // divide by 2 to avoid double counting
                    stats.maxDelay = Math.max(stats.maxDelay, delay);
                    stats.minDelay = Math.min(stats.minDelay, delay);
                    stats.currentDelay = delay / 2;
                    stats.lastUpdated = now;
                }
            }
        }

        // finalize derived per-station fields
        for (const stats of nextMap.values()) {
            stats.averageDelay = stats.rideCount ? stats.totalDelaySum / stats.rideCount : 0;
            stats.punctualityRate = stats.rideCount ? (stats.punctualRideCount / stats.rideCount) * 100 : 0;
        }

        set({ byStation: nextMap, lastUpdated: now });
    },

    reset: () => set({ byStation: new Map(), lastUpdated: 0 }),
}));

export const useStationStats = () => {
    const graph = useGraphStructure((s) => s.graph);

    // select only raw slices (stable)
    const byStation = useStationStatsStore((s) => s.byStation);
    const lastUpdated = useStationStatsStore((s) => s.lastUpdated);
    const recomputeFromRides = useStationStatsStore((s) => s.recomputeFromRides);

    // stream of current active rides (using AggregatedJourney instead of raw events)
    const activeRides = useActiveRides();

    // derive stations array (memoized, safe)
    const stations = useMemo(() => {
        if (!graph) return [];
        return Array.from(byStation.entries()).map(([stationId, features]) => ({
            stationId,
            stationName: graph.stations[stationId]?.name ?? `Station ${stationId}`,
            features,
        }));
    }, [byStation, graph]);

    // derive global/network stats (memoized)
    const stats = useMemo(() => {
        const active = stations.filter((s) => s.features.rideCount > 0);

        const totalStations = stations.length;
        const activeStationsCount = active.length;

        const totalRides = active.reduce((n, s) => n + s.features.rideCount, 0);
        const totalDelay = active.reduce((n, s) => n + s.features.totalDelaySum, 0);
        const punctualRides = active.reduce((n, s) => n + s.features.punctualRideCount, 0);

        const averageDelay = totalRides ? totalDelay / totalRides : 0;
        const punctualityRate = totalRides ? (punctualRides / totalRides) * 100 : 0;

        return {
            totalStations,
            activeStationsCount,
            totalRides,
            averageDelay,
            punctualityRate,
            punctualRides,
        };
    }, [stations]);

    // debounced recompute when active rides change
    useEffect(() => {
        if (!activeRides || activeRides.length === 0) return;
        const id = setTimeout(() => {
            recomputeFromRides(activeRides);
        }, UPDATE_DEBOUNCE_MS);
        return () => clearTimeout(id);
    }, [activeRides, recomputeFromRides]);

    return { stations, stats, lastUpdated };
};
