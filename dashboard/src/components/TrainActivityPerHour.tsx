import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useActiveJourneys } from "@/hooks/useStreamingTrainEvents";
import { useSimStore } from "@/state/useSimStore";
import type { ArrivalOrDepartureEvent } from "@/types/ride";
import {
  calculateDelayMinutes,
  calculateEventDelay,
} from "@/utils/delayUtils";

type HourlyStats = {
  hour: string;       // "HH:00"
  active: number;     // all events counted in hour
  delayed: number;    // delay > 5 min
  cancelled: number;  // cancellation events
};

// ---------- helpers ----------
function tsOf(e: { timestamp?: string | number; ts?: number; time?: number; t?: number }) {
  const t = e?.timestamp ?? e?.ts ?? e?.time ?? e?.t;
  if (typeof t === "number") return t;
  if (typeof t === "string") {
    const n = Date.parse(t);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
function isCancellation(e: any) {
  const raw = (e?.event_type ?? e?.type ?? e?.kind ?? "").toString().toUpperCase();
  return raw.includes("CANCEL"); // handles CANCELLATION / CANCELLED
}

export default function TrainActivityPerHour() {
  const journeys = useActiveJourneys();
  const cursorTs = useSimStore((s) => s.cursorTs) ?? 0;

  // 1) Flatten + sort (no time filtering here)
  const allEvents = useMemo(
    () =>
      journeys
        .flatMap((j) => j.events)
        .sort((a, b) => tsOf(a) - tsOf(b)),
    [journeys]
  );

  // 2) Robust "now": sim time → latest event → wall clock
  const now = useMemo(() => {
    if (cursorTs > 0) return cursorTs;
    if (allEvents.length > 0) return tsOf(allEvents[allEvents.length - 1]);
    return Date.now();
  }, [cursorTs, allEvents]);

  // 3) Local midnight for the sim day
  const simDayStart = useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [now]);

  const chartData = useMemo(() => {
    if (allEvents.length === 0) return [];

    // Group events by ride for sequential delay calc
    const eventsByRide = new Map<string, ArrivalOrDepartureEvent[]>();
    for (const e of allEvents) {
      const rideId = String((e as any).id_);
      (eventsByRide.get(rideId) ??
        (eventsByRide.set(rideId, []), eventsByRide.get(rideId)!)
      ).push(e);
    }
    // sort per-ride once by station_num
    for (const [, arr] of eventsByRide) {
      arr.sort((a: any, b: any) => a.station_num - b.station_num);
    }

    const hourlyStats = new Map<string, HourlyStats>();
    let processed = 0;

    for (const event of allEvents) {
      const eventTime = tsOf(event);

      // only include current local day up to 'now'
      if (eventTime < simDayStart || eventTime > now) continue;

      // local hour bucket
      const simHour = new Date(eventTime).getHours();
      const hourKey = simHour.toString().padStart(2, "0") + ":00";

      const stats =
        hourlyStats.get(hourKey) ??
        (hourlyStats.set(hourKey, { hour: hourKey, active: 0, delayed: 0, cancelled: 0 }), hourlyStats.get(hourKey)!);

      stats.active += 1;
      processed += 1;

      if (isCancellation(event)) {
        stats.cancelled += 1;
        continue;
      }

      // sequential delay using your helpers
      const rideArr = eventsByRide.get(String((event as any).id_)) ?? [];
      const idx = rideArr.findIndex(
        (ev: any) => tsOf(ev) === tsOf(event) && ev.station_num === (event as any).station_num
      );

      let delayMin = 0;
      if (idx > 0) {
        const prev = rideArr[idx - 1] as ArrivalOrDepartureEvent;
        delayMin = calculateDelayMinutes(event as ArrivalOrDepartureEvent, prev);
      } else {
        // fall back to event's own expected time if present
        delayMin = calculateEventDelay(event as ArrivalOrDepartureEvent);
      }

      if (delayMin > 5) stats.delayed += 1;
    }

    // Sort HH:00 and only show hours up to current hour
    const sorted = Array.from(hourlyStats.values()).sort((a, b) => a.hour.localeCompare(b.hour));
    const currentHourKey = new Date(now).getHours().toString().padStart(2, "0") + ":00";
    const filtered = sorted.filter((h) => h.hour <= currentHourKey);

    // simple sanity log (remove if noisy)
    // console.log({ processed, buckets: filtered.length });

    return filtered;
  }, [allEvents, simDayStart, now]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Train Activity Per Hour</h2>
        <div className="text-xs text-gray-600 font-mono">
          <div>Sim: {cursorTs ? new Date(cursorTs).toLocaleTimeString() : "Not set"}</div>
          <div>Using now: {new Date(now).toLocaleString()}</div>
          <div>Events: {allEvents.length} | Data: {chartData.length} hrs</div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <XAxis dataKey="hour" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="active"    stroke="#3b82f6" strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="delayed"   stroke="#f59e0b" strokeWidth={2} isAnimationActive={false} />
          <Line type="monotone" dataKey="cancelled" stroke="#ef4444" strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
