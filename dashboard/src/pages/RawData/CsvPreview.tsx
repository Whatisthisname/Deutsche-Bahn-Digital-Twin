import { useVisibleEvents } from "@/state/useTrainEvents";

export default function CsvPreview() {
    const visible = useVisibleEvents();

    if (!visible.length) return <div className="loading">No events yet…</div>;

    const cols = Object.keys(visible[0]);

    return (
        <div className="preview">
            <h3>Events so far</h3>
            <table>
                <thead>
                    <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                    {visible.map((r, i) => (
                        <tr key={i}>
                            {cols.map((c) => <td key={c}>{String(r[c] ?? "")}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
