import { useMemo } from "react";
import { useActiveJourneys } from "@/hooks/useStreamingTrainEvents";
import { calculateDelayMinutes } from "@/utils/delayUtils";
import { getAlignedPairs, runningMeanPrev, safeEMA } from "@/utils/validationUtils";

import type { ArrivalOrDepartureEvent } from "@/types/ride";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    Legend,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";

const ALPHA = 0.1; // Smoothing factor for EMA



export default function DelayAccuracy() {
    const journeys = useActiveJourneys();

    // Flatten and sort all events by timestamp
    const allEvents = useMemo(
        () =>
            journeys
                .flatMap(j => j.events)
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
        [journeys]
    );

    // Compute actual and predicted delays and their EMA
    const chartData = useMemo(() => {
        // Group events by rideId for sequential delay calculation
        const eventsByRide = new Map<string, ArrivalOrDepartureEvent[]>();
        for (const e of allEvents) {
            const id = String(e.id_);
            (eventsByRide.get(id) ?? (eventsByRide.set(id, []), eventsByRide.get(id)!)).push(e);
        }

        // Get aligned pairs (time, actual, predicted) using helper
        const rawPairs = getAlignedPairs(eventsByRide);

        // Now compute actuals (we compute actual with calculateDelayMinutes since helper doesn't import it)
        // We need to map each raw pair back to its events to compute actual — rebuild a small index
        // Build a map from timestamp to event for quick lookup (note: timestamps may collide; this mirrors original behavior)
        const eventIndex = new Map<number, ArrivalOrDepartureEvent[]>();
        for (const e of allEvents) {
            const t = new Date(e.timestamp).getTime();
            (eventIndex.get(t) ?? eventIndex.set(t, []), eventIndex.get(t)!).push(e);
        }

        // For each raw pair, find the later event at that timestamp and its previous event by station_num
        const enrichedPairs: Array<{ time: number; actual: number; predicted: number }> = [];
        for (const rp of rawPairs) {
            const candidates = eventIndex.get(rp.time) ?? [];
            // find event among candidates; fallback: create actual 0
            let found: ArrivalOrDepartureEvent | null = null;
            for (const c of candidates) {
                // find previous by station_num
                const rideEvents = (eventsByRide.get(String(c.id_)) ?? []).slice().sort((a, b) => a.station_num - b.station_num);
                const idx = rideEvents.findIndex(ev => ev.timestamp === c.timestamp && ev.station_num === c.station_num);
                if (idx > 0) {
                    const prev = rideEvents[idx - 1];
                    // Ensure prev.predicted_delay matches rp.predicted
                    if (typeof prev.predicted_delay === 'number' && prev.predicted_delay === rp.predicted) {
                        const actual = calculateDelayMinutes(c, prev);
                        enrichedPairs.push({ time: rp.time, actual, predicted: rp.predicted });
                        found = c;
                        break;
                    }
                }
            }
            if (!found) {
                // fallback: compute actual from the first candidate if available
                if (candidates.length > 0) {
                    const c = candidates[0];
                    const rideEvents = (eventsByRide.get(String(c.id_)) ?? []).slice().sort((a, b) => a.station_num - b.station_num);
                    const idx = rideEvents.findIndex(ev => ev.timestamp === c.timestamp && ev.station_num === c.station_num);
                    if (idx > 0) {
                        const prev = rideEvents[idx - 1];
                        const actual = calculateDelayMinutes(c, prev);
                        enrichedPairs.push({ time: rp.time, actual, predicted: rp.predicted });
                        continue;
                    }
                }
                // If we couldn't compute actual, skip this point
            }
        }

        // Sort by time (already sorted but be safe)
        enrichedPairs.sort((a, b) => a.time - b.time);

        const sortedTimestamps = enrichedPairs.map(p => p.time);
        const sortedActual = enrichedPairs.map(p => p.actual);
        const sortedPredicted = enrichedPairs.map(p => p.predicted);

        const absDiff = sortedActual.map((a, i) => Math.abs(a - sortedPredicted[i]));
        const absDiffEMA = safeEMA(absDiff.map(v => v), ALPHA).map(v => v === null ? 0 : v) as number[];

        const running = runningMeanPrev(absDiff);
        const baselineError = sortedActual.map((a, i) => (running[i] === null ? null : Math.abs(a - (running[i] as number))));

        return sortedTimestamps.map((t, i) => ({
            time: new Date(t).toLocaleString(),
            "EMA of MAE (Decision Tree)": absDiffEMA[i],
            "EMA of MAE (Baseline)": baselineError[i],
        }));
    }, [allEvents]);

    // latest values intentionally omitted from this view

    return (
        <div>
            <h2>Digital Twin AI Validation</h2>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" minTickGap={60} tick={false} />
                    <YAxis label={{ value: "MAE", angle: -90 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="EMA of MAE (Decision Tree)" stroke="#e91e63" dot={false} strokeWidth={2} isAnimationActive={false} animationDuration={0} />
                    <Line type="monotone" dataKey="EMA of MAE (Baseline)" stroke="#9e9e9e" dot={false} strokeWidth={2} isAnimationActive={false} animationDuration={0} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}