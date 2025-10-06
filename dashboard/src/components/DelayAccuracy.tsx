import { useMemo } from "react";
import { useActiveJourneys } from "@/hooks/useStreamingTrainEvents";
import { calculateDelayMinutes } from "@/utils/delayUtils";
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

function computeEMA(values: number[], alpha: number): number[] {
    if (values.length === 0) return [];
    const ema: number[] = [values[0]];
    for (let i = 1; i < values.length; i++) {
        ema.push(alpha * values[i] + (1 - alpha) * ema[i - 1]);
    }
    return ema;
}

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
        let actualDelays: number[] = [];
        let predictedDelays: number[] = [];
        let timestamps: number[] = [];

        // Group events by rideId for sequential delay calculation
        const eventsByRide = new Map<string, ArrivalOrDepartureEvent[]>();
        for (const e of allEvents) {
            const id = String(e.id_);
            (eventsByRide.get(id) ?? (eventsByRide.set(id, []), eventsByRide.get(id)!)).push(e);
        }

        // Collect delays in time order
        for (const events of eventsByRide.values()) {
            const sorted = events.slice().sort((a, b) => a.station_num - b.station_num);
            for (let i = 0; i < sorted.length; i++) {
                const event = sorted[i];
                const prev = i > 0 ? sorted[i - 1] : null;
                actualDelays.push(calculateDelayMinutes(event, prev));
                predictedDelays.push(typeof event.predicted_delay === "number" ? event.predicted_delay : 0);
                timestamps.push(new Date(event.timestamp).getTime());
            }
        }

        // Sort by timestamp
        const zipped = timestamps.map((t, i) => ({
            t,
            actual: actualDelays[i],
            predicted: predictedDelays[i],
        })).sort((a, b) => a.t - b.t);

        const sortedTimestamps = zipped.map(z => z.t);
        const sortedActual = zipped.map(z => z.actual);
        const sortedPredicted = zipped.map(z => z.predicted);

        const actualEMA = computeEMA(sortedActual, ALPHA);
        const predictedEMA = computeEMA(sortedPredicted, ALPHA);

        // Prepare data for recharts
        return sortedTimestamps.map((t, i) => ({
            time: new Date(t).toLocaleString(),
            "Actual EMA": actualEMA[i],
            "Predicted EMA": predictedEMA[i],
        }));
    }, [allEvents]);

    const latestActual = chartData.length ? chartData[chartData.length - 1]["Actual EMA"] : null;
    const latestPredicted = chartData.length ? chartData[chartData.length - 1]["Predicted EMA"] : null;

    return (
        <div>
            <h2>Delay Accuracy (Exponential Moving Average)</h2>
            <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" minTickGap={60} tick={false} />
                    <YAxis label={{ value: "Delay (min)", angle: -90, position: "insideLeft" }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="Actual EMA" stroke="#1976d2" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="Predicted EMA" stroke="#ffa726" dot={false} strokeWidth={2} />
                </LineChart>
            </ResponsiveContainer>
            <p>
                <strong>Latest Actual EMA:</strong> {latestActual !== null ? latestActual.toFixed(2) : "N/A"} min
            </p>
            <p>
                <strong>Latest Predicted EMA:</strong> {latestPredicted !== null ? latestPredicted.toFixed(2) : "N/A"} min
            </p>
            <p>
                <strong>Difference:</strong>{" "}
                {latestActual !== null && latestPredicted !== null
                    ? (latestActual - latestPredicted).toFixed(2)
                    : "N/A"}{" "}
                min
            </p>
        </div>
    );
}