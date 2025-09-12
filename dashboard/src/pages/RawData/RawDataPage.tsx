import CsvPreview from "./CsvPreview";

export default function RawDataPage() {
    return (
        <div className="page rawdata-page">
            <CsvPreview path="/data/data-2024-07.csv" />
        </div>
    );
}
