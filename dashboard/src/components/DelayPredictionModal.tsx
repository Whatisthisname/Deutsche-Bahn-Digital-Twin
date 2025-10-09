// This is the popup thing that shows confidence and AI prediciton when you clikc something in the ActiveJourneysList.
// The confidence is just a heuristic right now, and the model itself will be improved by us by training on more data and features.
import type { Journey } from '@/state/useJourneys';
import { getRideTrainName } from '@/utils/rideHelpers';

interface DelayPredictionModalProps {
    ride: Journey | null;
    isOpen: boolean;
    onClose: () => void;
    isLoading: boolean;
}

export default function DelayPredictionModal({
    ride,
    isOpen,
    onClose,
    isLoading
}: DelayPredictionModalProps) {
    if (!isOpen) return null;

    const formatNumber = (num: number, decimals: number = 1) => {
        return num.toFixed(decimals);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>AI Delay Prediction</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div className="modal-body">
                    {ride && (
                        <div className="ride-info">
                            <div className="ride-title">
                                <h3>{getRideTrainName(ride)}</h3>
                                <span className={`ride-status status-${ride.status.toLowerCase()}`}>
                                    {ride.status}
                                </span>
                            </div>

                            <div className="ride-details">
                                <p><strong>Train ID:</strong> {ride.rideId}</p>
                                <p><strong>Final Destination:</strong> {ride.destination}</p>
                                <p><strong>Events:</strong> {ride.eventCount}</p>
                                <p><strong>Started:</strong> {new Date(ride.startTs).toLocaleString()}</p>
                            </div>
                        </div>
                    )}

                    {isLoading && (
                        <div className="loading-state">
                            <div className="loading-spinner"></div>
                            <p>Calculating delay prediction...</p>
                        </div>
                    )}

    
                        <div className="prediction-results">
                            <div className="prediction-main">
                                <div className="prediction-value">
                                    <span className="predicted-number">
                                        {formatNumber(ride?.events[(ride?.events.length)-1].predicted_delay ?? 0)} min
                                    </span>
                                    <span className="prediction-label">Predicted Delay</span>
                                </div>
                            </div>

                            <div className="prediction-context">
                                <h4>Prediction Context</h4>
                                <div className="context-grid">
                                    <div className="context-item">
                                        <span className="context-label">Current Segment:</span>
                                        <span className="context-value">
                                            {ride?.events[ride?.events.length - 1].from_station}
                                        </span>
                                    </div>
                                    <div className="context-item">
                                        <span className="context-label">Event Type:</span>
                                        <span className="context-value">
                                            {ride?.events[ride?.events.length - 1].event_type}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                </div>
            </div>
        </div>
    );
}
