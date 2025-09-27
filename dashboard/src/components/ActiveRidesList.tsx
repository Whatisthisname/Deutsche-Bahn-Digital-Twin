
import { useSimStore } from "@/state/useSimStore";
import { useIncrementalRides, determineRideStatus } from "@/state/useIncrementalRides";
import { useMemo } from 'react';

export default function ActiveRidesList() {
    // Add currentTime to force re-renders when simulation time changes
    const currentTime = useSimStore(state => state.cursorTs) ?? 0;

    // Direct store access (we know this works)
    const rides = useIncrementalRides(state => state.rides);
    const finishedRides = useIncrementalRides(state => state.finishedRides);
    const canceledRides = useIncrementalRides(state => state.canceledRides);

    // Combine all rides with their status using useMemo for proper reactivity
    const allRides = useMemo(() => {
        const combined = [
            ...Array.from(rides.values()).map(ride => ({ ...ride, status: determineRideStatus(ride) })),
            ...Array.from(finishedRides.values()).map(ride => ({ ...ride, status: "FINISHED" as const })),
            ...Array.from(canceledRides.values()).map(ride => ({ ...ride, status: "CANCELED" as const }))
        ];

        // Sort by start time (newest first)
        return combined.sort((a, b) => b.startTs - a.startTs);
    }, [rides, finishedRides, canceledRides, currentTime]);


    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    const getRideStatus = (ride: any) => {
        return ride.status;
    };

    const getStatusColor = (ride: any) => {
        switch (ride.status) {
            case "ACTIVE": return "#2e7d32"; // Green
            case "FINISHED": return "#757575"; // Gray
            case "CANCELED": return "#d32f2f"; // Red
            default: return "#757575";
        }
    };

    const getStartStation = (ride: any) => {
        // Get the first segment's fromStation
        const segments = Array.from(ride.segments.values());
        if (segments.length > 0) {
            const firstSegment = segments[0] as any;
            return firstSegment?.fromStation || 'Unknown';
        }
        return 'Unknown';
    };

    const getEndStation = (ride: any) => {
        // Get the last segment's toStation, or use destination
        const segments = Array.from(ride.segments.values());
        if (segments.length > 0) {
            const lastSegment = segments[segments.length - 1] as any;
            return lastSegment?.toStation || ride.destination || 'Unknown';
        }
        return ride.destination || 'Unknown';
    };

    if (allRides.length === 0) {
        return (
            <div className="panel">
                <h3>All Rides</h3>
                <div className="no-rides">
                    <p>No rides at this time</p>
                </div>
            </div>
        );
    }

    return (
        <div className="panel">
            <h3>All Rides ({allRides.length})</h3>
            <div className="rides-list">
                {allRides.map((ride) => (
                    <div key={ride.rideId} className="ride-item">
                        <div className="ride-line-1">
                            <div className="ride-id">{ride.rideId}</div>
                            <div
                                className="ride-status"
                                style={{ color: getStatusColor(ride) }}
                            >
                                {getRideStatus(ride)}
                            </div>
                        </div>

                        <div className="ride-line-2">
                            <div className="ride-route">
                                <span className="start-station">{getStartStation(ride)}</span>
                                <span className="route-separator">→</span>
                                <span className="end-station">{getEndStation(ride)}</span>
                            </div>
                            <div className="ride-times">
                                <span className="time-value">{formatTime(ride.startTs)}</span>
                                <span className="time-separator">→</span>
                                <span className="time-value">{ride.endTs ? formatTime(ride.endTs) : 'Ongoing'}</span>
                                {ride.endTs && (
                                    <span className="duration">({Math.round((ride.endTs - ride.startTs) / (1000 * 60))}min)</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
