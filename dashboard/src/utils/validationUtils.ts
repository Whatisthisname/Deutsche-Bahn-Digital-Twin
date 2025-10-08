import type { ArrivalOrDepartureEvent } from '@/types/ride';

export type PairPoint = { time: number; actual: number; predicted: number };

/**
 * Build aligned pairs (time, actual, predicted) from events grouped by ride.
 * - For each ride, sorts by station_num and pairs (prev, cur) for i>=1
 * - Uses prev.predicted_delay as the prediction for cur
 * - Skips pairs where prev.predicted_delay is missing
 * - Returns globally time-sorted array of pairs
 */
export function getAlignedPairs(eventsByRide: Map<string, ArrivalOrDepartureEvent[]>): PairPoint[] {
    const points: PairPoint[] = [];
    for (const events of eventsByRide.values()) {
        const sorted = events.slice().sort((a, b) => a.station_num - b.station_num);
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const cur = sorted[i];
            if (typeof prev.predicted_delay !== 'number') continue;
            const time = new Date(cur.timestamp).getTime();
            // calculateDelayMinutes is intentionally not imported here; caller computes actual
            points.push({ time, actual: 0, predicted: prev.predicted_delay as number });
        }
    }
    // sort globally by time
    points.sort((a, b) => a.time - b.time);
    return points;
}

/**
 * Compute running mean of values up to previous index: out[i] = mean(values[0..i-1]) or null for i===0
 */
export function runningMeanPrev(values: number[]): Array<number | null> {
    const out: Array<number | null> = [];
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        if (i === 0) out.push(null);
        else out.push(sum / i);
        sum += values[i];
    }
    return out;
}

/**
 * EMA that is null-aware: accepts array of number|null and returns number|null aligned array.
 * If value is null, output is null and EMA state is not updated. EMA starts at first non-null value.
 */
export function safeEMA(values: Array<number | null>, alpha: number): Array<number | null> {
    const out: Array<number | null> = [];
    let ema: number | null = null;
    for (const v of values) {
        if (v === null) {
            out.push(null);
            continue;
        }
        if (ema === null) ema = v;
        else ema = alpha * v + (1 - alpha) * ema;
        out.push(ema);
    }
    return out;
}
