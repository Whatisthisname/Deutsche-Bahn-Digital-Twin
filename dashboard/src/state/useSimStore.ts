import { create } from "zustand";
import { useEventStream } from "./useEventStream";
import { useIncrementalRides } from "./useIncrementalRides";
import { useRenderThrottling } from "./useRenderThrottling";

// Define available speeds
export const SPEEDS = [1, 2, 5] as const;
export type Speed = typeof SPEEDS[number];

// Define the shape of the simulation state
type SimState = {
    isPlaying: boolean; // whether the simulation is currently playing
    speed: Speed; // speed multiplier (1x, 5x, 10x, 100x)
    rangeStart: number | null; // start of the selected time range
    rangeEnd: number | null; // end of the selected time range
    cursorTs: number | null; // current cursor timestamp 
    setIsPlaying: (b: boolean) => void; // action to set isPlaying
    setSpeed: (s: Speed) => void; // set speed function
    setRange: (a: number, b: number) => void; // set range function
    setCursorTs: (t: number) => void; // set cursor timestamp function
    stepBack: () => void; // step back function
    stepForward: () => void; // step forward function

    // New streaming methods
    scrubToTime: (targetTime: number) => Promise<void>; // scrub to specific time with catch-up
    isScrubbing: boolean; // whether we're currently scrubbing/catching up
};

// Create the Zustand store for simulation state management
export const useSimStore = create<SimState>((set, get) => ({
    isPlaying: false,
    speed: SPEEDS[0],
    rangeStart: null, // Will be set by DataLoader
    rangeEnd: null,   // Will be set by DataLoader
    cursorTs: null,   // Will be set by DataLoader
    isScrubbing: false,
    setIsPlaying: (b) => set({ isPlaying: b }),
    setSpeed: (s) => set({ speed: s }),
    setRange: (a, b) => set({ rangeStart: a, rangeEnd: b, cursorTs: a }),
    setCursorTs: (t) => set({ cursorTs: t }),
    stepBack: () => {
        const { cursorTs, rangeStart } = get();
        if (cursorTs == null || rangeStart == null) return;
        set({ cursorTs: Math.max(rangeStart, cursorTs - 60 * 60 * 1000) });
    },
    stepForward: () => {
        const { cursorTs, rangeEnd } = get();
        if (cursorTs == null || rangeEnd == null) return;
        set({ cursorTs: Math.min(rangeEnd, cursorTs + 60 * 60 * 1000) });
    },

    scrubToTime: async (targetTime: number) => {
        const state = get();
        const { cursorTs, rangeStart, rangeEnd } = state;

        if (cursorTs == null || rangeStart == null || rangeEnd == null) return;


        set({ isScrubbing: true });

        try {
            const eventStream = useEventStream.getState();
            const incrementalRides = useIncrementalRides.getState();
            const renderThrottling = useRenderThrottling.getState();

            if (targetTime < cursorTs) {
                // Going backward - reset everything and catch up
                renderThrottling.startCatchUp();

                // Reset ride data
                incrementalRides.reset();

                // Reset event stream to target time
                eventStream.resetToTime(targetTime);

                // Process events up to target time
                await eventStream.catchUpToTime(targetTime);

                // Process all events to rebuild ride data
                const processedEvents = eventStream.processedEvents;
                for (const event of processedEvents) {
                    incrementalRides.processEvent(event);
                }

                renderThrottling.endCatchUp();
            } else {
                // Going forward - catch up with existing rides
                renderThrottling.startCatchUp();

                // Catch up events to target time
                await eventStream.catchUpToTime(targetTime);

                // Process new events
                const processedEvents = eventStream.processedEvents;
                const currentProcessedCount = state.cursorTs ?
                    processedEvents.filter(e => {
                        const eventTime = Number(e.timestamp);
                        return String(eventTime).length === 10 ? eventTime * 1000 : eventTime;
                    }).filter(e => {
                        const eventTime = Number(e.timestamp);
                        return String(eventTime).length === 10 ? eventTime * 1000 : eventTime;
                    }).length : 0;

                // Process only new events since last cursor position
                const newEvents = processedEvents.slice(currentProcessedCount);
                for (const event of newEvents) {
                    incrementalRides.processEvent(event);
                }

                renderThrottling.endCatchUp();
            }

            // Update cursor position
            set({ cursorTs: targetTime });

        } catch (error) {
            console.error('SimStore: Error during scrubbing:', error);
        } finally {
            set({ isScrubbing: false });
        }
    },
}));
