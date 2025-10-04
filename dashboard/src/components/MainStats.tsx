import { allCanceledRideRate, useActiveJourneys } from "@/hooks/useStreamingTrainEvents";
import { useStationStats } from "@/state/useStationStats";
import type { MainStatsProps } from "@/types/components";

export default function MainStats({
    className,
    showDetails = false,
}: Partial<MainStatsProps> = {}) {
    const { stats } = useStationStats();
    const activeRides = useActiveJourneys();

    const canceledRate = allCanceledRideRate();

    return (
        <div className={`main-stats ${className || ""}`}>
            <div className="statistic">
                <div className="statistic-title">Active Trains</div>
                <div className="statistic-value">{activeRides.length}</div>
            </div>

            <div className="statistic">
                <div className="statistic-title">Average Delay</div>
                <div className="statistic-value">{stats.averageDelay.toFixed(1)} min</div>
            </div>

            <div className="statistic">
                <div className="statistic-title">Punctuality Rate</div>
                <div className="statistic-value">{stats.punctualityRate.toFixed(1)}%</div>
            </div>

            <div className="statistic">
                <div className="statistic-title">Cancel Rate</div>
                <div className="statistic-value">{canceledRate.toFixed(1)}%</div>
            </div>

            {showDetails && (
                <div className="statistic-details">
                    <div className="detail-item">Total Stations: {stats.totalStations}</div>
                    <div className="detail-item">Active Stations: {stats.activeStationsCount}</div>
                    <div className="detail-item">Total Rides: {stats.totalJourneys}</div>
                    <div className="detail-item">Punctual Rides: {stats.punctualJourneys}</div>
                </div>
            )}
        </div>
    );
}
