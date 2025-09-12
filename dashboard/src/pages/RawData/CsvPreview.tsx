import { useEffect, useState } from "react";
import { loadCsvPreview } from "@/lib/loadCsv";

export default function CsvPreview({ path = "/data/events-2024-07.csv" }) {
    const [rows, setRows] = useState<any[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Load CSV preview on component mount or when path changes
    useEffect(() => {
        loadCsvPreview(path)
            .then(setRows)
            .catch((e) => setError(String(e)));
    }, [path]);

    if (error) return <div className="error">Error: {error}</div>; // show error if loading failed
    if (!rows.length) return <div className="loading">Loading…</div>; // show loading state

    const cols = Object.keys(rows[0]);

    return (
        <div className="preview">
            <h3>Preview {path}</h3>
            <table>
                <thead>
                    <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
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
