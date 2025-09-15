import {create} from "zustand";

type StationIndex = Record<string, {lat:number; lon:number}>;

type StationState = {
  stations: StationIndex;
  loaded: boolean;
  load: () => Promise<void>;
};

export const useStations = create<StationState>()((set, get) => ({
  stations: {},
  loaded: false,
  load: async () => {
    // don’t refetch if we have data
    if (get().loaded && Object.keys(get().stations).length > 0) return;

    try {
      const res = await fetch("/src/data/stations_index.json", { cache: "no-store" });
      if (!res.ok) {
        console.error("stations_index.json fetch failed", res.status, res.statusText);
        set({ loaded: false });
        return;
      }
      const idx = (await res.json()) as StationIndex;
      const hasData = idx && Object.keys(idx).length > 0;
      if (!hasData) console.warn("stations_index.json loaded but empty");
      set({ stations: idx, loaded: hasData });
    } catch (e) {
      console.error("stations load error", e);
      set({ loaded: false });
    }
  },
}));
