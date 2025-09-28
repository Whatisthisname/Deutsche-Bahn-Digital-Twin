import { useMemo } from "react";
import { useSimStore } from "@/state/useSimStore";
import { useDynamicStationFeatures } from "@/state/useStationFeatures";
import { useActiveRides } from "@/hooks/useStreamingTrainEvents"; // Use new streaming system
import type { MainStatsProps } from "@/types/components";

export default function MainStats({
    showCurrentTime = true,
    className,
    showDetails = false
}: Partial<MainStatsProps> = {}) {
    // const analytics = useCurrentAnalytics();
    const cursorTs = useSimStore(state => state.cursorTs);
    const { getAllStationFeatures } = useDynamicStationFeatures();
    const activeRides = useActiveRides();


    const currentTime = cursorTs ? new Date(cursorTs).toLocaleTimeString() : '—';

    // Memoize dynamic statistics calculation
    const { averageDelay, punctualityRate } = useMemo(() => {
        const stationFeatures = getAllStationFeatures();
        const activeStations = stationFeatures.filter(s => s.features.rideCount > 0);

        const totalDelaySum = activeStations.reduce((sum, s) => sum + s.features.totalDelaySum, 0);
        const totalRides = activeStations.reduce((sum, s) => sum + s.features.rideCount, 0);
        const avgDelay = totalRides > 0 ? totalDelaySum / totalRides : 0;

        const punctualRides = activeStations.reduce((sum, s) =>
            sum + Math.max(0, s.features.rideCount - Math.max(0, s.features.averageDelay)), 0);
        const punctRate = totalRides > 0 ? (punctualRides / totalRides) * 100 : 0;

        return { averageDelay: avgDelay, punctualityRate: punctRate };
    }, [getAllStationFeatures]); // Function reference changes when data updates

    return (
        <div className={`main-stats ${className || ''}`}>
            {/* Active Trains */}
            <div className="statistic">
                <div className="statistic-title">Active Trains</div>
                <div className="statistic-value">{activeRides.length}</div>
                {showCurrentTime && <div className="statistic-time">{currentTime}</div>}
            </div>

            {/* Average Delay */}
            <div className="statistic">
                <div className="statistic-title">Average Delay</div>
                <div className="statistic-value">{averageDelay.toFixed(1)} min</div>
                {showCurrentTime && <div className="statistic-time">{currentTime}</div>}
            </div>

            {/* Punctuality Rate */}
            <div className="statistic">
                <div className="statistic-title">Punctuality Rate</div>
                <div className="statistic-value">{punctualityRate.toFixed(1)}%</div>
                {showCurrentTime && <div className="statistic-time">{currentTime}</div>}
            </div>

            {showDetails && (
                <div className="statistic-details">
                    <div className="detail-item">
                        <span>Total Stations: {getAllStationFeatures().length}</span>
                    </div>
                    <div className="detail-item">
                        <span>Active Stations: {getAllStationFeatures().filter(s => s.features.rideCount > 0).length}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
