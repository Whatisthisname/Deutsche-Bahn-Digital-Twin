// utils/rideHelpers.ts
// Helper functions for ride-related operations

import type { RideStatus, RideWithStatus } from "@/types/ride";

/** Get color for ride status */
export const getRideStatusColor = (status: RideStatus): string => {
    switch (status) {
        case "ACTIVE": return "#2e7d32"; // Green
        case "FINISHED": return "#757575"; // Gray
        case "CANCELED": return "#d32f2f"; // Red
        default: return "#757575";
    }
};

/** Format timestamp to German time string */
export const formatRideTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

/** Get start station from ride segments */
export const getRideStartStation = (ride: RideWithStatus): string => {
    const segments = Array.from(ride.segments.values());
    if (segments.length > 0) {
        const firstSegment = segments[0];
        return firstSegment?.fromStation || 'Unknown';
    }
    return 'Unknown';
};

/** Get end station from ride segments */
export const getRideEndStation = (ride: RideWithStatus): string => {
    const segments = Array.from(ride.segments.values());
    if (segments.length > 0) {
        const lastSegment = segments[segments.length - 1];
        return lastSegment?.toStation || ride.destination || 'Unknown';
    }
    return ride.destination || 'Unknown';
};

/** Calculate ride duration in minutes */
export const getRideDurationMinutes = (startTs: number, endTs: number | null): number | null => {
    if (!endTs) return null;
    return Math.round((endTs - startTs) / (1000 * 60));
};
