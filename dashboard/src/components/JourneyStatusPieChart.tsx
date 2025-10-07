import { useMemo, useState } from "react";
import { useEventStream } from "@/state/useEventStream";
import { useAllJourneys as internal_useAllJourneys } from "@/state/useJourneys";
import { useSimStore } from "@/state/useSimStore";
import type { Journey } from "@/state/useJourneys";
import type { ArrivalOrDepartureEvent } from "@/types/ride";
import {
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip,
    Legend,
} from "recharts";

const COLORS = {
    onTime: "#10b981", // Green
    delayed: "#f59e0b", // Orange
    cancelled: "#ef4444", // Red
};


/**
 * JourneyStatusPieChart Component
 * 
 * Shows a cumulative pie chart of ALL journeys that have passed through stations:
 * - On Time: No significant delays
 * - Delayed: Has delays > threshold minutes
 * - Cancelled: Journey was cancelled
 */
export default function JourneyStatusPieChart() {
    // Use direct store access to bypass throttling for real-time updates
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(s => s.cursorTs) ?? 0;
    const journeys = internal_useAllJourneys(processedEvents, currentTime);
    
    const [selectedStation, setSelectedStation] = useState<string>("");
    const [delayThreshold, setDelayThreshold] = useState<number>(5);

    // Calculate actual delay between two events
    const calculateActualDelayMinutes = (currentEvent: ArrivalOrDepartureEvent, previousEvent: ArrivalOrDepartureEvent): number => {
        if (!currentEvent || !previousEvent) return 0;
        
        const currentTime = new Date(currentEvent.timestamp).getTime();
        const expectedTime = new Date(previousEvent.expected_next_event_time || previousEvent.timestamp).getTime();
        
        if (!previousEvent.expected_next_event_time) return 0;
        
        const delayMs = currentTime - expectedTime;
        const delayMinutes = delayMs / (1000 * 60);
        
        return Math.max(0, delayMinutes);
    };

    // Check if journey has significant delays
    const hasSignificantDelay = (journey: Journey, thresholdMinutes: number = 5): boolean => {
        if (journey.isCanceled || journey.status === "CANCELED") return false;
        
        const sortedEvents = journey.events.slice().sort((a, b) => a.station_num - b.station_num);
        
        for (let i = 1; i < sortedEvents.length; i++) {
            const currentEvent = sortedEvents[i];
            const previousEvent = sortedEvents[i - 1];
            
            const actualDelay = calculateActualDelayMinutes(currentEvent, previousEvent);
            if (actualDelay > thresholdMinutes) {
                return true;
            }
        }
        return false;
    };

    // Get unique stations for filtering
    const uniqueStations = useMemo(() => {
        const stationSet = new Set<string>();
        
        for (const journey of journeys || []) {
            for (const event of journey.events) {
                stationSet.add(event.from_station);
                stationSet.add(event.to_station);
                if (event.final_destination_station) {
                    stationSet.add(event.final_destination_station);
                }
            }
        }
        
        return Array.from(stationSet).sort();
    }, [journeys]);

    // Analyze ALL journeys cumulatively (not just completed ones)
    const analysis = useMemo(() => {
        if (!journeys || !Array.isArray(journeys)) {
            return { onTime: 0, delayed: 0, cancelled: 0, total: 0 };
        }

        // Filter by station if specified
        let filteredJourneys = journeys;
        if (selectedStation) {
            filteredJourneys = journeys.filter(journey => {
                return journey.events.some(event => 
                    event.from_station.toLowerCase().includes(selectedStation.toLowerCase()) ||
                    event.to_station.toLowerCase().includes(selectedStation.toLowerCase()) ||
                    event.final_destination_station.toLowerCase().includes(selectedStation.toLowerCase())
                );
            });
        }

        // Categorize ALL journeys (cumulative view)
        let cancelled = 0;
        let delayed = 0;
        let onTime = 0;

        for (const journey of filteredJourneys) {
            if (journey.isCanceled || journey.status === "CANCELED") {
                cancelled++;
            } else if (hasSignificantDelay(journey, delayThreshold)) {
                delayed++;
            } else {
                onTime++;
            }
        }

        const total = onTime + delayed + cancelled;

        console.log('Journey Status Analysis (Cumulative):', {
            totalJourneys: journeys.length,
            filteredJourneys: filteredJourneys.length,
            stationFilter: selectedStation,
            delayThreshold,
            result: { onTime, delayed, cancelled, total },
            breakdown: {
                activeJourneys: journeys.filter(j => j.status === "ACTIVE").length,
                finishedJourneys: journeys.filter(j => j.status === "FINISHED").length,
                cancelledJourneys: journeys.filter(j => j.status === "CANCELED" || j.isCanceled).length
            }
        });

        return { onTime, delayed, cancelled, total };
    }, [journeys, selectedStation, delayThreshold]);

    // Prepare data for pie chart
    const chartData = useMemo(() => {
        return [
            {
                name: "On Time",
                value: analysis.onTime,
                color: COLORS.onTime,
                percentage: analysis.total > 0 ? ((analysis.onTime / analysis.total) * 100).toFixed(1) : "0.0"
            },
            {
                name: "Delayed",
                value: analysis.delayed,
                color: COLORS.delayed,
                percentage: analysis.total > 0 ? ((analysis.delayed / analysis.total) * 100).toFixed(1) : "0.0"
            },
            {
                name: "Cancelled",
                value: analysis.cancelled,
                color: COLORS.cancelled,
                percentage: analysis.total > 0 ? ((analysis.cancelled / analysis.total) * 100).toFixed(1) : "0.0"
            }
        ].filter(item => item.value > 0); // Only show categories with data
    }, [analysis]);

    return (
        <div className="w-full">
            <div className="mb-4">
                <h2 className="text-xl font-bold mb-2">Cumulative Journey Status</h2>
                
                {/* Filter Controls */}
                <div className="flex flex-wrap gap-4 mb-4">
                    <div className="flex flex-col">
                        <label className="text-sm font-medium text-gray-700 mb-1">
                            Filter by Station:
                        </label>
                        <select
                            value={selectedStation}
                            onChange={(e) => setSelectedStation(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="">All Stations</option>
                            {uniqueStations.map(station => (
                                <option key={station} value={station}>
                                    {station}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="flex flex-col">
                        <label className="text-sm font-medium text-gray-700 mb-1">
                            Delay Threshold (minutes):
                        </label>
                        <input
                            type="number"
                            value={delayThreshold}
                            onChange={(e) => setDelayThreshold(Math.max(1, parseInt(e.target.value) || 5))}
                            min="1"
                            max="60"
                            className="px-3 py-2 border border-gray-300 rounded-md text-sm w-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="text-sm text-gray-600 mb-4">
                    Total Journeys Analyzed: {analysis.total} of {journeys?.length || 0} total journeys
                    {selectedStation && ` (filtered by station: ${selectedStation})`}
                    {delayThreshold !== 5 && ` (delay threshold: ${delayThreshold}min)`}
                </div>
            </div>

            {/* Pie Chart */}
            {analysis.total > 0 ? (
                <div className="flex flex-col lg:flex-row items-center gap-8">
                    <div className="w-full lg:w-2/3">
                        <ResponsiveContainer width="100%" height={400}>
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({name, percentage}) => `${name}: ${percentage}%`}
                                    outerRadius={120}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    formatter={(value, name) => [value, name]}
                                    labelFormatter={() => "Journey Status"}
                                />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Stats Panel */}
                    <div className="w-full lg:w-1/3 space-y-4">
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <h3 className="font-semibold mb-3">Breakdown</h3>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center">
                                        <span 
                                            className="w-3 h-3 rounded-full mr-2"
                                            style={{ backgroundColor: COLORS.onTime }}
                                        ></span>
                                        On Time: 
                                    </span>
                                    <span className="font-medium">{analysis.onTime}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center">
                                        <span 
                                            className="w-3 h-3 rounded-full mr-2"
                                            style={{ backgroundColor: COLORS.delayed }}
                                        ></span>
                                        Delayed: 
                                    </span>
                                    <span className="font-medium">{analysis.delayed}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="flex items-center">
                                        <span 
                                            className="w-3 h-3 rounded-full mr-2"
                                            style={{ backgroundColor: COLORS.cancelled }}
                                        ></span>
                                        Cancelled: 
                                    </span>
                                    <span className="font-medium">{analysis.cancelled}</span>
                                </div>
                            </div>
                            
                            {/* Performance Metrics */}
                            <div className="mt-4 pt-4 border-t border-gray-200">
                                <h4 className="text-sm font-medium text-gray-700 mb-2">Performance</h4>
                                <div className="text-sm text-gray-600 space-y-1">
                                    <div>On-time Rate: {chartData.find(d => d.name === "On Time")?.percentage || "0.0"}%</div>
                                    <div>Delay Rate: {chartData.find(d => d.name === "Delayed")?.percentage || "0.0"}%</div>
                                    <div>Cancellation Rate: {chartData.find(d => d.name === "Cancelled")?.percentage || "0.0"}%</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-center py-8">
                    <p className="text-gray-500">
                        No journeys available for analysis
                        {selectedStation && ` for station "${selectedStation}"`}.
                    </p>
                    <p className="text-sm text-gray-400 mt-2">
                        This chart shows all journeys that have been processed by the system.
                    </p>
                </div>
            )}
        </div>
    );
}