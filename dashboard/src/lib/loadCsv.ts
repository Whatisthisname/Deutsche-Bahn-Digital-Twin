import Papa from "papaparse";

export async function loadCsvPreview(path: string, limit = 1000) {
    return new Promise<any[]>((resolve, reject) => {
        const rows: any[] = [];
        Papa.parse(path, {
            download: true,
            header: true,
            dynamicTyping: true,
            step: (row, parser) => {
                rows.push(row.data);
                if (rows.length >= limit) {
                    parser.abort(); // Stop after reaching the limit
                    resolve(rows);
                }
            },
            complete: () => resolve(rows),
            error: (err) => reject(err),
        });
    });
}
