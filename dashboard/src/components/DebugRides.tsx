// src/components/DebugRides.tsx
import { useMemo } from 'react'
import { useAllSimpleRides, type RideStatus } from '@/state/useSimpleRides'
import { useEventStream } from '@/state/useEventStream'
import { useSimStore } from '@/state/useSimStore'

type RideInfo = {
    rideId: string; // Changed from number to string
    destination: string | undefined;
    startTs: string;
    endTs: string | null;
    status: RideStatus;
    eventCount: number;
    isCanceled: boolean;
}

export default function DebugRides() {
    const processedEvents = useEventStream(state => state.processedEvents)
    const currentTime = useSimStore(state => state.cursorTs) ?? 0
    const allRides = useAllSimpleRides(processedEvents, currentTime)

    const activeRides = allRides.filter(ride => ride.status === "ACTIVE")
    const finishedRides = allRides.filter(ride => ride.status === "FINISHED")
    const canceledRides = allRides.filter(ride => ride.status === "CANCELED")

    const debugInfo = useMemo(() => {

        const statusCounts = allRides.reduce((acc, ride) => {
            acc[ride.status] = (acc[ride.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const info = {
            timestamp: new Date().toISOString(),
            currentTime: currentTime ? new Date(currentTime).toISOString() : 'null',
            processedEventsCount: processedEvents.length,
            totalRidesCount: allRides.length,
            activeRidesCount: activeRides.length,
            finishedRidesCount: finishedRides.length,
            canceledRidesCount: canceledRides.length,
            rideIds: allRides.map(r => r.rideId),
            lastProcessedEvent: processedEvents[processedEvents.length - 1],
            ridesDetails: allRides.map(ride => ({
                rideId: ride.rideId,
                destination: ride.destination,
                startTs: new Date(ride.startTs).toISOString(),
                endTs: ride.endTs ? new Date(ride.endTs).toISOString() : 'null',
                status: ride.status,
                eventCount: ride.eventCount,
                isCanceled: ride.isCanceled
            })) as RideInfo[],
            statusBreakdown: statusCounts
        }

        return info
    }, [allRides, activeRides, finishedRides, canceledRides, processedEvents, currentTime])

    return (
        <div style={{
            position: 'fixed',
            top: 80, // Moved down from 10 to 80
            right: 10,
            background: 'white',
            border: '1px solid #ccc',
            padding: '10px',
            fontSize: '12px',
            maxWidth: '400px',
            maxHeight: '300px',
            overflow: 'auto',
            zIndex: 9999
        }}>
            <h4>Debug Rides</h4>
            <div>
                <strong>Current Time:</strong> {debugInfo.currentTime}<br />
                <strong>Processed Events:</strong> {debugInfo.processedEventsCount}<br />
                <strong>Total Rides:</strong> {debugInfo.totalRidesCount}<br />
                <strong>Active Rides:</strong> {debugInfo.activeRidesCount}<br />
                <strong>Finished Rides:</strong> {debugInfo.finishedRidesCount}<br />
                <strong>Canceled Rides:</strong> {debugInfo.canceledRidesCount}<br />
                <strong>Ride IDs:</strong> {debugInfo.rideIds?.join(', ') || 'none'}<br />
                <strong>Status Breakdown:</strong> {JSON.stringify(debugInfo.statusBreakdown)}<br />
            </div>

            {debugInfo.ridesDetails && debugInfo.ridesDetails.length > 0 && (
                <div>
                    <strong>Ride Details:</strong>
                    {debugInfo.ridesDetails.map((ride: RideInfo, index: number) => (
                        <div key={index} style={{ marginLeft: '10px', fontSize: '10px' }}>
                            {ride.rideId}: {ride.status} ({ride.eventCount} events)
                        </div>
                    ))}
                </div>
            )}

            {debugInfo.lastProcessedEvent && (
                <div>
                    <strong>Last Event:</strong><br />
                    <div style={{ fontSize: '10px', marginLeft: '10px' }}>
                        {debugInfo.lastProcessedEvent.id_}: {debugInfo.lastProcessedEvent.event_type}
                    </div>
                </div>
            )}
        </div>
    )
}
