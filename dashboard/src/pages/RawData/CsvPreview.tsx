import { useActiveRides, useVisibleActiveEvents } from "@/hooks/useStreamingTrainEvents";
import { useIncrementalRides } from "@/state/useIncrementalRides";
import type { JourneyEvent } from "@/types/ride";
import type { CsvPreviewProps } from "@/types/components";

export default function CsvPreview({
    maxRows = 50,
    showHeaders = true,
    className
}: Partial<CsvPreviewProps> = {}) {
    const visible = useVisibleActiveEvents();
    const activeRides = useActiveRides(); // array of IncrementalRide
    const finishedRides = useIncrementalRides(state => state.finishedRides);
    const canceledRides = useIncrementalRides(state => state.canceledRides);

    if (!visible.length) return <div className="loading">No active events…</div>;

    const cols = Object.keys(visible[0]);
    const displayEvents = maxRows > 0 ? visible.slice(0, maxRows) : visible;

    return (
        <div className={`preview ${className || ''}`}>
            <h3>Active ride events</h3>
            <div className="rides">
                <p>Active rides: {activeRides.length}</p>
                <p>Finished rides: {finishedRides.size}</p>
                <p>Canceled rides: {canceledRides.size}</p>
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
