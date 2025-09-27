import { useActiveRides, useVisibleActiveEvents } from "@/hooks/useStreamingTrainEvents";
import { useIncrementalRides } from "@/state/useIncrementalRides";

export default function CsvPreview() {
    const visible = useVisibleActiveEvents();
    const activeRides = useActiveRides(); // array of IncrementalRide
    const finishedRides = useIncrementalRides(state => state.finishedRides);
    const canceledRides = useIncrementalRides(state => state.canceledRides);

    if (!visible.length) return <div className="loading">No active events…</div>;

    const cols = Object.keys(visible[0]);

    return (
        <div className="preview">
            <h3>Active ride events</h3>
            <div className="rides">
                <p>Active rides: {activeRides.length}</p>
                <p>Finished rides: {finishedRides.size}</p>
                <p>Canceled rides: {canceledRides.size}</p>
            </div>
            <table>
                <thead>
                    <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                    {visible.map((r, i) => (
                        <tr key={i}>
                            {cols.map((c) => (
                                <td key={c}>{String((r as any)[c] ?? "")}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
