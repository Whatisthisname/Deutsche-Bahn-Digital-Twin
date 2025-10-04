// ML Prediction utilities for train delay prediction
import type { JourneyEvent } from '@/types/ride';
import type { GraphStructure } from '@/state/useGraphStructure';

// Import ML model function from JS file
import { score } from './mlModel.js';

export interface ModelInput {
    event_type: number;
    expected_next_event_time: [number, number, number, number, number];
    timestamp: [number, number, number, number, number];
    delay_min: number;
    from_station: number;
    to_station: number;
    station_num: number;
    distance: number;
}

export interface PredictionResult {
    predictedDelay: number;
    confidence: 'low' | 'medium' | 'high';
    context: {
        currentEvent: JourneyEvent;
        pastDelay: number;
        distance: number;
        hasNextEvent: boolean;
    };
}

/**
 * Convert datetime to normalized features as per Python implementation
 */
function datetimeFeatureMap(time: Date): [number, number, number, number, number] {
    const month = time.getMonth() + 1; // getMonth() returns 0-11, we want 1-12
    const day = time.getDate();
    const hour = time.getHours();
    const minute = time.getMinutes();
    const second = time.getSeconds();

    return [
        month / 12,
        day / 31,
        hour / 23,
        minute / 59,
        second / 59
    ];
}

/**
 * Calculate delay between events in minutes
 */
function calculateDelayMinutes(currentEvent: JourneyEvent, pastEvent: JourneyEvent | null): number {
    if (pastEvent === null) {
        return 0.0; // No previous event
    }

    const currentTime = new Date(currentEvent.timestamp).getTime();
    const pastExpectedTime = pastEvent.expected_next_event_time
        ? new Date(pastEvent.expected_next_event_time).getTime()
        : currentTime;

    return (currentTime - pastExpectedTime) / (1000 * 60); // Convert to minutes
}

/**
 * Find edge distance between stations
 */
function findEdgeDistance(
    fromStationName: string,
    toStationName: string,
    graph: GraphStructure
): number {
    const fromStationId = graph.stationNameToId[fromStationName];
    const toStationId = graph.stationNameToId[toStationName];

    if (fromStationId === undefined || toStationId === undefined) {
        throw new Error(`Station not found: ${fromStationName} or ${toStationName}`);
    }

    // Find the edge between stations (order doesn't matter)
    const edge = graph.edges.find(edge => {
        const [edgeFrom, edgeTo] = edge;
        return (
            (String(fromStationId) === String(edgeFrom) && String(toStationId) === String(edgeTo)) ||
            (String(fromStationId) === String(edgeTo) && String(toStationId) === String(edgeFrom))
        );
    });

    if (!edge) {
        throw new Error(`No edge found between ${fromStationName} and ${toStationName}`);
    }

    return edge[2]; // Distance is the third element in the edge quadruple
}

/**
 * Convert JourneyEvent to ModelInput format
 */
function toModelInput(
    currentEvent: JourneyEvent,
    pastEvent: JourneyEvent | null,
    graph: GraphStructure,
    stationNameToNewId: { [key: string]: number }
): ModelInput {
    // Map event type to numeric value
    const eventTypeMap = {
        'DEPARTURE': 1.0,
        'ARRIVAL': 0.0,
        'CANCELLATION': -1.0
    };
    const mappedValue = eventTypeMap[currentEvent.event_type] ?? 0.0;

    // Calculate delay from past event
    const delayMin = calculateDelayMinutes(currentEvent, pastEvent);

    // Convert timestamps to feature vectors
    const currentTime = new Date(currentEvent.timestamp);
    const expectedTime = currentEvent.expected_next_event_time
        ? new Date(currentEvent.expected_next_event_time)
        : currentTime;

    const timestampFeatures = datetimeFeatureMap(currentTime);
    const expectedTimeFeatures = datetimeFeatureMap(expectedTime);

    // Find station mappings
    const fromStationId = stationNameToNewId[currentEvent.from_station];
    const toStationId = stationNameToNewId[currentEvent.to_station];

    // Find edge distance
    const distance = findEdgeDistance(currentEvent.from_station, currentEvent.to_station, graph);

    return {
        event_type: mappedValue,
        expected_next_event_time: expectedTimeFeatures,
        timestamp: timestampFeatures,
        delay_min: delayMin,
        from_station: fromStationId,
        to_station: toStationId,
        station_num: currentEvent.station_num,
        distance
    };
}

/**
 * Flatten ModelInput to the 16-element array expected by the ML model
 */
function flattenModelInput(input: ModelInput): number[] {
    return [
        input.event_type,
        ...input.expected_next_event_time,
        ...input.timestamp,
        input.delay_min,
        input.from_station,
        input.to_station,
        input.station_num,
        input.distance
    ];
}

/**
 * Determine confidence level based on prediction characteristics
 */
function assessPredictionConfidence(predictedDelay: number, modelInput: ModelInput): 'low' | 'medium' | 'high' {
    // Simple heuristics for confidence assessment
    const distance = modelInput.distance;
    const pastDelay = modelInput.delay_min;
    const stationNum = modelInput.station_num;

    let confidence: 'low' | 'medium' | 'high' = 'medium';

    // High confidence: short distance, low past delay, early in journey
    if (distance < 50 && pastDelay < 5 && stationNum < 10) {
        confidence = 'high';
    }
    // Low confidence: very long distance, high past delay, late in journey
    else if (distance > 200 || pastDelay > 30 || stationNum > 20) {
        confidence = 'low';
    }

    // Consider predicted delay magnitude in confidence
    if (Math.abs(predictedDelay) > 60) {
        confidence = 'low'; // Very extreme predictions have lower confidence
    }

    return confidence;
}

/**
 * Make prediction for an ongoing train journey
 * @param events Sorted journey events
 * @param graph Graph structure with stations and edges
 * @returns Prediction result or null if prediction cannot be made
 */
export function predictNextDelay(
    events: JourneyEvent[],
    graph: GraphStructure
): PredictionResult | null {
    if (events.length < 2) {
        return null; // Need at least 2 events for prediction
    }

    // Ensure events are sorted chronologically
    const sortedEvents = [...events].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Create station name to normalized ID mapping (same as Python)
    const stationNames = Object.keys(graph.stationNameToId);
    const stationNameToNewId: { [key: string]: number } = {};
    stationNames.forEach((name, index) => {
        stationNameToNewId[name] = index / stationNames.length;
    });

    // Use the most recent event as current, previous as past
    const currentEvent = sortedEvents[sortedEvents.length - 1];
    const pastEvent = sortedEvents.length >= 2 ? sortedEvents[sortedEvents.length - 2] : null;

    // Debug logging to check what's happening
    console.log('Predicting for ride with events:', sortedEvents.length);
    console.log('Current event:', currentEvent.event_type, 'at', currentEvent.from_station, '→', currentEvent.to_station);
    console.log('Expected next time:', currentEvent.expected_next_event_time);

    if (currentEvent.expected_next_event_time === undefined || currentEvent.expected_next_event_time === null) {
        console.log('Cannot predict: missing expected_next_event_time');
        return null; // Cannot predict without expected next event time
    }

    try {
        // Convert to model input
        const modelInput = toModelInput(currentEvent, pastEvent, graph, stationNameToNewId);

        // Flatten and predict
        const inputArray = flattenModelInput(modelInput);
        const predictedDelay = score(inputArray);

        // Assess confidence
        const confidence = assessPredictionConfidence(predictedDelay, modelInput);

        // Get edge distance for context
        const distance = findEdgeDistance(currentEvent.from_station, currentEvent.to_station, graph);

        return {
            predictedDelay,
            confidence,
            context: {
                currentEvent,
                pastDelay: modelInput.delay_min,
                distance,
                hasNextEvent: true
            }
        };
    } catch (error) {
        console.error('Prediction error:', error);
        return null;
    }
}
