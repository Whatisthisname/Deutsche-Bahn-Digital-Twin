// components/DataLoader.tsx
import { useEffect } from "react";
import { useEventStream } from "@/state/useEventStream";
import { useSimStore } from "@/state/useSimStore";
import iceJourneyEventsCsvUrl from "@/data/ice_journey_events.csv?url";
import { coalesceTime } from "@/utils/time";

export default function DataLoader() {
    const loadAllEvents = useEventStream(s => s.loadAllEvents);
    const startStreaming = useEventStream(s => s.startStreaming);
    const setRange = useSimStore(s => s.setRange);
    const scrubToTime = useSimStore(s => s.scrubToTime);

    // on mount, load the CSV and set the timeline range based on the data
    useEffect(() => {
        loadAllEvents(iceJourneyEventsCsvUrl).then(() => {
            const allEvents = useEventStream.getState().allEvents;
            if (allEvents.length) {
                // Calculate time range from events
                const firstEvent = allEvents[0];
                const lastEvent = allEvents.at(-1);


                // Use the same coalesceTime function as EventStream
                const first = coalesceTime(firstEvent) ?? 0;
                const last = coalesceTime(lastEvent) ?? 0;


                // 👇 start one second before first event, end at last event
                setRange(first - 1000, last);

                // Move cursor to right before the first event
                const targetTime = first - 1000; // 1 second before first event

                // Use the new scrubbing method to properly initialize the simulation
                scrubToTime(targetTime).then(() => {
                    // Start streaming immediately so it's ready when user presses play
                    startStreaming();
                });
            }
        });
    }, [loadAllEvents, startStreaming, setRange, scrubToTime]);

    return null;
}
