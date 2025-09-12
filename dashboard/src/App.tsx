import { Outlet, Navigate, useLocation, Link } from "react-router-dom";
import { Routes, Route } from "react-router";
import Menu from "./components/Menu";
import MapPage from "@/pages/Map/MapPage";
import VisualisationsPage from "@/pages/Visualisations/VisualisationsPage";

// Main application component that sets up the layout and routing
// Includes a sidebar menu and defines routes for different pages
export default function App() {
    const location = useLocation();

    return (
        <div className="app-shell">
            <Menu activePath={location.pathname} />
            <div className="app-body">
                <Routes>
                    <Route path="/" element={<Navigate to="/map" replace />} />
                    <Route path="/map" element={<MapPage />} />
                    <Route path="/visualisations" element={<VisualisationsPage />} />
                    <Route path="*" element={<div className="p-16">Not found. <Link to="/map">Go to Map</Link></div>} />
                </Routes>
                <Outlet />
            </div>
        </div>
    );
}
