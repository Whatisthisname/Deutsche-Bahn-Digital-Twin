// utils/time.ts
// Centralized time utilities for consistent timestamp handling

/** Convert various timestamp formats to milliseconds */
export const toMs = (value: unknown): number | undefined => {
    if (value == null || value === "") return undefined;
    const n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return undefined;
    return String(Math.trunc(n)).length === 10 ? n * 1000 : n;
};

/** Convert milliseconds to seconds (for APIs that expect seconds) */
export const fromMs = (ms: number): number => Math.floor(ms / 1000);

/** Best-effort timestamp extraction from event data */
export const coalesceTime = (event: any): number | undefined =>
    toMs(event.actual_timestamp) ??
    toMs(event.planned_timestamp) ??
    toMs(event.arrival_change_time) ??
    toMs(event.departure_change_time) ??
    toMs(event.arrival_planned_time) ??
    toMs(event.departure_planned_time) ??
    toMs(event.ts_ms) ??
    toMs(event.timestamp);

/** Format timestamp as ISO string */
export const formatTime = (timestamp: number): string =>
    new Date(timestamp).toISOString();

/** Format timestamp as local time string */
export const formatLocalTime = (timestamp: number): string =>
    new Date(timestamp).toLocaleTimeString();

/** Time constants */
export const TIME_CONSTANTS = {
    /** Default ride duration for new rides (12 hours) */
    DEFAULT_RIDE_DURATION_MS: 12 * 60 * 60 * 1000,

    /** Buffer time for extending ride duration (30 minutes) */
    RIDE_BUFFER_MS: 30 * 60 * 1000,

    /** Event stream polling interval (1 second) */
    POLLING_INTERVAL_MS: 1000,

    /** Default time increment per second at 1x speed (15 minutes) */
    TIME_INCREMENT_PER_SECOND_MS: 15 * 60 * 1000, // 15 minutes per second

    /** Minimum update interval for timeline (100ms) */
    MIN_TIMELINE_UPDATE_MS: 100,

    /** Grace period for active rides (1 minute) */
    ACTIVE_RIDE_GRACE_MS: 60 * 1000,
} as const;

/** Calculate ride duration in minutes */
export const getRideDurationMinutes = (startTs: number, endTs: number): number =>
    Math.round((endTs - startTs) / (60 * 1000));

/** Check if timestamp is within a time range */
export const isWithinTimeRange = (
    timestamp: number,
    startTs: number,
    endTs: number
): boolean => timestamp >= startTs && timestamp <= endTs;

/** Get the latest timestamp from an array of events */
export const getLatestEventTime = (events: any[]): number | undefined => {
    if (events.length === 0) return undefined;

    let latest = 0;
    for (const event of events) {
        const eventTime = coalesceTime(event);
        if (eventTime && eventTime > latest) {
            latest = eventTime;
        }
    }
    return latest > 0 ? latest : undefined;
};
