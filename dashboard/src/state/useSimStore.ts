import { create } from "zustand";

// Define available speeds
export const SPEEDS = [1, 10, 100, 1000] as const;
export type Speed = typeof SPEEDS[number];

// Fetch range start and end from months.json
import monthsData from '@/data/months.json' assert { type: "json" };
const RANGE_START = monthsData.rangeStart;
const RANGE_END = monthsData.rangeEnd;

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
};

// Create the Zustand store for simulation state management
export const useSimStore = create<SimState>((set, get) => ({
    isPlaying: false,
    speed: SPEEDS[0],
    rangeStart: RANGE_START,
    rangeEnd: RANGE_END,
    cursorTs: RANGE_START,
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
}));
