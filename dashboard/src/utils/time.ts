// utils/time.ts
// Centralized time utilities for consistent timestamp handling

/** Convert ISO date string to milliseconds */
export const ISO_to_ms = (value: string): number => {
    const timestamp = Date.parse(value);
    if (isNaN(timestamp)) throw new Error(`Invalid date string: ${value}`);
    return timestamp;
};

/** Convert milliseconds to seconds (for APIs that expect seconds) */
export const ms_to_s = (ms: number): number => Math.floor(ms / 1000);


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
export const getLatestEventTime = (events: Array<{ actual_time: string }>): number | undefined => {
    if (events.length === 0) return undefined;

    let latest = 0;
    for (const event of events) {
        const eventTime = ISO_to_ms(event.actual_time);
        if (eventTime && eventTime > latest) {
            latest = eventTime;
        }
    }
    return latest > 0 ? latest : undefined;
};
