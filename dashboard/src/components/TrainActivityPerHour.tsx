import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useSimStore } from "@/state/useSimStore";
import { useEventStream } from "@/state/useEventStream";
import { useActiveJourneys } from "@/hooks/useStreamingTrainEvents";
import type { ArrivalOrDepartureEvent } from "@/types/ride";
import { calculateDelayMinutes, calculateEventDelay } from "@/utils/delayUtils";
import { ISO_to_ms } from "@/utils/time";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DELAY_THRESHOLD_MIN = 5 as const;

type Agg = "minute" | "hour" | "day";

const WINDOW_MS: Record<Agg, number> = {
  minute: 24 * HOUR,
  hour:   24 * HOUR,
  day:    7 * DAY,
};

// ----- helpers -----
function tsOf(e: { timestamp?: string | number; ts?: number; time?: number; t?: number }) {
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
  if (agg === "minute") return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (agg === "hour")   return `${pad(d.getHours())}:00 ${d.toLocaleDateString()}`;
  return d.toLocaleDateString();
}
// nice round-up for suggested y-axis
function niceCeil(n: number) {
  if (n <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(n)));
  const step = p / 2; // 1, 5, 50, 500, ...
  return Math.ceil(n / step) * step;
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
  const windowEnd = startOfBucket(now, spanMs) + spanMs - 1;
  const windowStartAligned = startOfBucket(now - windowMs + 1, spanMs);
  const buckets = Math.floor((windowEnd - windowStartAligned + 1) / spanMs);

  // ---- fetch only events that can affect the window ----
  const windowEvents = useMemo(() => {
    const lowerBound = windowStartAligned - spanMs;
    return processedEvents
      .filter((e) => {
        const t = tsOf(e);
        return t >= lowerBound && t <= now;
      })
      .sort((a, b) => tsOf(a) - tsOf(b));
  }, [processedEvents, windowStartAligned, spanMs, now, minuteTick]);

  const chartData = useMemo(() => {
    const activeDiff = new Int32Array(buckets + 1);
    const delayedDiff = new Int32Array(buckets + 1);
    const cancelledPerBucket = new Int32Array(buckets);

    const byRide = new Map<string, ArrivalOrDepartureEvent[]>();
    for (const e of windowEvents) {
      const id = String((e as any).id_);
      (byRide.get(id) ?? (byRide.set(id, []), byRide.get(id)!)).push(e as ArrivalOrDepartureEvent);
    }
    for (const [, arr] of byRide) arr.sort((a: any, b: any) => a.station_num - b.station_num);

    const bucketIndex = (ts: number) =>
      Math.max(0, Math.min(buckets, Math.floor((ts - windowStartAligned) / spanMs)));

    for (const [rideId, arr] of byRide) {
      if (arr.length === 0) continue;

      const firstTs = tsOf(arr[0]);
      const lastTs = tsOf(arr[arr.length - 1]);
      const cancelEv = arr.find((e) => isCancellation(e));
      const cancelledAt = cancelEv ? tsOf(cancelEv) : undefined;

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

      if (cancelledAt && cancelledAt <= now) {
        const cIdx = bucketIndex(Math.max(cancelledAt, windowStartAligned));
        if (cIdx >= 0 && cIdx < buckets) cancelledPerBucket[cIdx] += 1;
      }

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

    const rows: { time: string; Active: number; Delayed: number; Cancelled: number }[] =
      new Array(buckets);
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

    // hide empty buckets so the chart grows as events arrive
    const filtered = rows.filter(r => (r.Active || r.Delayed || r.Cancelled));
    return filtered;
  }, [windowEvents, activeRideIdsNow, windowStartAligned, spanMs, buckets, agg, now]);

  // ----- Y-axis lock (user adjustable) -----
  const suggestedY = useMemo(() => {
    if (chartData.length === 0) return 10;
    const maxVal = Math.max(
      ...chartData.map(r => Math.max(r.Active, r.Delayed, r.Cancelled))
    );
    return niceCeil(maxVal);
  }, [chartData]);

  const [yMax, setYMax] = useState<number | null>(null); // null => auto
  const yDomain = (yMax != null) ? [0, yMax] : (['auto', 'auto'] as const);

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold">Train Activity per window</h2>

        <div className="flex items-center gap-3 text-xs text-gray-600 font-mono">
          <span>Time: {cursorTs ? new Date(cursorTs).toLocaleString() : "Not set"}</span>

          {/* Aggregation selector */}
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

          {/* Y-axis control */}
          <label className="flex items-center gap-2">
            <span className="text-gray-500">Y&nbsp;max</span>
            <input
              type="number"
              min={1}
              className="border rounded px-2 py-1 w-20"
              value={yMax ?? ""}
              placeholder={String(suggestedY)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") { setYMax(null); return; }  // back to auto
                const n = Number(v);
                setYMax(Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
              }}
              title="Leave empty for auto-scale"
            />
            <button
              type="button"
              className="border rounded px-2 py-1"
              onClick={() => setYMax(null)}
              title="Back to auto-scale"
            >
              Auto
            </button>
          </label>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" minTickGap={agg === "minute" ? 48 : 24} />
          <YAxis allowDecimals={false} domain={yDomain as any} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="Active"    stroke="#2563eb" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="Delayed"   stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="Cancelled" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>

      <div className="mt-2 text-xs text-gray-500">
        Window: {agg === "minute" ? "last 24h (per minute)" : agg === "hour" ? "last 3 days (per hour)" : "last 7 days (per day)"}.
        Delayed &gt; {DELAY_THRESHOLD_MIN} min.
      </div>
    </div>
  );
}
