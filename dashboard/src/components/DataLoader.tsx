// components/DataLoader.tsx
import { useEffect } from "react";
import { useTrainEvents } from "@/state/useTrainEvents";
import { useSimStore } from "@/state/useSimStore";
import iceCsvUrl from "@/data/ice.csv?url";

export default function DataLoader() {
    const loadEvents = useTrainEvents(s => s.loadEvents);
    const setRange = useSimStore(s => s.setRange);

    // on mount, load the CSV and set the timeline range based on the data
    useEffect(() => {
        loadEvents(iceCsvUrl).then(() => {
            const all = useTrainEvents.getState().allEvents;
            if (all.length) {
                const firstRaw = Number(all[0].ts_ms ?? all[0].timestamp ?? 0);
                const lastRaw = Number(all.at(-1)?.ts_ms ?? all.at(-1)?.timestamp ?? 0);

                // normalize seconds → ms if needed
                const normalize = (x: number) =>
                    String(x).length === 10 ? x * 1000 : x;

                const first = normalize(firstRaw);
                const last = normalize(lastRaw);

                // 👇 start one second before first event
                setRange(first - 1000, last);
            }
        });
    }, [loadEvents, setRange]);

    return null;
}
