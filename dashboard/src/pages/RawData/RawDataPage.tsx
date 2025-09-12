import CsvPreview from "./CsvPreview";

export default function RawDataPage() {
    return (
        <div className="page rawdata-page">
            <CsvPreview path="/data/events-2025-08.csv" />
        </div>
    );
}
