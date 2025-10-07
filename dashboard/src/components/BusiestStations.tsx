import { useMemo } from "react";
import { useActiveJourneys } from "@/hooks/useStreamingTrainEvents";
import { useSimStore } from "@/state/useSimStore";
import { useEventStream } from "@/state/useEventStream";
import { useAllJourneys as internal_useAllJourneys } from "@/state/useJourneys";
import { useShouldThrottleRenders } from "@/state/useRenderThrottling";
import type { ArrivalOrDepartureEvent } from "@/types/ride";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/**
 * BusiestStations Component
 * 
 * Shows the busiest train stations based on active journeys.
 * Uses the same pattern as ValidationChart for consistent data handling.
 */
export default function BusiestStations({ topN = 10 }: { topN?: number }) {
    const journeys = useActiveJourneys();
    const currentSimTime = useSimStore(s => s.cursorTs) ?? 0;
    const shouldThrottle = useShouldThrottleRenders();
    
    // Get data directly from stores to bypass throttling during playback
    const processedEvents = useEventStream(state => state.processedEvents);
    const allJourneysUnthrottled = internal_useAllJourneys(processedEvents, currentSimTime);

    // Use unthrottled data during playback, throttled data when paused
    const activeJourneys = useMemo(() => {
        if (shouldThrottle) {
            // During playback, use unthrottled data
            return allJourneysUnthrottled.filter(j => j.status === "ACTIVE");
        } else {
            // When paused, use the regular throttled data
            return journeys.filter(j => j.status === "ACTIVE");
        }
    }, [journeys, allJourneysUnthrottled, shouldThrottle]);

    // Debug info for troubleshooting
    const debugInfo = useMemo(() => {
        return {
            journeysCount: journeys?.length || 0,
            unthrottledJourneysCount: allJourneysUnthrottled?.length || 0,
            activeJourneysCount: activeJourneys?.length || 0,
            shouldThrottle,
            currentSimTime
        };
    }, [journeys, allJourneysUnthrottled, activeJourneys, shouldThrottle, currentSimTime]);

    // Flatten and sort all events by timestamp (same pattern as ValidationChart)
    const allEvents: ArrivalOrDepartureEvent[] = useMemo(
        () => {
            if (!activeJourneys || !Array.isArray(activeJourneys)) {
                console.warn('BusiestStations: activeJourneys is not an array', { activeJourneys });
                return [];
            }
            
            const events = activeJourneys
                .flatMap(j => {
                    if (!j.events || !Array.isArray(j.events)) {
                        console.warn('BusiestStations: journey has no events array', j);
                        return [];
                    }
                    return j.events;
                })
                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                
            console.log('BusiestStations: processed events', {
                totalEvents: events.length,
                activeJourneyCount: activeJourneys.length,
                shouldThrottle,
                eventTypes: events.reduce((acc, e) => {
                    acc[e.event_type] = (acc[e.event_type] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>),
                timeRange: events.length > 0 ? {
                    first: events[0].timestamp,
                    last: events[events.length - 1].timestamp
                } : null
            });
            
            return events;
        },
        [activeJourneys, currentSimTime, shouldThrottle]
    );

    // Build chart data with time window filtering
    const chartData = useMemo(() => {
        if (!allEvents.length) {
            console.warn('BusiestStations: no events to process');
            return [];
        }

        type StationData = {
            station: string;
            Arrivals: number;
            Departures: number;
            Total: number;
        };

        const stationCounts = new Map<string, StationData>();
        let processedEvents = 0;
        let skippedCancellation = 0;
        let skippedUnknownStation = 0;

        for (const event of allEvents) {
            
            // Skip cancellation events for station activity
            if (event.event_type === "CANCELLATION") {
                skippedCancellation++;
                continue;
            }

            // Determine station name based on event type
            let stationName: string;
            if (event.event_type === "DEPARTURE") {
                stationName = event.from_station;
            } else if (event.event_type === "ARRIVAL") {
                stationName = event.to_station;
            } else {
                continue; // Skip unknown event types
            }

            if (!stationName || stationName === "Unknown") {
                skippedUnknownStation++;
                continue;
            }

            processedEvents++;

            // Update station counts
            const existing = stationCounts.get(stationName) || {
                station: stationName,
                Arrivals: 0,
                Departures: 0,
                Total: 0
            };

            if (event.event_type === "ARRIVAL") {
                existing.Arrivals += 1;
            } else if (event.event_type === "DEPARTURE") {
                existing.Departures += 1;
            }

            existing.Total = existing.Arrivals + existing.Departures;
            stationCounts.set(stationName, existing);
        }

        // Ensure all data is properly formatted and numeric
        const validResult = Array.from(stationCounts.values())
            .map(station => ({
                ...station,
                Arrivals: Number(station.Arrivals) || 0,
                Departures: Number(station.Departures) || 0,
                Total: Number(station.Total) || 0
            }))
            .filter(station => 
                typeof station.Arrivals === 'number' && !isNaN(station.Arrivals) &&
                typeof station.Departures === 'number' && !isNaN(station.Departures) &&
                typeof station.Total === 'number' && !isNaN(station.Total) &&
                station.station && station.station !== 'Unknown'
            )
            .sort((a, b) => b.Total - a.Total)
            .slice(0, topN);

        console.log('BusiestStations: chart data generated', {
            processedEvents,
            skippedCancellation,
            skippedUnknownStation,
            uniqueStations: stationCounts.size,
            validStations: validResult.length,
            topStations: validResult.length,
            currentSimTime,
            hasData: validResult.length > 0,
            maxTotal: validResult.length > 0 ? Math.max(...validResult.map(s => s.Total)) : 0,
            sampleStations: validResult.slice(0, 3)
        });

        return validResult;
    }, [allEvents, topN, currentSimTime]);

    return (
        <div key={`busiest-${chartData.length}-${Math.floor(currentSimTime / 10000)}`}>
            <div className="mb-4">
                <h2>Top {topN} Busiest Stations (All Active Rides)</h2>
                <div className="text-sm text-gray-600 mt-2">
                    Active journeys: {debugInfo.activeJourneysCount} | 
                    Total events: {allEvents.length} | 
                    Stations shown: {chartData.length} |
                    {debugInfo.shouldThrottle ? ' (Playback)' : ' (Paused)'} |
                    Sim time: {currentSimTime ? new Date(currentSimTime).toLocaleTimeString() : 'Not set'}
                </div>
            </div>

            {/* Debug info panel */}
            {process.env.NODE_ENV === 'development' && (
                <details className="mb-4 p-2 border rounded text-sm bg-gray-50">
                    <summary className="cursor-pointer font-medium">Debug Info</summary>
                    <pre className="mt-2 text-xs">
                        {JSON.stringify(debugInfo, null, 2)}
                    </pre>
                    {allEvents.length > 0 && (
                        <div className="mt-2">
                            <strong>Sample events:</strong>
                            <pre className="text-xs">
                                {JSON.stringify(allEvents.slice(0, 3), null, 2)}
                            </pre>
                        </div>
                    )}
                    {chartData.length > 0 && (
                        <div className="mt-2">
                            <strong>Chart data validation:</strong>
                            <p className="text-xs">
                                Valid stations: {chartData.length}<br/>
                                All numeric arrivals: {chartData.every(d => typeof d.Arrivals === 'number') ? 'Yes' : 'No'}<br/>
                                All numeric departures: {chartData.every(d => typeof d.Departures === 'number') ? 'Yes' : 'No'}<br/>
                                Max total: {chartData.length > 0 ? Math.max(...chartData.map(d => d.Total)) : 0}<br/>
                                Has station names: {chartData.every(d => d.station && d.station.length > 0) ? 'Yes' : 'No'}
                            </p>
                            <strong>Sample chart data:</strong>
                            <pre className="text-xs">
                                {JSON.stringify(chartData.slice(0, 2), null, 2)}
                            </pre>
                        </div>
                    )}
                </details>
            )}

            <ResponsiveContainer width="100%" height={400}>
                <BarChart 
                    data={chartData} 
                    margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
                    barCategoryGap={"10%"}
                >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                        dataKey="station" 
                        angle={-45} 
                        textAnchor="end" 
                        height={80} 
                        interval={0}
                        fontSize={12}
                        tick={{ fontSize: 10 }}
                    />
                    <YAxis 
                        allowDecimals={false}
                        domain={[0, 'dataMax']}
                        tick={{ fontSize: 12 }}
                    />
                    <Tooltip 
                        formatter={(value, name) => [value, name]}
                        labelFormatter={(label) => `Station: ${label}`}
                        contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc' }}
                    />
                    <Legend />
                    <Bar 
                        dataKey="Arrivals" 
                        stackId="a" 
                        fill="#8884d8" 
                        isAnimationActive={false}
                        minPointSize={1}
                    />
                    <Bar 
                        dataKey="Departures" 
                        stackId="a" 
                        fill="#82ca9d" 
                        isAnimationActive={false}
                        minPointSize={1}
                    />
                </BarChart>
            </ResponsiveContainer>

            {chartData.length === 0 && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-yellow-800">
                        No station activity found for active rides.
                    </p>
                    
                </div>
            )}
        </div>
    );
}
