// types/ride.ts
// TypeScript interfaces for ride-related data structures

import type { RideStatus } from "@/state/useIncrementalRides";

/** Journey event from CSV data */
export interface JourneyEvent {
    event_type?: 'departure' | 'arrival';
    train_line_ride_id?: string | number;
    from_station?: string;
    to_station?: string;
    train_line_station_num?: number;
    delay_in_min?: number;
    actual_timestamp?: number;
    planned_timestamp?: number;
    expected_arrival_timestamp?: number;
    expected_departure_timestamp?: number;
    final_destination_station?: string;
    is_canceled?: boolean | string; // Can be boolean or string "True"/"False" from CSV

    // Legacy fields for backward compatibility
    ts_ms?: number;
    timestamp?: number;
}

/** Ride segment between two stations */
export interface RideSegment {
    fromStation: string;
    toStation: string;
    departureTime: number;
    arrivalTime?: number;
    maxDelay: number;
    isComplete: boolean;
}

/** Ride with status information for UI components */
export interface RideWithStatus {
    rideId: string;
    destination?: string;
    startTs: number;
    endTs: number | null;
    status: RideStatus;
    isCanceled: boolean;
    segments: Map<string, RideSegment>;
    lastUpdated: number;
    eventCount: number;
}

/** Station features for map visualization */
export interface StationFeatures {
    rideCount: number;
    totalDelaySum: number;
    averageDelay: number;
    currentDelay?: number;
    maxDelay?: number;
    punctualityRate?: number;
    lastUpdated?: number;
}

/** Station information for map display */
export interface StationInfo {
    stationName: string;
    stationId: number;
    features: StationFeatures;
    coordinates: [number, number];
}

// Re-export RideStatus for convenience
export type { RideStatus };
