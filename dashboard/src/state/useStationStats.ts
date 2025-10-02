// useStationStats.ts
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { useGraphStructure } from "./useGraphStructure";
import { useVisibleActiveEvents } from "@/hooks/useStreamingTrainEvents";
import type { JourneyEvent } from "@/types/ride";

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
    recomputeFromEvents: (events: JourneyEvent[]) => void;
    reset: () => void;
};

function segmentKey(ev: JourneyEvent): string {
    return `${ev.from_station}→${ev.to_station}`;
}

function computeSegmentDelayMin(events: JourneyEvent[]): number {
    if (events.length === 0) return 0;
    // Keep the same “max delay over the segment” logic you used before
    let maxDelay = 0;
    for (const ev of events) {
        const d = Number(ev.delay_min ?? 0);
        if (d > maxDelay) maxDelay = d;
    }
    return maxDelay;
}

export const useStationStatsStore = create<NetworkStatsState>()((set) => ({
    byStation: new Map(),
    lastUpdated: 0,

    recomputeFromEvents: (events: JourneyEvent[]) => {
        const graph = useGraphStructure.getState().graph;
        if (!graph) return;

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

        // group events by ride id
        const eventsByRide = new Map<string, JourneyEvent[]>();
        for (const ev of events) {
            const rideId = String(ev.id_ ?? "");
            if (!rideId) continue;
            if (!ev.from_station && !ev.to_station) continue;
            if (!eventsByRide.has(rideId)) eventsByRide.set(rideId, []);
            eventsByRide.get(rideId)!.push(ev);
        }

        // process each ride
        for (const [, rideEvents] of eventsByRide) {
            if (!rideEvents.length) continue;

            // group into journey segments “from→to”
            const segments = new Map<string, JourneyEvent[]>();
            for (const ev of rideEvents) {
                const key = segmentKey(ev);
                if (!segments.has(key)) segments.set(key, []);
                segments.get(key)!.push(ev);
            }

            // ensure we count each ride at most once per station
            const countedOncePerStation = new Set<string>();

            for (const [, segEvents] of segments) {
                const segDelay = computeSegmentDelayMin(segEvents);
                const segIsPunctual = segDelay < PUNCTUAL_THRESHOLD_MIN;

                // update both endpoints (from_station and to_station)
                for (const ev of segEvents) {
                    const endpoints = [ev.from_station, ev.to_station].filter(Boolean) as string[];
                    for (const stName of endpoints) {
                        const stationId = (useGraphStructure.getState().graph?.stationNameToId ?? {})[stName];
                        if (stationId == null) continue;

                        const stats = nextMap.get(stationId);
                        if (!stats) continue;

                        // Count this RIDE once per STATION (fixes over-count on cancel)
                        const firstTimeForStation = !countedOncePerStation.has(stationId);
                        if (firstTimeForStation) {
                            stats.rideCount++;
                            countedOncePerStation.add(stationId);
                        }

                        // Delay aggregates (these can be segment-based; you can refine later)
                        stats.totalDelaySum += segDelay;
                        stats.maxDelay = Math.max(stats.maxDelay, segDelay);
                        stats.minDelay = Math.min(stats.minDelay, segDelay);
                        stats.currentDelay = segDelay;
                        stats.lastUpdated = now;

                        // Punctuality approximation: count a punctual segment once per station per ride.
                        // We tie it to the "first time" guard to avoid segment double counting.
                        if (firstTimeForStation && segIsPunctual) {
                            stats.punctualRideCount++;
                        }
                    }
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
    const recomputeFromEvents = useStationStatsStore((s) => s.recomputeFromEvents);

    // stream of current visible events
    const events = useVisibleActiveEvents();

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

    // debounced recompute when events change
    useEffect(() => {
        if (!events || events.length === 0) return;
        const id = setTimeout(() => {
            recomputeFromEvents(events);
        }, UPDATE_DEBOUNCE_MS);
        return () => clearTimeout(id);
    }, [events, recomputeFromEvents]);

    return { stations, stats, lastUpdated };
};
