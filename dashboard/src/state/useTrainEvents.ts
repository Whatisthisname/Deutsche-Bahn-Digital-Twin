import { create } from "zustand";
import Papa from "papaparse";
import { useSimStore } from "./useSimStore";

type TrainEvent = Record<string, any>;

type TrainEventsState = {
    allEvents: TrainEvent[];
    loadEvents: (url: string) => Promise<void>;
};

// Create the Zustand store for "real time" train events
export const useTrainEvents = create<TrainEventsState>((set) => ({
    allEvents: [],
    loadEvents: async (url) => {
        const resp = await fetch(url);
        const text = await resp.text();
        const { data } = Papa.parse<TrainEvent>(text, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
        });
        const sorted = (data as TrainEvent[]).sort(
            (a, b) => Number(a.ts_ms ?? 0) - Number(b.ts_ms ?? 0)
        );
        set({ allEvents: sorted });
    },
}));

// Hook to get events visible up to the current cursor timestamp
export const useVisibleEvents = () => {
  const { allEvents } = useTrainEvents();
  const cursorTs = useSimStore((s) => s.cursorTs);

  if (!cursorTs) return [];
  return allEvents.filter((e) => Number(e.ts_ms ?? e.timestamp ?? 0) <= cursorTs);
};