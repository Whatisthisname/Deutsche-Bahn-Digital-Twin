// components/DataLoader.tsx
import { useEffect } from "react";
import { useTrainEvents } from "@/state/useTrainEvents";
import { useSimStore } from "@/state/useSimStore";
import iceJourneyEventsCsvUrl from "@/data/ice_journey_events.csv?url";

export default function DataLoader() {
    const loadEvents = useTrainEvents(s => s.loadEvents);
    const setRange = useSimStore(s => s.setRange);

    // on mount, load the CSV and set the timeline range based on the data
    useEffect(() => {
        loadEvents(iceJourneyEventsCsvUrl).then(() => {
            const all = useTrainEvents.getState().allEvents;
            if (all.length) {
                const firstRaw = Number(all[0].actual_timestamp ?? all[0].planned_timestamp ?? all[0].ts_ms ?? all[0].timestamp ?? 0);
                const lastRaw = Number(all.at(-1)?.actual_timestamp ?? all.at(-1)?.planned_timestamp ?? all.at(-1)?.ts_ms ?? all.at(-1)?.timestamp ?? 0);

                // normalize seconds → ms if needed
                const normalize = (x: number) =>
                    String(x).length === 10 ? x * 1000 : x;

                const first = normalize(firstRaw);
                const last = normalize(lastRaw);

                // 👇 start one second before first event, end at last event
                console.log('DataLoader: Setting timeline range from', new Date(first - 1000).toISOString(), 'to', new Date(last).toISOString());
                setRange(first - 1000, last);

                // Move cursor to 01:30 to see more rides active (after most rides have started but before they end)
                const targetTime = first + (90 * 60 * 1000); // 1.5 hours after start (01:30)
                console.log('DataLoader: Moving cursor to', new Date(targetTime).toISOString(), 'to see more rides active');
                useSimStore.getState().setCursorTs(targetTime);
            }
        });
    }, [loadEvents, setRange]);

    return null;
}
