// components/EventProcessor.tsx
import { useEffect, useRef } from "react";
import { useEventStream } from "@/state/useEventStream";
import { useIncrementalRides } from "@/state/useIncrementalRides";
import type { EventProcessorProps } from "@/types/components";

export default function EventProcessor({
    debug = false,
    batchSize = 1
}: Partial<EventProcessorProps> = {}) {
    const processedEvents = useEventStream(state => state.processedEvents);
    const processEvent = useIncrementalRides(state => state.processEvent);
    const lastProcessedIndex = useRef(0);

    // Process events as they come in, but only process new ones
    useEffect(() => {
        if (processedEvents.length === 0) return;

        // Only process events that haven't been processed yet
        const newEvents = processedEvents.slice(lastProcessedIndex.current);

        if (newEvents.length === 0) return; // No new events to process

        if (debug) {
            console.log(`EventProcessor: Processing ${newEvents.length} new events`);
        }

        // Process events in batches if specified
        for (let i = 0; i < newEvents.length; i += batchSize) {
            const batch = newEvents.slice(i, i + batchSize);
            for (const event of batch) {
                processEvent(event);
            }
        }

        // Update the last processed index
        lastProcessedIndex.current = processedEvents.length;
    }, [processedEvents, processEvent, debug, batchSize]);

    // This component doesn't render anything, it just processes events
    return null;
}
