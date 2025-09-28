import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { useSimStore } from "@/state/useSimStore";
import { useDynamicStationFeatures } from "@/state/useStationFeatures";
import { useGraphStructure } from "@/state/useGraphStructure";

export default function AverageDelayChart() {
    const cursorTs = useSimStore(state => state.cursorTs);
    const { loaded } = useGraphStructure();
    const { getAllStationFeatures } = useDynamicStationFeatures();

    const currentTime = cursorTs ? new Date(cursorTs).toLocaleTimeString() : '—';

    // Memoize chart data calculation to prevent unnecessary recalculations
    const { chartData, stationFeatures } = useMemo(() => {
        if (!loaded) return { chartData: [], stationFeatures: [] };

        const stationFeatures = getAllStationFeatures();

        const chartData = stationFeatures
            .filter(station => station.features.rideCount > 0) // Only show stations with activity
            .map(station => ({
                station: station.stationName.length > 15 ?
                    station.stationName.substring(0, 15) + '...' :
                    station.stationName,
                averageDelay: Math.round(station.features.averageDelay * 10) / 10,
                rideCount: station.features.rideCount,
                maxDelay: station.features.maxDelay,
                minDelay: station.features.minDelay,
                punctualityRate: Math.round(station.features.punctualityRate * 10) / 10,
                currentDelay: station.features.currentDelay,
            }))
            .sort((a, b) => b.averageDelay - a.averageDelay) // Sort by average delay descending
            .slice(0, 10); // Top 10 stations

        return { chartData, stationFeatures };
    }, [loaded, getAllStationFeatures]); // Include actual data dependencies

    return (
        <div className="analytics-card chart-card">
            <div className="analytics-header">
                <h3 className="analytics-title">Average Delay by Station</h3>
                <div className="analytics-time">{currentTime}</div>
            </div>

            <div className="chart-container">
                {loaded && chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis
                                dataKey="station"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                fontSize={12}
                                stroke="#666"
                            />
                            <YAxis
                                label={{ value: 'Delay (min)', angle: -90, position: 'insideLeft' }}
                                fontSize={12}
                                stroke="#666"
                            />
                            <Tooltip
                                formatter={(value: number, name: string) => [
                                    `${value.toFixed(1)} min`,
                                    name === 'averageDelay' ? 'Average Delay' : name
                                ]}
                                labelFormatter={(label) => {
                                    const stationData = chartData.find(s => s.station === label);
                                    return `Station: ${label}
Rides: ${stationData?.rideCount || 0}
Current Delay: ${stationData?.currentDelay || 0} min
Max Delay: ${stationData?.maxDelay || 0} min
Punctuality: ${stationData?.punctualityRate || 0}%`;
                                }}
                                contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    whiteSpace: 'pre-line'
                                }}
                            />
                            <Bar
                                dataKey="averageDelay"
                                fill="#e74c3c"
                                radius={[2, 2, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '300px',
                        color: '#666',
                        fontSize: '14px'
                    }}>
                        {loaded ? 'No data available for chart' : 'Loading graph data...'}
                    </div>
                )}
            </div>

            <div className="analytics-footer">
                <div className="metric-detail">
                    Showing top {chartData.length} stations by average delay
                    {stationFeatures.length > 0 && (
                        <div style={{ fontSize: '10px', marginTop: '4px', color: '#888' }}>
                            Total active stations: {stationFeatures.filter(s => s.features.rideCount > 0).length} • Dynamic updates
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}