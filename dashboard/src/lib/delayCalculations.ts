import type { JourneyEvent } from "@/types/ride";
import { calculateDelayMinutes } from "@/utils/delayUtils";

type JourneysDelay = {
    rideId: string;
    maxDelay: number;
    stations: string[];
    eventCount: number;
};

type Analytics = {
    averageDelay: number;
    punctualityRate: number;
    delayedJourneys: number;
    totalJourneys: number;
};

// Helper function to calculate ride delays using map logic
export function calculateRideDelays(events: JourneyEvent[]): JourneysDelay[] {
    // Group events by ride ID
    const byRide = new Map<string, JourneyEvent[]>();
    for (const e of events) {
        const id = String(e.id_);
        (byRide.get(id) ?? (byRide.set(id, []), byRide.get(id)!)).push(e);
    }

    const journeyDelays: JourneysDelay[] = [];

    for (const [rideId, grpRaw] of byRide) {
        const grp = grpRaw.slice().sort(
            (a, b) => a.station_num - b.station_num
        );

        if (grp.length < 2) continue;

        // Calculate max delay for this ride using consecutive events
        let maxDelay = 0;
        const stations = new Set<string>();

        for (let i = 0; i < grp.length; i++) {
            const event = grp[i];
            const previousEvent = i > 0 ? grp[i - 1] : null;
            const delay = calculateDelayMinutes(event, previousEvent);
            maxDelay = Math.max(maxDelay, delay);
            if (event.event_type == "ARRIVAL") {
                stations.add(event.to_station);
            }

            journeyDelays.push({
                rideId: String(rideId),
                maxDelay,
                stations: Array.from(stations),
                eventCount: grp.length
            });
        }
    }
    return journeyDelays;
}

// Helper function to calculate analytics from ride delays
export function calculateAnalyticsFromRideDelays(journeyDelays: JourneysDelay[]): Analytics {
    const totalDelays = journeyDelays.reduce((sum, ride) => sum + ride.maxDelay, 0);
    const averageDelay = journeyDelays.length > 0 ? totalDelays / journeyDelays.length : 0;

    const punctualJourneys = journeyDelays.filter(ride => ride.maxDelay < 6).length;
    const punctualityRate = journeyDelays.length > 0 ? (punctualJourneys / journeyDelays.length) * 100 : 0;

    const delayedJourneys = journeyDelays.filter(ride => ride.maxDelay > 0).length;

    return {
        averageDelay: Math.round(averageDelay * 10) / 10, // Round to 1 decimal
        punctualityRate: Math.round(punctualityRate * 10) / 10, // Round to 1 decimal
        delayedJourneys: delayedJourneys,
        totalJourneys: journeyDelays.length
    };
}
