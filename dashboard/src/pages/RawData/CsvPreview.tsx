import { useEventStream } from "@/state/useEventStream";
import { useAllSimpleRides } from "@/state/useSimpleRides";
import { useSimStore } from "@/state/useSimStore";
import { ISO_to_ms } from "@/utils/time";
import type { JourneyEvent } from "@/types/ride";
import type { CsvPreviewProps } from "@/types/components";

export default function CsvPreview({
    maxRows = 50,
    showHeaders = true,
    className
}: Partial<CsvPreviewProps> = {}) {
    const processedEvents = useEventStream(state => state.processedEvents);
    const currentTime = useSimStore(state => state.cursorTs) ?? 0;
    const allRides = useAllSimpleRides(processedEvents, currentTime);

    const activeRides = allRides.filter(ride => ride.status === "ACTIVE");
    const finishedRides = allRides.filter(ride => ride.status === "FINISHED");
    const canceledRides = allRides.filter(ride => ride.status === "CANCELED");

    // Get visible events (events that have occurred up to current time)
    const visible = processedEvents.filter(event => {
        const eventTime = ISO_to_ms(event.timestamp);
        return eventTime <= currentTime;
    });

    if (!visible.length) return <div className="loading">No events at current time…</div>;

    const cols = Object.keys(visible[0]);
    const displayEvents = maxRows > 0 ? visible.slice(0, maxRows) : visible;

    return (
        <div className={`preview ${className || ''}`}>
            <h3>Active ride events</h3>
            <div className="rides">
                <p>Active rides: {activeRides.length}</p>
                <p>Finished rides: {finishedRides.length}</p>
                <p>Canceled rides: {canceledRides.length}</p>
                {maxRows > 0 && visible.length > maxRows && (
                    <p>Showing {maxRows} of {visible.length} events</p>
                )}
            </div>
            <table>
                {showHeaders && (
                    <thead>
                        <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
                    </thead>
                )}
                <tbody>
                    {displayEvents.map((r, i) => (
                        <tr key={i}>
                            {cols.map((c) => (
                                <td key={c}>{String((r as JourneyEvent)[c as keyof JourneyEvent] ?? "")}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
