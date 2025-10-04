// src/components/DebugRides.tsx
import { useMemo } from 'react'
import { useAllJourneys, type JourneyStatus } from '@/state/useAggregatedJourneys'
import { useEventStream } from '@/state/useEventStream'
import { useSimStore } from '@/state/useSimStore'

type RideInfo = {
    rideId: string; // Changed from number to string
    destination: string | undefined;
    startTs: string;
    endTs: string | null;
    status: JourneyStatus;
    eventCount: number;
    isCanceled: boolean;
}

export default function DebugRides() {
    const processedEvents = useEventStream(state => state.processedEvents)
    const currentTime = useSimStore(state => state.cursorTs) ?? 0
    const allJourneys = useAllJourneys(processedEvents, currentTime)

    const activeJourneys = allJourneys.filter(ride => ride.status === "ACTIVE")
    const finishedJourneys = allJourneys.filter(ride => ride.status === "FINISHED")
    const canceledJourneys = allJourneys.filter(ride => ride.status === "CANCELED")

    const debugInfo = useMemo(() => {

        const statusCounts = allJourneys.reduce((acc, ride) => {
            acc[ride.status] = (acc[ride.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const info = {
            timestamp: new Date().toISOString(),
            currentTime: currentTime ? new Date(currentTime).toISOString() : 'null',
            processedEventsCount: processedEvents.length,
            totalJourneysCount: allJourneys.length,
            activeJourneysCount: activeJourneys.length,
            finishedJourneysCount: finishedJourneys.length,
            canceledJourneysCount: canceledJourneys.length,
            rideIds: allJourneys.map(r => r.rideId),
            lastProcessedEvent: processedEvents[processedEvents.length - 1],
            ridesDetails: allJourneys.map(ride => ({
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
    }, [allJourneys, activeJourneys, finishedJourneys, canceledJourneys, processedEvents, currentTime])

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
                <strong>Total Rides:</strong> {debugInfo.totalJourneysCount}<br />
                <strong>Active Rides:</strong> {debugInfo.activeJourneysCount}<br />
                <strong>Finished Rides:</strong> {debugInfo.finishedJourneysCount}<br />
                <strong>Canceled Rides:</strong> {debugInfo.canceledJourneysCount}<br />
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
