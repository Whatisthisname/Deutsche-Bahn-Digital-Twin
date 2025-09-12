import MainStats from "../../components/MainStats";

export default function VisualisationsPage() {
    return (
        <div className="page visualisations-page">
            {/* Main Stats */}
            <MainStats />
            <div className="visualisations-grid">
                {/* Visualisation 1 */}
                <div className="panel">
                    <h3 className="visualisation-name">Visualisation 1</h3>
                    <div className="visualisation">
                        Visualisation here
                    </div>
                </div>

                {/* Visualisation 2 */}
                <div className="panel">
                    <h3 className="visualisation-name">Visualisation 2</h3>
                    <div className="visualisation">
                        Visualisation here
                    </div>
                </div>

                {/* Visualisation 3 */}
                <div className="panel wide">
                    <h3 className="visualisation-name">Visualisation 3</h3>
                    <div className="visualisation">
                        Visualisation here
                    </div>
                </div>
            </div>
        </div>
    );
}
