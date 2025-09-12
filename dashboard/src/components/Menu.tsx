import { Link } from "react-router-dom";
import ReplayControls from "./ReplayControls";
import Timeline from "./Timeline";

type Props = { activePath: string };

export default function Menu({ activePath }: Props) {
    return (
        <header className="menu">
            {/* Navigation */}
            <div className="menu-left">
                <div className="logo"><img src="/assets/logo.svg" alt="DB Twin" /><span>Twin</span></div>
                <nav className="tabs">
                    <Link className={activePath.startsWith("/map") ? "tab active" : "tab"} to="/map">Map</Link>
                    <Link className={activePath.startsWith("/visualisations") ? "tab active" : "tab"} to="/visualisations">Visualisations</Link>
                </nav>
            </div>

            {/* Timeline */}
            <div className="menu-center">
                <Timeline />
            </div>

            {/* Replay controls */}
            <div className="menu-right">
                <ReplayControls />
            </div>
        </header>
    );
}
