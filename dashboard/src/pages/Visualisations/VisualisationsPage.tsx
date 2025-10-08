import MainStats from "../../components/MainStats";
import DelayAccuracy from "@/components/ValidationChart";
import TopBusiestStations from "@/components/BusiestStations";
import JourneyStatusPieChart from "@/components/JourneyStatusPieChart";
import AverageDelayChart from "@/components/AverageDelayChart";

import TrainActivityPerHour from "@/components/TrainActivityPerHour";
import DelayBetweenStations from "@/components/DelayBetweenStations";

export default function VisualisationsPage() {

    return (
        <div className="page visualisations-page">
            {/* Main Stats */}
            <MainStats />
            <div className="visualisations-grid">
                {/* Average Delay Chart */}

                <div className="panel wide">
                    <DelayAccuracy />
                </div>

                <div className="panel wide">
                    <TopBusiestStations />
                </div>

                <div className="panel wide">
                    <TrainActivityPerHour />
                </div>

                <div className="panel wide">
                    <JourneyStatusPieChart />
                </div>

                <div className="panel wide">
                    <AverageDelayChart />
                </div>

                <div className="panel wide">
                    <DelayBetweenStations />
                </div>

                {/* Placeholder for future visualizations */}
            </div>
        </div>
    );
}
