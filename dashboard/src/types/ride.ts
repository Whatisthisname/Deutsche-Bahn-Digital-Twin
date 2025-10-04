// types/ride.ts
// TypeScript interfaces for ride-related data structures

import type { JourneyStatus } from "@/state/useAggregatedJourneys";

/** Journey event from CSV data */
export interface JourneyEvent {
    event_type: "DEPARTURE" | "ARRIVAL" | "CANCELLATION";
    id_: string;
    train_name: string;
    from_station: string;
    to_station: string;
    station_num: number;
    timestamp: string;
    expected_next_event_time: string | undefined;
    final_destination_station: string;
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
    rideId: number;
    destination?: string;
    startTs: number;
    endTs: number | null;
    status: JourneyStatus;
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
    stationId: string;
    features: StationFeatures;
    coordinates: [number, number];
}

// Re-export RideStatus for convenience
export type { JourneyStatus as RideStatus };
