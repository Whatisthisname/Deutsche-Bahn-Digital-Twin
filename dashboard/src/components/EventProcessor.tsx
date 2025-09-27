// components/EventProcessor.tsx
import { useEffect, useRef } from "react";
import { useEventStream } from "@/state/useEventStream";
import { useIncrementalRides } from "@/state/useIncrementalRides";

export default function EventProcessor() {
    const processedEvents = useEventStream(state => state.processedEvents);
    const processEvent = useIncrementalRides(state => state.processEvent);
    const lastProcessedIndex = useRef(0);

    // Process events as they come in, but only process new ones
    useEffect(() => {
        if (processedEvents.length === 0) return;

        // Only process events that haven't been processed yet
        const newEvents = processedEvents.slice(lastProcessedIndex.current);

        if (newEvents.length === 0) return; // No new events to process

        for (const event of newEvents) {
            processEvent(event);
        }

        // Update the last processed index
        lastProcessedIndex.current = processedEvents.length;
    }, [processedEvents, processEvent]);

    // This component doesn't render anything, it just processes events
    return null;
}
