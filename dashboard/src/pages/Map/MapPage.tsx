import MainStats from "@/components/MainStats";
import MapView from "./MapView";

export default function MapPage() {
    return (
        <div className="page map-page">
            {/* Map */}
            <section className="map-panel">
                <MapView />
            </section>

            <aside className="side-panel">
                {/* Main Stats */}
                <MainStats />

                {/* Filters */}
                <div className="panel">
                    <h3>Filters</h3>
                    <div>Add filters here.</div>
                </div>

                {/* Predictors */}
                <div className="panel">
                    <h3>Predictors</h3>
                    <div>Add predictors here.</div>
                </div>
            </aside>
        </div>
    );
}
