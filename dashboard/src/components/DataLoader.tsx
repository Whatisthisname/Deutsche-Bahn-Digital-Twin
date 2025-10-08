// components/DataLoader.tsx
import { useEffect } from "react";
import { useEventStream } from "@/state/useEventStream";
import { useSimStore } from "@/state/useSimStore";
import iceJourneyEventsCsvUrl from "@/data/ice_journey_events.csv?url";
import type { DataLoaderProps } from "@/types/components";
import { ISO_to_ms } from "@/utils/time";

export default function DataLoader({
    dataUrl = iceJourneyEventsCsvUrl,
    autoStart = true,
    onDataLoaded,
    onError
}: Partial<DataLoaderProps> = {}) {
    const loadAllEvents = useEventStream(s => s.loadAllEvents);
    const startStreaming = useEventStream(s => s.startStreaming);
    const setRange = useSimStore(s => s.setRange);
    const scrubToTime = useSimStore(s => s.scrubToTime);

    // on mount, load the CSV and set the timeline range based on the data
    useEffect(() => {
        loadAllEvents(dataUrl).then(() => {
            const allEvents = useEventStream.getState().allEvents;
            if (allEvents.length) {
                // Calculate time range from events
                const firstEvent = allEvents[0];
                const lastEvent = allEvents[allEvents.length - 1];

                const first = ISO_to_ms(firstEvent.timestamp);
                const last = ISO_to_ms(lastEvent.timestamp);

                // 👇 start one second before first event, end at last event
                setRange(first - 1000, last);

                // Move cursor to right before the first event
                const targetTime = first - 1000; // 1 second before first event

                // Use the new scrubbing method to properly initialize the simulation
                scrubToTime(targetTime).then(() => {
                    // Start streaming if autoStart is enabled
                    if (autoStart) {
                        startStreaming();
                    }

                    // Call onDataLoaded callback if provided
                    if (onDataLoaded) {
                        onDataLoaded();
                    }
                });
            }
        }).catch((error) => {
            // Call onError callback if provided
            if (onError) {
                onError(error);
            }
        });
    }, [loadAllEvents, startStreaming, setRange, scrubToTime, dataUrl, autoStart, onDataLoaded, onError]);

    return null;
}
