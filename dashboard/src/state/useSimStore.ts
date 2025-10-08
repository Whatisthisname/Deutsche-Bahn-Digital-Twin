// This file can probably also be cleaned up a bit just like the useEventStream.ts file, because we no longer jump forward or backward in time.

import { create } from "zustand";
import { useEventStream } from "./useEventStream";
// Removed useIncrementalRides import
import { useRenderThrottling } from "./useRenderThrottling";

// Define available speeds
export const SPEEDS = [1, 10, 100] as const;
export const UNITS = ["seconds", "mins"] as const;
export type Speed = typeof SPEEDS[number];

// Define the shape of the simulation state
type SimState = {
    isPlaying: boolean; // whether the simulation is currently playing
    speed: Speed; // speed multiplier (1x, 5x, 10x, 100x)
    unit: typeof UNITS[number]; // time unit for display
    rangeStart: number | null; // start of the selected time range
    rangeEnd: number | null; // end of the selected time range
    cursorTs: number | null; // current cursor timestamp 
    setIsPlaying: (b: boolean) => void; // action to set isPlaying
    setSpeed: (s: Speed) => void; // set speed function
    setUnits: (u: typeof UNITS[number]) => void; // set units function
    setRange: (a: number, b: number) => void; // set range function
    setCursorTs: (t: number) => void; // set cursor timestamp function

    // New streaming methods
    scrubToTime: (targetTime: number) => Promise<void>; // scrub to specific time with catch-up
    isScrubbing: boolean; // whether we're currently scrubbing/catching up
};

// Create the Zustand store for simulation state management
export const useSimStore = create<SimState>((set, get) => ({
    isPlaying: false,
    speed: SPEEDS[0],
    unit: "mins",
    rangeStart: null, // Will be set by DataLoader
    rangeEnd: null,   // Will be set by DataLoader
    cursorTs: null,   // Will be set by DataLoader
    isScrubbing: false,
    setIsPlaying: (b) => set({ isPlaying: b }),
    setSpeed: (s) => set({ speed: s }),
    setUnits: (u) => set({ unit: u }),
    setRange: (a, b) => set({ rangeStart: a, rangeEnd: b, cursorTs: a }),
    setCursorTs: (t) => set({ cursorTs: t }),

    scrubToTime: async (targetTime: number) => {
        const state = get();
        const { cursorTs, rangeStart, rangeEnd } = state;

        if (cursorTs == null || rangeStart == null || rangeEnd == null) return;


        set({ isScrubbing: true });

        try {
            const eventStream = useEventStream.getState();
            const renderThrottling = useRenderThrottling.getState();

            if (targetTime < cursorTs) {
                // Going backward - reset everything and catch up
                renderThrottling.startCatchUp();

                // Reset event stream to target time
                eventStream.resetToTime(targetTime);

                // Process events up to target time
                await eventStream.catchUpToTime(targetTime);

                renderThrottling.endCatchUp();
            } else {
                // Going forward - catch up with existing rides
                renderThrottling.startCatchUp();

                // Catch up events to target time
                await eventStream.catchUpToTime(targetTime);

                renderThrottling.endCatchUp();
            }

            // Update cursor position
            set({ cursorTs: targetTime });

        } catch (error) {
            throw error;
        } finally {
            set({ isScrubbing: false });
        }
    },
}));
