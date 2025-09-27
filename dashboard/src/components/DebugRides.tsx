// src/components/DebugRides.tsx
import { useMemo } from 'react'
import { useIncrementalRides } from '@/state/useIncrementalRides'
import { useEventStream } from '@/state/useEventStream'
import { useSimStore } from '@/state/useSimStore'
import { useActiveRides } from '@/hooks/useStreamingTrainEvents'

export default function DebugRides() {
    const rides = useIncrementalRides(state => state.rides)
    const finishedRides = useIncrementalRides(state => state.finishedRides)
    const canceledRides = useIncrementalRides(state => state.canceledRides)
    const processedEvents = useEventStream(state => state.processedEvents)
    const currentTime = useSimStore(state => state.cursorTs)
    const activeRides = useActiveRides() // Get actual active rides
    const auditRides = useIncrementalRides(state => state.auditRides)

    const debugInfo = useMemo(() => {
        console.log(`🔍 DebugRides: Computing debug info (rides: ${rides.size}, finished: ${finishedRides.size}, canceled: ${canceledRides.size}, events: ${processedEvents.length}, active: ${activeRides.length})`);

        // AUDIT: Check what's actually in the rides Map
        const ridesInMap = Array.from(rides.values());
        const statusCounts = ridesInMap.reduce((acc, ride) => {
            acc[ride.status] = (acc[ride.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const isCanceledCount = ridesInMap.filter(r => r.isCanceled).length;
        const hasEndTsCount = ridesInMap.filter(r => r.endTs !== null).length;

        console.log(`🔍 AUDIT: Rides in Map breakdown:`, {
            total: ridesInMap.length,
            statusCounts,
            isCanceledCount,
            hasEndTsCount,
            shouldBeFinished: ridesInMap.filter(r => r.status === "FINISHED").length,
            shouldBeCanceled: ridesInMap.filter(r => r.status === "CANCELED").length,
            shouldBeActive: ridesInMap.filter(r => r.status === "ACTIVE").length
        });

        const info = {
            timestamp: new Date().toISOString(),
            currentTime: currentTime ? new Date(currentTime).toISOString() : 'null',
            processedEventsCount: processedEvents.length,
            ridesCount: rides.size,
            activeRidesCount: activeRides.length, // Add actual active rides count
            finishedRidesCount: finishedRides.size,
            canceledRidesCount: canceledRides.size,
            rideIds: Array.from(rides.keys()),
            lastProcessedEvent: processedEvents[processedEvents.length - 1],
            ridesDetails: Array.from(rides.values()).map(ride => ({
                rideId: ride.rideId,
                destination: ride.destination,
                startTs: new Date(ride.startTs).toISOString(),
                endTs: ride.endTs ? new Date(ride.endTs).toISOString() : 'null',
                status: ride.status,
                eventCount: ride.eventCount,
                isCanceled: ride.isCanceled,
                segments: ride.segments.size
            })),
            // Debug: Show status breakdown
            statusBreakdown: statusCounts,
            audit: {
                totalInMap: ridesInMap.length,
                statusCounts,
                isCanceledCount,
                hasEndTsCount
            }
        }

        console.log('🔍 DebugRides Info:', info)
        return info
    }, [rides.size, finishedRides.size, canceledRides.size, processedEvents.length, currentTime, activeRides.length])

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
            <button onClick={auditRides} style={{ marginBottom: '10px', padding: '5px' }}>
                🔍 AUDIT RIDES
            </button>
            <div>
                <strong>Current Time:</strong> {debugInfo.currentTime}<br />
                <strong>Processed Events:</strong> {debugInfo.processedEventsCount}<br />
                <strong>Total Rides:</strong> {debugInfo.ridesCount + debugInfo.finishedRidesCount + debugInfo.canceledRidesCount}<br />
                <strong>Active Rides:</strong> {debugInfo.activeRidesCount}<br />
                <strong>Finished Rides:</strong> {debugInfo.finishedRidesCount}<br />
                <strong>Canceled Rides:</strong> {debugInfo.canceledRidesCount}<br />
                <strong>Ride IDs:</strong> {debugInfo.rideIds?.join(', ') || 'none'}<br />
                <strong>Status Breakdown:</strong> {JSON.stringify(debugInfo.statusBreakdown)}<br />
            </div>

            {debugInfo.ridesDetails && debugInfo.ridesDetails.length > 0 && (
                <div>
                    <strong>Ride Details:</strong>
                    {debugInfo.ridesDetails.map((ride: any, index: number) => (
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
                        {debugInfo.lastProcessedEvent.train_line_ride_id}: {debugInfo.lastProcessedEvent.event_type}
                    </div>
                </div>
            )}
        </div>
    )
}
