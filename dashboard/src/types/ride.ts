// types/ride.ts
// TypeScript interfaces for ride-related data structures

/** Split event directly from CSV data */
export interface ArrivalOrDepartureEvent {
    event_type: "DEPARTURE" | "ARRIVAL" | "CANCELLATION";
    id_: string;
    train_name: string;
    from_station: string;
    to_station: string;
    station_num: number;
    timestamp: string;
    expected_next_event_time: string | undefined;
    final_destination_station: string;
    predicted_delay?: number;
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
