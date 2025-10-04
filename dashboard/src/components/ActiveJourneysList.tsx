
import { useState } from 'react';
import { useSimStore } from "@/state/useSimStore";
import { useEventStream } from "@/state/useEventStream";
import { useActiveJourneys, useFinishedJourneys, useCanceledJourneys } from "@/state/useAggregatedJourneys";
import { useMemo } from 'react';
import type { Journey } from "@/state/useAggregatedJourneys";
import type { ActiveJourneysListProps } from "@/types/components";
import { getRideStatusColor as getJourneyStatusColor, formatRideTime, getRideStartStation, getRideEndStation, getRideDurationMinutes } from "@/utils/rideHelpers";
import { useGraphStructure } from "@/state/useGraphStructure";
import { predictNextDelay, type PredictionResult } from "@/lib/mlPrediction";
import DelayPredictionModal from "./DelayPredictionModal";

export default function ActiveJourneysList({
    maxItems,
    showStatus = true,
    showDuration = true,
    className,
    onJourneySelect,
    activeOnly = false
}: Partial<ActiveJourneysListProps> = {}) {
    // Prediction modal state
    const [predictionModal, setPredictionModal] = useState<{
        isOpen: boolean;
        ride: Journey | null;
        prediction: PredictionResult | null;
        isLoading: boolean;
    }>({
        isOpen: false,
        ride: null,
        prediction: null,
        isLoading: false
    });

    // Force re-renders when simulation time changes
    useSimStore(state => state.cursorTs);

    // Get processed events and compute rides on-demand
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(state => state.cursorTs) ?? 0;

    // Get journeys by status
    const activeJourneys = useActiveJourneys(processedEvents, currentTime);
    const finishedJourneys = useFinishedJourneys(processedEvents, currentTime);
    const canceledJourneys = useCanceledJourneys(processedEvents, currentTime);

    // Get graph structure for ML predictions
    const { graph } = useGraphStructure();

    // Process and sort each journey type
    const processedActiveJourneys = useMemo((): Journey[] => {
        let journeys = [...activeJourneys];
        journeys = journeys.sort((a, b) => b.startTs - a.startTs);
        if (maxItems && maxItems > 0) {
            journeys = journeys.slice(0, maxItems);
        }
        return journeys;
    }, [activeJourneys, maxItems]);

    const processedFinishedJourneys = useMemo((): Journey[] => {
        let journeys = [...finishedJourneys];
        journeys = journeys.sort((a, b) => b.startTs - a.startTs);
        if (maxItems && maxItems > 0) {
            journeys = journeys.slice(0, maxItems);
        }
        return journeys;
    }, [finishedJourneys, maxItems]);

    const processedCanceledJourneys = useMemo((): Journey[] => {
        let journeys = [...canceledJourneys];
        journeys = journeys.sort((a, b) => b.startTs - a.startTs);
        if (maxItems && maxItems > 0) {
            journeys = journeys.slice(0, maxItems);
        }
        return journeys;
    }, [canceledJourneys, maxItems]);



    const handleRideClick = async (ride: Journey) => {
        // Call the original handler if provided
        if (onJourneySelect) {
            onJourneySelect(ride);
        }

        // Open ML prediction modal
        if (graph) {
            setPredictionModal({
                isOpen: true,
                ride,
                prediction: null,
                isLoading: true
            });

            try {
                const prediction = predictNextDelay(ride.events, graph);
                setPredictionModal(prev => ({
                    ...prev,
                    prediction,
                    isLoading: false
                }));
            } catch (error) {
                console.error('Prediction failed:', error);
                setPredictionModal(prev => ({
                    ...prev,
                    prediction: null,
                    isLoading: false
                }));
            }
        } else {
            console.warn('Graph not loaded, cannot make prediction');
        }
    };

    const closePredictionModal = () => {
        setPredictionModal({
            isOpen: false,
            ride: null,
            prediction: null,
            isLoading: false
        });
    };

    // Helper function to render a journey list
    const renderJourneyList = (journeys: Journey[], title: string, emptyMessage: string) => {
        if (journeys.length === 0) {
            return (
                <div className="journey-section">
                    <h4>{title}</h4>
                    <div className="no-rides">
                        <p>{emptyMessage}</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="journey-section">
                <h4>{title} ({journeys.length})</h4>
                <div className="rides-list">
                    {journeys.map((ride) => (
                        <div
                            key={ride.rideId}
                            className="ride-item clickable"
                            onClick={() => handleRideClick(ride)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="ride-line-1">
                                <div className="ride-id">{ride.rideId}</div>
                                <div className="ml-prediction-indicator">🤖 AI</div>
                                {showStatus && (
                                    <div
                                        className="ride-status"
                                        style={{ color: getJourneyStatusColor(ride.status) }}
                                    >
                                        {ride.status}
                                    </div>
                                )}
                            </div>

                            <div className="ride-line-2">
                                <div className="ride-route">
                                    <span className="start-station">{getRideStartStation(ride)}</span>
                                    <span className="route-separator">→</span>
                                    <span className="end-station">{getRideEndStation(ride)}</span>
                                </div>
                                <div className="ride-times">
                                    <span className="time-value">{formatRideTime(ride.startTs)}</span>
                                    <span className="time-separator">→</span>
                                    <span className="time-value">{ride.endTs ? formatRideTime(ride.endTs) : 'Ongoing'}</span>
                                    {showDuration && ride.endTs && (
                                        <span className="duration">({getRideDurationMinutes(ride.startTs, ride.endTs)}min)</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // If activeOnly prop is used, show only active journeys in old format for backward compatibility
    if (activeOnly) {
        if (processedActiveJourneys.length === 0) {
            return (
                <div className={`panel activeRides ${className || ''}`}>
                    <h3>Active Rides</h3>
                    <div className="no-rides">
                        <p>No active rides at this time</p>
                    </div>
                </div>
            );
        }

        return (
            <div className={`panel activeRides ${className || ''}`}>
                <h3>Active Rides ({processedActiveJourneys.length})</h3>
                <div className="rides-list">
                    {processedActiveJourneys.map((ride) => (
                        <div
                            key={ride.rideId}
                            className="ride-item clickable"
                            onClick={() => handleRideClick(ride)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="ride-line-1">
                                <div className="ride-id">{ride.rideId}</div>
                                <div className="ml-prediction-indicator">🤖 AI</div>
                                {showStatus && (
                                    <div
                                        className="ride-status"
                                        style={{ color: getJourneyStatusColor(ride.status) }}
                                    >
                                        {ride.status}
                                    </div>
                                )}
                            </div>

                            <div className="ride-line-2">
                                <div className="ride-route">
                                    <span className="start-station">{getRideStartStation(ride)}</span>
                                    <span className="route-separator">→</span>
                                    <span className="end-station">{getRideEndStation(ride)}</span>
                                </div>
                                <div className="ride-times">
                                    <span className="time-value">{formatRideTime(ride.startTs)}</span>
                                    <span className="time-separator">→</span>
                                    <span className="time-value">{ride.endTs ? formatRideTime(ride.endTs) : 'Ongoing'}</span>
                                    {showDuration && ride.endTs && (
                                        <span className="duration">({getRideDurationMinutes(ride.startTs, ride.endTs)}min)</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ML Prediction Modal */}
                <DelayPredictionModal
                    ride={predictionModal.ride}
                    prediction={predictionModal.prediction}
                    isOpen={predictionModal.isOpen}
                    onClose={closePredictionModal}
                    isLoading={predictionModal.isLoading}
                />
            </div>
        );
    }

    // Show all three lists (default behavior)
    const totalJourneys = processedActiveJourneys.length + processedFinishedJourneys.length + processedCanceledJourneys.length;

    return (
        <div className={`panel activeRides ${className || ''}`}>
            {/* <h3>Journey Status Overview ({totalJourneys} total)</h3> */}

            {/* Active Journeys */}
            {renderJourneyList(processedActiveJourneys, "Active Journeys", "No active journeys at this time")}

            {/* Finished Journeys */}
            {renderJourneyList(processedFinishedJourneys, "Finished Journeys", "No finished journeys at this time")}

            {/* Canceled Journeys */}
            {renderJourneyList(processedCanceledJourneys, "Canceled Journeys", "No canceled journeys at this time")}

            {/* ML Prediction Modal */}
            <DelayPredictionModal
                ride={predictionModal.ride}
                prediction={predictionModal.prediction}
                isOpen={predictionModal.isOpen}
                onClose={closePredictionModal}
                isLoading={predictionModal.isLoading}
            />
        </div>
    );
}
