
import { useState } from 'react';
import { useSimStore } from "@/state/useSimStore";
import { useEventStream } from "@/state/useEventStream";
import { useAllJourneys } from "@/state/useAggregatedJourneys";
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
    onRideSelect,
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
    const getAllRides = useAllJourneys(processedEvents, currentTime);

    // Get graph structure for ML predictions
    const { graph } = useGraphStructure();

    // Combine all rides with their status using useMemo for proper reactivity
    const allRides = useMemo((): Journey[] => {
        let combined = getAllRides;

        // Filter to active only if requested
        if (activeOnly) {
            combined = combined.filter(ride => ride.status === "ACTIVE");
        }

        // Sort by start time (newest first)
        combined = combined.sort((a, b) => b.startTs - a.startTs);

        // Apply maxItems limit if specified
        if (maxItems && maxItems > 0) {
            combined = combined.slice(0, maxItems);
        }

        return combined;
    }, [getAllRides, activeOnly, maxItems]);



    const title = activeOnly ? "Active Rides" : "All Rides";

    const handleRideClick = async (ride: Journey) => {
        // Call the original handler if provided
        if (onRideSelect) {
            onRideSelect(ride);
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

    if (allRides.length === 0) {
        return (
            <div className={`panel activeRides ${className || ''}`}>
                <h3>{title}</h3>
                <div className="no-rides">
                    <p>No rides at this time</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`panel activeRides ${className || ''}`}>
            <h3>{title} ({allRides.length})</h3>
            <div className="rides-list">
                {allRides.map((ride) => (
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
