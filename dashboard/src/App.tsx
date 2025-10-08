import { Outlet, Navigate, useLocation } from "react-router-dom";
import { Routes, Route } from "react-router";
import { useEffect } from "react";
import Menu from "./components/Menu";
import MapPage from "@/pages/Map/MapPage";
import VisualisationsPage from "@/pages/Visualisations/VisualisationsPage";
import RawDataPage from "./pages/RawData/RawDataPage";
import DataLoader from "./components/DataLoader";
import { useGraphStructure } from "@/state/useGraphStructure";

// Main application component that sets up the layout and routing
// Includes a sidebar menu and defines routes for different pages
export default function App() {
    const location = useLocation();
    const loadGraph = useGraphStructure(s => s.load);

    // Load graph structure on app startup
    useEffect(() => {
        loadGraph();
    }, [loadGraph]);

    return (
        <div className="app-shell">
            <Menu activePath={location.pathname} />
            <div className="app-body">
                <DataLoader /> {/* loads CSV + sets timeline range */}

                <Routes>
                    <Route path="/" element={<Navigate to="/map" replace />} />
                    <Route path="/map" element={<MapPage />} />
                    <Route path="/visualisations" element={<VisualisationsPage />} />
                    <Route path="/raw-data" element={<RawDataPage />} />
                </Routes>
                <Outlet />
            </div>
        </div>
    );
}
