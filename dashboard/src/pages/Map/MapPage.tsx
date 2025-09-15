// src/pages/Map/MapPage.tsx
import {useEffect} from "react";
import MainStats from "@/components/MainStats";
import MapView from "./MapView";
import {useStations} from "@/state/useStations";
import {useTrainEvents} from "@/state/useTrainEvents";

export default function MapPage() {
  const loadStations = useStations(s => s.load);
  const loadEvents   = useTrainEvents(s => s.loadEvents);
  const hasEvents    = useTrainEvents(s => s.allEvents.length > 0);

  useEffect(() => { loadStations(); }, [loadStations]);
  useEffect(() => {
    if (!hasEvents) loadEvents("/src/data/ice.csv"); // adjust path if needed
  }, [hasEvents, loadEvents]);

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
