// state/useTrainEvents.ts
import { create } from "zustand";
import Papa from "papaparse";
import { useSimStore } from "./useSimStore";

/** Raw CSV row (keep flexible until you harden the schema). */
type TrainEvent = Record<string, any>;

/** Per-ride summary computed once after loading. */
type RideMeta = {
    rideId: string;
    destination?: string;
    lastStop?: string;
    startTs: number;
    endTs: number;
    canceled: boolean;
};

/** Store shape. */
type TrainEventsState = {
    allEvents: TrainEvent[];
    rides: Record<string, RideMeta>;  // per-ride metadata
    loadEvents: (url: string) => Promise<void>;
};

/** Normalize  time values. */
const toMs = (v: unknown): number | undefined => {
    if (v == null || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return undefined;
    return String(Math.trunc(n)).length === 10 ? n * 1000 : n;
};

/** Best-effort timestamp from a row (actual > planned > row time). */
const coalesceTime = (r: any) =>
    toMs(r.actual_timestamp) ??
    toMs(r.planned_timestamp) ??
    toMs(r.arrival_change_time) ??
    toMs(r.departure_change_time) ??
    toMs(r.arrival_planned_time) ??
    toMs(r.departure_planned_time) ??
    toMs(r.ts_ms) ??
    toMs(r.timestamp);

/** Global store for train events and rides. */
export const useTrainEvents = create<TrainEventsState>((set, get) => ({
    allEvents: [],
    rides: {},
    loadEvents: async (url) => {
        if (get().allEvents.length) return;
        const resp = await fetch(url);
        const text = await resp.text();
        const { data } = Papa.parse<TrainEvent>(text, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
        });

        // Keep only truthy rows and sort globally by time (ascending).
        const rows = (data as TrainEvent[])
            .filter(Boolean)
            .sort(
                (a, b) =>
                    (coalesceTime(a) ?? 0) -
                    (coalesceTime(b) ?? 0)
            );

        // Group rows by ride id.
        const byRide = new Map<string, TrainEvent[]>();
        for (const r of rows) {
            const id = String(r.train_line_ride_id ?? "");
            if (!id) continue;
            if (!byRide.has(id)) byRide.set(id, []);
            byRide.get(id)!.push(r);
        }

        // Build ride metadata (first/last stop → start/end).
        const rides: Record<string, RideMeta> = {};
        for (const [rideId, grp] of byRide) {
            // For journey events, we need to find the first departure and last arrival
            const departureEvents = grp.filter(e => e.event_type === 'departure');
            const arrivalEvents = grp.filter(e => e.event_type === 'arrival');

            if (departureEvents.length === 0) continue;

            // Sort by station number to get proper sequence
            departureEvents.sort((a, b) => Number(a.train_line_station_num ?? 0) - Number(b.train_line_station_num ?? 0));
            arrivalEvents.sort((a, b) => Number(a.train_line_station_num ?? 0) - Number(b.train_line_station_num ?? 0));

            const firstDeparture = departureEvents[0];
            const lastArrival = arrivalEvents[arrivalEvents.length - 1] || departureEvents[departureEvents.length - 1];

            const startTs = coalesceTime(firstDeparture) ?? 0;
            const endTs = coalesceTime(lastArrival) ?? startTs;

            rides[rideId] = {
                rideId,
                destination: String(firstDeparture.final_destination_station ?? ""),
                lastStop: String(lastArrival.to_station ?? lastArrival.from_station ?? ""),
                startTs,
                endTs,
                canceled: Boolean(lastArrival.is_canceled),
            };
        }

        set({ allEvents: rows, rides });
    },
}));

/** IDs of active rides. */
export const useActiveRideIds = (graceMs = 0) => {
    const rides = useTrainEvents((s) => s.rides);
    const t = useSimStore((s) => s.cursorTs) ?? 0;
    return Object.values(rides)
        .filter((r) => t < r.endTs + graceMs)
        .map((r) => r.rideId);
};

/** Visible active events with optimized filtering. */
export const useVisibleActiveEvents = (graceMs = 0) => {
    const allEvents = useTrainEvents((s) => s.allEvents);
    const activeIds = useActiveRideIds(graceMs);
    const t = useSimStore((s) => s.cursorTs) ?? 0;

    if (!activeIds.length) return [];
    const activeSet = new Set(activeIds);

    // Use binary search for more efficient filtering since events are sorted by time
    const result: TrainEvent[] = [];
    for (const e of allEvents) {
        const ts = coalesceTime(e) ?? 0;
        if (ts > t) break; // Since events are sorted, we can stop early
        if (activeSet.has(String(e.train_line_ride_id ?? ""))) {
            result.push(e);
        }
    }
    return result;
};

/** Ride status. */
export type RideStatus = "UPCOMING" | "ACTIVE" | "ENDED" | "CANCELED_ENDED";

/** Classify a ride at a specific timestamp. */
export function classifyRideStatus(
    ride: RideMeta,
    atTs: number,
    graceMs = 0
): RideStatus {
    if (ride.canceled && atTs >= ride.endTs) return "CANCELED_ENDED";
    if (atTs < ride.startTs) return "UPCOMING";
    if (atTs < ride.endTs + graceMs) return "ACTIVE";
    return "ENDED";
}

/** Active rides. */
export function useActiveRides(graceMs = 0) {
    const rides = useTrainEvents((s) => s.rides);
    const t = useSimStore((s) => s.cursorTs) ?? 0;
    return Object.values(rides).filter(
        (r) => classifyRideStatus(r, t, graceMs) === "ACTIVE"
    );
}

/** Ended rides. */
export function useEndedRides(graceMs = 0) {
    const rides = useTrainEvents((s) => s.rides);
    const t = useSimStore((s) => s.cursorTs) ?? 0;
    return Object.values(rides).filter((r) => {
        const s = classifyRideStatus(r, t, graceMs);
        return s === "ENDED" || s === "CANCELED_ENDED";
    });

}

