// src/pages/Map/MapPage.tsx
import MainStats from "@/components/MainStats";
import MapView from "./MapView";
import ActiveJourneysList from "@/components/ActiveJourneysList";

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

                {/* Active Rides */}
                <ActiveJourneysList />
            </aside>
        </div>
    );
}
