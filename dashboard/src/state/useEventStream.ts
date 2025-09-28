// state/useEventStream.ts
import { create } from "zustand";
import Papa from "papaparse";
import { useSimStore } from "./useSimStore";
import { coalesceTime, TIME_CONSTANTS } from "@/utils/time";
import type { JourneyEvent } from "@/types/ride";

/** Raw CSV row - using JourneyEvent for better type safety */
type TrainEvent = JourneyEvent;

/** Event stream state */
type EventStreamState = {
    // Data
    allEvents: TrainEvent[];
    processedEvents: TrainEvent[];

    // Stream control
    isStreaming: boolean;
    isCatchingUp: boolean;
    pollingInterval: number; // Always 1 second
    timeIncrementPerSecond: number; // 15 minutes per second at 1x speed

    // Actions
    loadAllEvents: (url: string) => Promise<void>;
    startStreaming: () => void;
    stopStreaming: () => void;
    catchUpToTime: (targetTime: number) => Promise<void>;
    resetToTime: (targetTime: number) => void;

    // Internal state
    _currentEventIndex: number;
    _pollingTimer: NodeJS.Timeout | null;
};

export const useEventStream = create<EventStreamState>((set, get) => ({
    allEvents: [],
    processedEvents: [],
    isStreaming: false,
    isCatchingUp: false,
    pollingInterval: TIME_CONSTANTS.POLLING_INTERVAL_MS, // Always 1 second
    timeIncrementPerSecond: TIME_CONSTANTS.TIME_INCREMENT_PER_SECOND_MS, // 15 minutes per second at 1x speed
    _currentEventIndex: 0,
    _pollingTimer: null,

    loadAllEvents: async (url: string) => {
        const state = get();
        if (state.allEvents.length > 0) return;

        const resp = await fetch(url);
        const text = await resp.text();
        const { data } = Papa.parse<TrainEvent>(text, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
        });

        // Keep only truthy rows and sort globally by time (ascending)
        const rows = (data as TrainEvent[])
            .filter(Boolean)
            .sort(
                (a, b) =>
                    (coalesceTime(a) ?? 0) -
                    (coalesceTime(b) ?? 0)
            );

        set({
            allEvents: rows,
            processedEvents: [],
            _currentEventIndex: 0
        });
    },

    startStreaming: () => {
        const state = get();
        if (state.isStreaming || state._pollingTimer) return;

        set({ isStreaming: true });

        const poll = () => {
            const { isStreaming } = get();
            if (!isStreaming) return;

            // Get current simulation time (don't advance it - let Timeline handle that)
            const simState = useSimStore.getState();
            const currentTime = simState.cursorTs ?? 0;
            const isPlaying = simState.isPlaying ?? false;

            // Don't process events when paused
            if (!isPlaying) {
                // Schedule next poll anyway to check again later
                const timer = setTimeout(poll, state.pollingInterval);
                set({ _pollingTimer: timer });
                return;
            }

            // Process events that should now be visible
            const { allEvents, _currentEventIndex } = get();
            let eventsToProcess = 0;

            for (let i = _currentEventIndex; i < allEvents.length; i++) {
                const event = allEvents[i];
                const eventTime = coalesceTime(event) ?? 0;

                if (eventTime <= currentTime) {
                    eventsToProcess++;
                } else {
                    break;
                }
            }

            if (eventsToProcess > 0) {
                // Get simulation state to check if we're scrubbing
                const simState = useSimStore.getState();
                const isScrubbing = simState.isScrubbing ?? false;

                // During normal streaming: process ALL events (no batch limit)
                // During catch-up (scrubbing): process in batches to prevent UI freezing
                const batchSize = isScrubbing ? Math.min(eventsToProcess, 200) : eventsToProcess;

                const eventsToAdd = [];

                for (let i = 0; i < batchSize; i++) {
                    const event = allEvents[state._currentEventIndex + i];
                    if (event) {
                        eventsToAdd.push(event);
                    }
                }

                if (eventsToAdd.length > 0) {
                    // Update state once with all new events
                    const newProcessedEvents = [...state.processedEvents, ...eventsToAdd];
                    set({
                        processedEvents: newProcessedEvents,
                        _currentEventIndex: state._currentEventIndex + eventsToAdd.length
                    });
                }

            }

            // Schedule next poll
            const timer = setTimeout(poll, state.pollingInterval);
            set({ _pollingTimer: timer });
        };

        // Start polling immediately
        poll();
    },

    stopStreaming: () => {
        const state = get();

        if (state._pollingTimer) {
            clearTimeout(state._pollingTimer);
        }

        set({
            isStreaming: false,
            _pollingTimer: null
        });
    },

    catchUpToTime: async (targetTime: number) => {
        const state = get();

        set({ isCatchingUp: true });

        try {
            const { allEvents, _currentEventIndex } = state;
            const batchSize = 50; // Process up to 50 events per batch
            let currentIndex = _currentEventIndex;
            let processedCount = 0;

            // Process events in batches until we reach the target time
            while (currentIndex < allEvents.length) {
                const batchEndIndex = Math.min(currentIndex + batchSize, allEvents.length);
                const batch = allEvents.slice(currentIndex, batchEndIndex);

                // Check if any event in this batch exceeds our target time
                const batchExceedsTarget = batch.some(event => {
                    const eventTime = coalesceTime(event) ?? 0;
                    return eventTime > targetTime;
                });

                if (batchExceedsTarget) {
                    // Process only events up to the target time
                    const eventsUpToTarget = batch.filter(event => {
                        const eventTime = coalesceTime(event) ?? 0;
                        return eventTime <= targetTime;
                    });

                    if (eventsUpToTarget.length > 0) {
                        const newProcessedEvents = [...state.processedEvents, ...eventsUpToTarget];
                        set({
                            processedEvents: newProcessedEvents,
                            _currentEventIndex: currentIndex + eventsUpToTarget.length
                        });
                        processedCount += eventsUpToTarget.length;
                    }
                    break;
                } else {
                    // Process the entire batch
                    const newProcessedEvents = [...state.processedEvents, ...batch];
                    set({
                        processedEvents: newProcessedEvents,
                        _currentEventIndex: batchEndIndex
                    });
                    processedCount += batch.length;
                    currentIndex = batchEndIndex;
                }

                // Use requestIdleCallback to avoid blocking the UI
                await new Promise(resolve => {
                    if ('requestIdleCallback' in window) {
                        requestIdleCallback(resolve, { timeout: 50 });
                    } else {
                        setTimeout(resolve, 0);
                    }
                });
            }

        } finally {
            set({ isCatchingUp: false });
        }
    },

    resetToTime: (targetTime: number) => {
        const state = get();

        // Find the index of the first event after targetTime
        const resetIndex = state.allEvents.findIndex(event => {
            const eventTime = coalesceTime(event) ?? 0;
            return eventTime > targetTime;
        });

        // Keep only events up to targetTime
        const eventsUpToTarget = state.allEvents.slice(0, resetIndex);

        set({
            processedEvents: eventsUpToTarget,
            _currentEventIndex: resetIndex
        });
    }
}));

// Helper hook to get current processed events
export const useProcessedEvents = () => {
    return useEventStream(state => state.processedEvents);
};