
import { useSimStore } from "@/state/useSimStore";
import { useIncrementalRides, determineRideStatus } from "@/state/useIncrementalRides";
import { useMemo } from 'react';
import type { RideWithStatus } from "@/types/ride";
import type { ActiveRidesListProps } from "@/types/components";
import { getRideStatusColor, formatRideTime, getRideStartStation, getRideEndStation, getRideDurationMinutes } from "@/utils/rideHelpers";

export default function ActiveRidesList({
    maxItems,
    showStatus = true,
    showDuration = true,
    className,
    onRideSelect,
    activeOnly = false
}: Partial<ActiveRidesListProps> = {}) {
    // Force re-renders when simulation time changes
    useSimStore(state => state.cursorTs);

    // Direct store access (we know this works)
    const rides = useIncrementalRides(state => state.rides);
    const finishedRides = useIncrementalRides(state => state.finishedRides);
    const canceledRides = useIncrementalRides(state => state.canceledRides);

    // Combine all rides with their status using useMemo for proper reactivity
    const allRides = useMemo((): RideWithStatus[] => {
        let combined: RideWithStatus[] = [
            ...Array.from(rides.values()).map(ride => ({ ...ride, status: determineRideStatus(ride) })),
            ...Array.from(finishedRides.values()).map(ride => ({ ...ride, status: "FINISHED" as const })),
            ...Array.from(canceledRides.values()).map(ride => ({ ...ride, status: "CANCELED" as const }))
        ];

        // Filter to active only if requested
        if (activeOnly) {
            combined = combined.filter(ride => ride.status === "ACTIVE");
        }

        // Sort by start time (newest first)
        combined = combined.sort((a, b) => b.startTs - a.startTs);

        // Apply maxItems limit if specified
        if (maxItems && maxItems > 0) {
            combined = combined.slice(0, maxItems);
        }

        return combined;
    }, [rides, finishedRides, canceledRides, activeOnly, maxItems]);



    const title = activeOnly ? "Active Rides" : "All Rides";
    const handleRideClick = (ride: RideWithStatus) => {
        if (onRideSelect) {
            onRideSelect(ride);
        }
    };

    if (allRides.length === 0) {
        return (
            <div className={`panel ${className || ''}`}>
                <h3>{title}</h3>
                <div className="no-rides">
                    <p>No rides at this time</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`panel ${className || ''}`}>
            <h3>{title} ({allRides.length})</h3>
            <div className="rides-list">
                {allRides.map((ride) => (
                    <div
                        key={ride.rideId}
                        className={`ride-item ${onRideSelect ? 'clickable' : ''}`}
                        onClick={() => handleRideClick(ride)}
                        style={{ cursor: onRideSelect ? 'pointer' : 'default' }}
                    >
                        <div className="ride-line-1">
                            <div className="ride-id">{ride.rideId}</div>
                            {showStatus && (
                                <div
                                    className="ride-status"
                                    style={{ color: getRideStatusColor(ride.status) }}
                                >
                                    {ride.status}
                                </div>
                            )}
                        </div>

                        <div className="ride-line-2">
                            <div className="ride-route">
                                <span className="start-station">{getRideStartStation(ride)}</span>
                                <span className="route-separator">→</span>
                                <span className="end-station">{getRideEndStation(ride)}</span>
                            </div>
                            <div className="ride-times">
                                <span className="time-value">{formatRideTime(ride.startTs)}</span>
                                <span className="time-separator">→</span>
                                <span className="time-value">{ride.endTs ? formatRideTime(ride.endTs) : 'Ongoing'}</span>
                                {showDuration && ride.endTs && (
                                    <span className="duration">({getRideDurationMinutes(ride.startTs, ride.endTs)}min)</span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
