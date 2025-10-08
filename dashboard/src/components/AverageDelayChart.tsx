// This one should show a ranked list of stations by their average delay, updated in real-time as the simulation runs.
// I think it currently has an issue with how often it refreshes though.

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { useSimStore } from "@/state/useSimStore";
import { useStationStats } from "@/state/useStationStats"; // ← use the new hook
import { useGraphStructure } from "@/state/useGraphStructure";

type Row = {
    stationId: string;
    stationName: string;
    shortName: string;
    averageDelay: number;
    rideCount: number;
    maxDelay: number;
    minDelay: number;
    punctualityRate: number;
    currentDelay: number;
};

export default function AverageDelayChart() {
    const cursorTs = useSimStore((s) => s.cursorTs);
    const { loaded } = useGraphStructure();
    const { stations } = useStationStats(); // ← reactive array

    const currentTime = cursorTs ? new Date(cursorTs).toLocaleTimeString() : "—";

    // Build chart rows from reactive `stations`
    const { chartData, activeStationsCount } = useMemo(() => {
        if (!loaded) return { chartData: [] as Row[], activeStationsCount: 0 };

        const active = stations.filter((s) => s.features.rideCount > 0);

        const rows: Row[] = active
            .map(({ stationId, stationName, features }) => {
                const short =
                    stationName.length > 15 ? stationName.substring(0, 15) + "..." : stationName;

                return {
                    stationId,
                    stationName,
                    shortName: short,
                    averageDelay: Math.round(features.averageDelay * 10) / 10,
                    rideCount: features.rideCount,
                    maxDelay: features.maxDelay,
                    minDelay: features.minDelay,
                    punctualityRate: Math.round(features.punctualityRate * 10) / 10,
                    currentDelay: features.currentDelay,
                };
            })
            .sort((a, b) => b.averageDelay - a.averageDelay)
            .slice(0, 10);

        return { chartData: rows, activeStationsCount: active.length };
    }, [loaded, stations]);

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
                                dataKey="shortName"
                                angle={-45}
                                textAnchor="end"
                                height={80}
                                fontSize={12}
                                stroke="#666"
                            />
                            <YAxis
                                label={{ value: "Delay (min)", angle: -90, position: "insideLeft" }}
                                fontSize={12}
                                stroke="#666"
                            />
                            <Tooltip
                                formatter={(value: any, name: any) => {
                                    if (name === "averageDelay") return [`${Number(value).toFixed(1)} min`, "Average Delay"];
                                    return [String(value), name];
                                }}
                                labelFormatter={(label: string) => {
                                    // find by shortName
                                    const row = chartData.find((r) => r.shortName === label);
                                    const full = row?.stationName ?? label;
                                    return `Station: ${full}
Rides: ${row?.rideCount ?? 0}
Current Delay: ${row?.currentDelay ?? 0} min
Max Delay: ${row?.maxDelay ?? 0} min
Punctuality: ${row?.punctualityRate ?? 0}%`;
                                }}
                                contentStyle={{
                                    backgroundColor: "white",
                                    border: "1px solid #ccc",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    whiteSpace: "pre-line",
                                }}
                            />
                            <Bar dataKey="averageDelay" fill="#e74c3c" radius={[2, 2, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "300px",
                            color: "#666",
                            fontSize: "14px",
                        }}
                    >
                        {loaded ? "No data available for chart" : "Loading graph data..."}
                    </div>
                )}
            </div>

            <div className="analytics-footer">
                <div className="metric-detail">
                    Showing top {chartData.length} stations by average delay
                    <div style={{ fontSize: "10px", marginTop: "4px", color: "#888" }}>
                        Total active stations: {activeStationsCount} • Dynamic updates
                    </div>
                </div>
            </div>
        </div>
    );
}
