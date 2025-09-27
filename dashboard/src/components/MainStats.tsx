import { useMemo } from "react";
import { useSimStore } from "@/state/useSimStore";
import { useDynamicStationFeatures } from "@/state/useStationFeatures";
import { useActiveRides } from "@/hooks/useStreamingTrainEvents"; // Use new streaming system

export default function MainStats() {
    // const analytics = useCurrentAnalytics();
    const cursorTs = useSimStore(state => state.cursorTs);
    const { getAllStationFeatures } = useDynamicStationFeatures();
    const activeRides = useActiveRides();

    console.log(`🔍 MainStats: Active rides count: ${activeRides.length}`);

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
    }, [getAllStationFeatures]); // Only depend on function reference

    return (
        <div className="main-stats">
            {/* Active Trains */}
            <div className="statistic">
                <div className="statistic-title">Active Trains</div>
                <div className="statistic-value">{activeRides.length}</div>
                <div className="statistic-time">{currentTime}</div>
            </div>

            {/* Average Delay */}
            <div className="statistic">
                <div className="statistic-title">Average Delay</div>
                <div className="statistic-value">{averageDelay.toFixed(1)} min</div>
                <div className="statistic-time">{currentTime}</div>
            </div>

            {/* Punctuality Rate */}
            <div className="statistic">
                <div className="statistic-title">Punctuality Rate</div>
                <div className="statistic-value">{punctualityRate.toFixed(1)}%</div>
                <div className="statistic-time">{currentTime}</div>
            </div>
        </div>
    );
}
