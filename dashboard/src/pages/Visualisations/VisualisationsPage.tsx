import MainStats from "../../components/MainStats";
import DelayAccuracy from "@/components/ValidationChart";
import TopBusiestStations from "@/components/BusiestStations";
import TrainActivityPerHour from "@/components/TrainActivityPerHour";
import JourneyStatusPieChart from "@/components/JourneyStatusPieChart";
import AverageDelayChart from "@/components/AverageDelayChart";

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

                {/* Placeholder for future visualizations */}
                <div className="panel">
                    <h3 className="visualisation-name">More Visualizations Coming Soon</h3>
                    <div className="visualisation">
                        Additional charts and analytics will be added here...
                    </div>
                </div>
            </div>
        </div>
    );
}
