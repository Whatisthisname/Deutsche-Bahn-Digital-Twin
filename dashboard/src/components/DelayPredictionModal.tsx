import type { Journey } from '@/state/useAggregatedJourneys';
import type { PredictionResult } from '@/lib/mlPrediction';

interface DelayPredictionModalProps {
    ride: Journey | null;
    prediction: PredictionResult | null;
    isOpen: boolean;
    onClose: () => void;
    isLoading: boolean;
}

export default function DelayPredictionModal({
    ride,
    prediction,
    isOpen,
    onClose,
    isLoading
}: DelayPredictionModalProps) {
    if (!isOpen) return null;

    const getConfidenceColor = (confidence: 'low' | 'medium' | 'high') => {
        switch (confidence) {
            case 'high': return '#22c55e'; // green
            case 'medium': return '#f59e0b'; // yellow
            case 'low': return '#ef4444'; // red
        }
    };

    const getConfidenceIcon = (confidence: 'low' | 'medium' | 'high') => {
        switch (confidence) {
            case 'high': return '🟢';
            case 'medium': return '🟡';
            case 'low': return '🔴';
        }
    };

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
                                <h3>Train {ride.rideId}</h3>
                                <span className={`ride-status status-${ride.status.toLowerCase()}`}>
                                    {ride.status}
                                </span>
                            </div>

                            <div className="ride-details">
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

                    {prediction && !isLoading && (
                        <div className="prediction-results">
                            <div className="prediction-main">
                                <div className="prediction-value">
                                    <span className="predicted-number">
                                        {formatNumber(prediction.predictedDelay)} min
                                    </span>
                                    <span className="prediction-label">Predicted Delay</span>
                                </div>

                                <div className="prediction-confidence">
                                    <span className="confidence-icon">
                                        {getConfidenceIcon(prediction.confidence)}
                                    </span>
                                    <span
                                        className="confidence-text"
                                        style={{ color: getConfidenceColor(prediction.confidence) }}
                                    >
                                        {prediction.confidence.toUpperCase()} CONFIDENCE
                                    </span>
                                </div>
                            </div>

                            <div className="prediction-context">
                                <h4>Prediction Context</h4>
                                <div className="context-grid">
                                    <div className="context-item">
                                        <span className="context-label">Past Delay:</span>
                                        <span className="context-value">
                                            {formatNumber(prediction.context.pastDelay)} min
                                        </span>
                                    </div>
                                    <div className="context-item">
                                        <span className="context-label">Current Segment:</span>
                                        <span className="context-value">
                                            {prediction.context.currentEvent.from_station} → {prediction.context.currentEvent.to_station}
                                        </span>
                                    </div>
                                    <div className="context-item">
                                        <span className="context-label">Distance:</span>
                                        <span className="context-value">
                                            {formatNumber(prediction.context.distance)} km
                                        </span>
                                    </div>
                                    <div className="context-item">
                                        <span className="context-label">Event Type:</span>
                                        <span className="context-value">
                                            {prediction.context.currentEvent.event_type}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="prediction-disclaimer">
                                <p>
                                    <strong>⚡ AI Prediction</strong> - This prediction is based on historical patterns
                                    and may not reflect real-time conditions. Always refer to official sources for
                                    current train status.
                                </p>
                            </div>
                        </div>
                    )}

                    {!prediction && !isLoading && ride && (
                        <div className="error-state">
                            <div className="error-icon">⚠️</div>
                            <p>Unable to generate prediction</p>
                            <p className="error-subtext">
                                This ride may not have enough events or required data for prediction.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
