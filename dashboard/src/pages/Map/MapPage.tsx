// src/pages/Map/MapPage.tsx
import { useEffect } from "react";
import MainStats from "@/components/MainStats";
import MapView from "./MapView";
import ActiveRidesList from "@/components/ActiveRidesList";
import { useGraphStructure } from "@/state/useGraphStructure";

export default function MapPage() {
    const loadGraph = useGraphStructure(s => s.load);

    useEffect(() => { loadGraph(); }, [loadGraph]);

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

                {/* Active Rides */}
                <ActiveRidesList />
            </aside>
        </div>
    );
}
