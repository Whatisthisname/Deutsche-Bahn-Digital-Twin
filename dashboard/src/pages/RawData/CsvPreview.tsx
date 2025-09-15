import { useActiveRides, useEndedRides, useVisibleActiveEvents } from "@/state/useTrainEvents";

export default function CsvPreview() {
    const visible = useVisibleActiveEvents();
    const activeRides = useActiveRides(); // array of RideMeta
    const endedRides = useEndedRides();   // array of RideMeta

    if (!visible.length) return <div className="loading">No active events…</div>;

    const cols = Object.keys(visible[0]);

    return (
        <div className="preview">
            <h3>Active ride events</h3>
            <div className="rides">
                <p>Active rides: {activeRides.length}</p>
                <p>Ended rides: {endedRides.length}</p>
            </div>
            <table>
                <thead>
                    <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                    {visible.map((r, i) => (
                        <tr key={i}>
                            {cols.map((c) => (
                                <td key={c}>{String(r[c] ?? "")}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
