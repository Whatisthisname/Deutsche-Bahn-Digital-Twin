import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useSimStore } from "@/state/useSimStore";
import { useEventStream } from "@/state/useEventStream";
import { useActiveJourneys } from "@/hooks/useStreamingTrainEvents";
import type { ArrivalOrDepartureEvent } from "@/types/ride";
import { calculateDelayMinutes, calculateEventDelay } from "@/utils/delayUtils";
import { ISO_to_ms } from "@/utils/time"; // ← use your time util for consistency

// -------------------- constants --------------------
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DELAY_THRESHOLD_MIN = 5 as const;

type Agg = "minute" | "hour" | "day";

// default rolling windows per aggregation
const WINDOW_MS: Record<Agg, number> = {
  minute: 24 * HOUR,  // last 24h, per-minute
  hour:   24 * HOUR,    // last 7d, per-hour
  day:    7 * DAY,   // last 7d, per-day
};

// -------------------- helpers --------------------
function tsOf(e: { timestamp?: string | number; ts?: number; time?: number; t?: number }) {
  // Prefer your ISO_to_ms for strings; accept epoch numbers too
  const t = e?.timestamp ?? e?.ts ?? e?.time ?? e?.t;
  if (typeof t === "number") return t;
  if (typeof t === "string") return ISO_to_ms(t);
  return 0;
}
function isCancellation(e: any) {
  const raw = (e?.event_type ?? e?.type ?? e?.kind ?? "").toString().toUpperCase();
  return raw.includes("CANCEL");
}
function startOfBucket(ts: number, spanMs: number) {
  return Math.floor(ts / spanMs) * spanMs;
}
function labelFor(ts: number, agg: Agg) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (agg === "minute") return `${pad(d.getHours())}:${pad(d.getMinutes())}`;            // HH:mm
  if (agg === "hour")   return `${pad(d.getHours())}:00 ${d.toLocaleDateString()}`;     // HH:00 + date
  return d.toLocaleDateString();                                                        // day label
}

export default function JourneysChartAggregated({
  defaultAgg = "minute" as Agg,
  windows = WINDOW_MS,
}: {
  defaultAgg?: Agg;
  windows?: Record<Agg, number>;
}) {
  // ---- simulation time ----
  const cursorTs = useSimStore((s) => s.cursorTs) ?? 0;
  const now = cursorTs > 0 ? cursorTs : Date.now();
  // recompute at least once per minute so the newest bucket fills live
  const minuteTick = Math.floor(now / MINUTE);

  // ---- data sources ----
  const processedEvents = useEventStream((s) => s.processedEvents);
  const activeJourneys = useActiveJourneys();
  const activeJourneysArray = Array.isArray(activeJourneys)
    ? activeJourneys
    : (activeJourneys as any)?.journeys ?? [];
  const activeRideIdsNow = useMemo(
    () => new Set(activeJourneysArray.map((j: any) => String(j.rideId))),
    [activeJourneysArray]
  );

  // ---- UI: aggregation selector ----
  const [agg, setAgg] = useState<Agg>(defaultAgg);
  const spanMs = agg === "minute" ? MINUTE : agg === "hour" ? HOUR : DAY;
  const windowMs = windows[agg];

  // ---- window bounds aligned to buckets ----
  const windowEnd = startOfBucket(now, spanMs) + spanMs - 1; // include current (partial) bucket
  const windowStartAligned = startOfBucket(now - windowMs + 1, spanMs);
  const buckets = Math.floor((windowEnd - windowStartAligned + 1) / spanMs);

  // ---- fetch only events that can affect the window (with a small lookback) ----
  const windowEvents = useMemo(() => {
    // look back one full bucket to catch intervals that start just before the window
    const lowerBound = windowStartAligned - spanMs;
    return processedEvents
      .filter((e) => {
        const t = tsOf(e);
        return t >= lowerBound && t <= now;
      })
      .sort((a, b) => tsOf(a) - tsOf(b));
  }, [processedEvents, windowStartAligned, spanMs, now, minuteTick]);

  const chartData = useMemo(() => {
    // difference arrays so we can add intervals efficiently
    const activeDiff = new Int32Array(buckets + 1);
    const delayedDiff = new Int32Array(buckets + 1);
    const cancelledPerBucket = new Int32Array(buckets); // new cancellations per bucket

    // group by ride, order events by station/sequence
    const byRide = new Map<string, ArrivalOrDepartureEvent[]>();
    for (const e of windowEvents) {
      const id = String((e as any).id_);
      (byRide.get(id) ?? (byRide.set(id, []), byRide.get(id)!)).push(e as ArrivalOrDepartureEvent);
    }
    for (const [, arr] of byRide) {
      arr.sort((a: any, b: any) => a.station_num - b.station_num);
    }

    // deposit intervals into diff arrays
    const bucketIndex = (ts: number) =>
      Math.max(0, Math.min(buckets, Math.floor((ts - windowStartAligned) / spanMs)));

    for (const [rideId, arr] of byRide) {
      if (arr.length === 0) continue;

      const firstTs = tsOf(arr[0]);
      const lastTs = tsOf(arr[arr.length - 1]);
      const cancelEv = arr.find((e) => isCancellation(e));
      const cancelledAt = cancelEv ? tsOf(cancelEv) : undefined;

      // ACTIVE: from first event to cancel OR (if still active) to now; clamp to window
      const activeStart = Math.max(firstTs, windowStartAligned);
      const activeEnd = Math.min(
        cancelledAt ?? (activeRideIdsNow.has(rideId) ? now : lastTs),
        now
      );

      if (activeEnd > activeStart) {
        const sIdx = bucketIndex(activeStart);
        const eIdx = Math.min(buckets, bucketIndex(activeEnd) + 1);
        activeDiff[sIdx] += 1;
        activeDiff[eIdx] -= 1;
      }

      // CANCELLED: cumulative from its bucket onwards
      if (cancelledAt && cancelledAt <= now) {
        const cIdx = bucketIndex(Math.max(cancelledAt, windowStartAligned));
        if (cIdx >= 0 && cIdx < buckets) {
          cancelledPerBucket[cIdx] += 1;
        }
      }

      // DELAY: carry last known delay forward until next event (or cancel/end)
      let prev: ArrivalOrDepartureEvent | null = null;
      for (let i = 0; i < arr.length; i++) {
        const cur = arr[i];
        const t0 = tsOf(cur);
        const t1 =
          i < arr.length - 1
            ? tsOf(arr[i + 1])
            : (cancelledAt ?? (activeRideIdsNow.has(rideId) ? now : lastTs));
        if (t1 <= t0) {
          prev = cur;
          continue;
        }

        let delayMin = 0;
        if (prev) delayMin = calculateDelayMinutes(cur, prev);
        else delayMin = calculateEventDelay(cur);

        if (delayMin > DELAY_THRESHOLD_MIN) {
          const s = Math.max(t0, windowStartAligned);
          const e = Math.min(t1, now);
          if (e > s) {
            const sIdx = bucketIndex(s);
            const eIdx = Math.min(buckets, bucketIndex(e) + 1);
            delayedDiff[sIdx] += 1;
            delayedDiff[eIdx] -= 1;
          }
        }

        prev = cur;
      }
    }

    // materialize counts per bucket
    const rows: { time: string; Active: number; Delayed: number; Cancelled: number }[] = new Array(buckets);
    let a = 0, d = 0;
    for (let i = 0; i < buckets; i++) {
      a += activeDiff[i];
      d += delayedDiff[i];
      const bucketStart = windowStartAligned + i * spanMs;
      rows[i] = {
        time: labelFor(bucketStart, agg),
        Active: a,
        Delayed: d,
        Cancelled: cancelledPerBucket[i],
      };
    }

    return rows;
  }, [windowEvents, activeRideIdsNow, windowStartAligned, spanMs, buckets, agg, now]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold">Train Activity per window</h2>
        <div className="flex items-center gap-2 text-xs text-gray-600 font-mono">
          <span>Time: {cursorTs ? new Date(cursorTs).toLocaleString() : "Not set"}</span>
          <span>
            
          </span>
          <label className="flex items-center gap-2">
            <span className="text-gray-500">Aggregation</span>
            <select
              className="border rounded px-2 py-1"
              value={agg}
              onChange={(e) => setAgg(e.target.value as Agg)}
            >
              <option value="minute">Per minute (24h)</option>
              <option value="hour">Per hour (3d)</option>
              <option value="day">Per day (7d)</option>
            </select>
          </label>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" minTickGap={agg === "minute" ? 48 : 24} />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="Active"    stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="Delayed"   stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="Cancelled" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-2 text-xs text-gray-500">
        Window: {agg === "minute" ? "last 24h (per minute)" : agg === "hour" ? "last 3 days (per hour)" : "last 7 days (per day)"}.
        Delayed &gt; {DELAY_THRESHOLD_MIN} min. Cancelled is cumulative.
      </div>
    </div>
  );
}
