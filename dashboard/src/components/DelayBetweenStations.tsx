import { useMemo, useState, useEffect } from "react";
import { useSimStore } from "@/state/useSimStore";
import { useEventStream } from "@/state/useEventStream";
import { useAllJourneys as internal_useAllJourneys } from "@/state/useJourneys";
import type { Journey } from "@/state/useJourneys";
import type { ArrivalOrDepartureEvent } from "@/types/ride";
import { ISO_to_ms } from "@/utils/time";
import { calculateDelayMinutes } from "@/utils/delayUtils";


import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  LineChart,
  Line,
} from "recharts";

export default function EdgeDelayStatsAllHistoryCard() {
  const cursorTs = useSimStore((s) => s.cursorTs) ?? 0;
  const now = cursorTs || Date.now();

  const processedEvents = useEventStream((s) => s.processedEvents);
  const allJourneys: Journey[] = internal_useAllJourneys(processedEvents, now);

  // Build historical edges (From -> To)
  const edges = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const j of allJourneys ?? []) {
      const evts = (j.events ?? [])
        .slice()
        .sort((a, b) => ISO_to_ms(a.timestamp) - ISO_to_ms(b.timestamp));
      for (let i = 0; i < evts.length - 1; i++) {
        const prev = evts[i];
        if (!prev.from_station || !prev.to_station) continue;
        (adj.get(prev.from_station) ?? (adj.set(prev.from_station, new Set()), adj.get(prev.from_station)!)).add(prev.to_station);
      }
    }
    return adj;
  }, [allJourneys]);

  // Selection
  const [fromStation, setFromStation] = useState("");
  const [toStation, setToStation] = useState("");

  const fromOptions = useMemo(() => Array.from(edges.keys()).sort((a, b) => a.localeCompare(b)), [edges]);
  const toOptions   = useMemo(() => fromStation ? Array.from(edges.get(fromStation) ?? []).sort((a, b) => a.localeCompare(b)) : [], [edges, fromStation]);

  useEffect(() => {
    if (fromStation && !edges.has(fromStation)) { setFromStation(""); setToStation(""); }
    else if (fromStation && toStation && !edges.get(fromStation)?.has(toStation)) { setToStation(""); }
  }, [edges, fromStation, toStation]);

  // Delays for the selected edge (completed traversals only, up to now)
  const delays = useMemo(() => {
    if (!fromStation || !toStation) return [] as number[];
    const out: number[] = [];
    for (const j of allJourneys ?? []) {
      const evts = (j.events ?? [])
        .slice()
        .sort((a, b) => ISO_to_ms(a.timestamp) - ISO_to_ms(b.timestamp));
      for (let i = 0; i < evts.length - 1; i++) {
        const prev = evts[i] as ArrivalOrDepartureEvent;
        const next = evts[i + 1] as ArrivalOrDepartureEvent;
        if (prev.from_station !== fromStation || prev.to_station !== toStation) continue;
        if (!prev.expected_next_event_time) continue;
        if (ISO_to_ms(next.timestamp) > now) continue; // not arrived yet
        out.push(calculateDelayMinutes(next, prev)); // signed minutes
      }
    }
    return out;
  }, [allJourneys, fromStation, toStation, now]);

  const delayPoints = useMemo(() => {
    if (!fromStation || !toStation) return [] as { ts: number; delay: number }[];

    const out: { ts: number; delay: number }[] = [];

    for (const j of allJourneys ?? []) {
        const evts = (j.events ?? [])
        .slice()
        .sort((a, b) => ISO_to_ms(a.timestamp) - ISO_to_ms(b.timestamp));

        for (let i = 0; i < evts.length - 1; i++) {
        const prev = evts[i] as ArrivalOrDepartureEvent;
        const next = evts[i + 1] as ArrivalOrDepartureEvent;

        if (prev.from_station !== fromStation || prev.to_station !== toStation) continue;
        if (!prev.expected_next_event_time) continue;

        const nextTs = ISO_to_ms(next.timestamp);
        if (nextTs > now) continue; // not completed yet

        out.push({ ts: nextTs, delay: calculateDelayMinutes(next, prev) });
        }
    }

    return out.sort((a, b) => a.ts - b.ts);
    }, [allJourneys, fromStation, toStation, now]);

  

  // Stats
  const stats = useMemo(() => {
    const n = delays.length;
    if (n === 0) {
      return { count: 0, min: 0, median: 0, p90: 0, avg: 0, avgLateOnly: 0, max: 0, ontimeRate: 0 };
    }
    const sorted = [...delays].sort((a, b) => a - b);
    const sum = delays.reduce((a, b) => a + b, 0);
    const lateOnlySum = delays.reduce((a, b) => a + (b > 0 ? b : 0), 0);
    const pct = (q: number) => sorted[Math.min(n - 1, Math.max(0, Math.floor(q * (n - 1))))];
    return {
      count: n,
      min: sorted[0],
      median: pct(0.5),
      p90: pct(0.9),
      avg: sum / n,
      avgLateOnly: lateOnlySum / n,
      max: sorted[n - 1],
      ontimeRate: (delays.filter(d => d <= 0).length / n) * 100,
    };
  }, [delays]);



    const fmt = (m: number) => `${m.toFixed(1)} min`;
  

  return (
    <div className="analytics-card chart-card">
      {/* Header */}
      <div className="analytics-header">
        <h3 className="analytics-title">Edge Delay (All History)</h3>
        <div className="analytics-time">Sim: {new Date(now).toLocaleString()}</div>
      </div>

      {/* Controls */}
      <div className="mb-3" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ display: "flex", flexDirection: "column" }}>
          <span className="text-sm text-gray-600">From (historical)</span>
          <select value={fromStation} onChange={(e)=>{ setFromStation(e.target.value); setToStation(""); }}>
            <option value="">{fromOptions.length ? "Select…" : "No edges found yet"}</option>
            {fromOptions.map(s => <option key={`from-${s}`} value={s}>{s}</option>)}
          </select>
        </label>

        <label style={{ display: "flex", flexDirection: "column" }}>
          <span className="text-sm text-gray-600">To (historical)</span>
          <select value={toStation} onChange={(e)=>setToStation(e.target.value)} disabled={!fromStation || toOptions.length===0}>
            <option value="">{fromStation ? (toOptions.length ? "Select…" : "No destinations") : "Pick a From first"}</option>
            {toOptions.map(s => <option key={`to-${s}`} value={s}>{s}</option>)}
          </select>
        </label>

        {/* time-series chart inside the card's chart area */}
        <div className="chart-container">
        {fromStation && toStation && delayPoints.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
            <LineChart data={delayPoints}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                dataKey="ts"
                type="number"
                domain={['dataMin', 'dataMax']}
                scale="time"
                tickFormatter={(t) => new Date(t as number).toLocaleString()}
                />
                <YAxis label={{ value: "Delay (min)", angle: -90 }} />
                <Tooltip
                labelFormatter={(t) => new Date(t as number).toLocaleString()}
                formatter={(v) => [`${(v as number).toFixed(1)} min`, "Delay"]}
                />
                <ReferenceLine y={0} stroke="#9ca3af" />
                <Line
                type="monotone"
                dataKey="delay"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                />
            </LineChart>
            </ResponsiveContainer>
        ) : (
            <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>
            {fromStation && toStation ? "Edge exists, but no completed traversals yet." : "Pick a From/To to see stats."}
            </div>
        )}
        </div>

      </div>

      {/* KPIs */}
      {fromStation && toStation && stats.count > 0 && (
        <div className="mb-4" style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0,1fr))", gap: 12 }}>
          <Metric label="Samples" value={stats.count} />
          <Metric label="Min" value={fmt(stats.min)} />
          <Metric label="Median" value={fmt(stats.median)} />
          <Metric label="Avg (signed)" value={fmt(stats.avg)} />
          <Metric label="Avg (late-only)" value={fmt(stats.avgLateOnly)} />
          <Metric label="P90" value={fmt(stats.p90)} />
          {/* If you want Max as well, bump to 7 columns or wrap */}
        </div>
      )}



      {/* Footer (optional helper text) */}
      <div className="analytics-footer">
        <div className="metric-detail">
          {fromStation && toStation && stats.count > 0
            ? <>On-time rate (≤ 0 min): <strong>{stats.ontimeRate.toFixed(1)}%</strong></>
            : <>Select an edge to view its historical delay distribution.</>}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}
