// Helper function to calculate ride delays using map logic
export function calculateRideDelays(events: any[]) {
    // Group events by ride ID
    const byRide = new Map<string, any[]>();
    for (const e of events) {
        const id = String(e.train_line_ride_id ?? "");
        if (!id) continue;
        (byRide.get(id) ?? (byRide.set(id, []), byRide.get(id)!)).push(e);
    }

    const rideDelays: { rideId: string; maxDelay: number; stations: string[]; eventCount: number }[] = [];

    for (const [rideId, grpRaw] of byRide) {
        const grp = grpRaw.slice().sort(
            (a, b) => Number(a.train_line_station_num ?? 0) - Number(b.train_line_station_num ?? 0)
        );

        if (grp.length < 2) continue;

        // Calculate max delay for this ride (same logic as map)
        let maxDelay = 0;
        const stations = new Set<string>();

        for (const event of grp) {
            const delay = Number(event.delay_in_min ?? 0);
            maxDelay = Math.max(maxDelay, delay);
            if (event.station) {
                stations.add(event.station);
            }
        }

        rideDelays.push({
            rideId,
            maxDelay,
            stations: Array.from(stations),
            eventCount: grp.length
        });
    }

    return rideDelays;
}

// Helper function to calculate analytics from ride delays
export function calculateAnalyticsFromRideDelays(rideDelays: { rideId: string; maxDelay: number; eventCount: number }[]) {
    const totalDelays = rideDelays.reduce((sum, ride) => sum + ride.maxDelay, 0);
    const averageDelay = rideDelays.length > 0 ? totalDelays / rideDelays.length : 0;

    const punctualRides = rideDelays.filter(ride => ride.maxDelay < 6).length;
    const punctualityRate = rideDelays.length > 0 ? (punctualRides / rideDelays.length) * 100 : 0;

    const delayedRides = rideDelays.filter(ride => ride.maxDelay > 0).length;

    return {
        averageDelay: Math.round(averageDelay * 10) / 10, // Round to 1 decimal
        punctualityRate: Math.round(punctualityRate * 10) / 10, // Round to 1 decimal
        delayedRides,
        totalRides: rideDelays.length
    };
}
