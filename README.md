# Deutsche Bahn Digital Twin — Data & Run Instructions

An interactive prototype Digital Twin for Deutsche Bahn's ICE network. This repository contains the preprocessing pipeline, the pretrained delay model exported to JavaScript, and a Vite + React dashboard that replays historical journey events as a simulated live stream. The dashboard helps operators, station managers and passengers explore delay patterns, visualise KPIs and view short‑term delay predictions.

This README explains how to obtain and preprocess the data used by the Digital Twin, the event schema, and how to run the app locally for development.

## Quick start — run the dashboard locally

- Install dependencies (assumes Node.js/npm already installed).
- Start the Vite dev server and open the dashboard in your browser:

```bash
npm install
npm run dev
```

## Data overview

The frontend consumes a single preprocessed CSV of journey-level events (commonly named `ice_journey_events.csv`). Each row is one Arrival / Departure / Cancellation event. The CSV must be globally time-sorted and use ISO timestamps.

High-level pipeline:

1. Download raw monthly Parquet files (source dataset).
2. Concatenate / normalize Parquets → per-month CSVs or one big CSV.
3. Filter to ICE trains if desired.
4. Convert station-row data into journey-level events (Departure / Arrival / Cancellation) and set `expected_next_event_time` where available.
5. Output `ice_journey_events.csv`, sorted globally by timestamp.

The frontend will re-parse and defensively re-sort the CSV on load, but providing a pre-sorted, clean CSV avoids surprises and reduces load-time work.

## Preprocessing scripts (where to run them)

These scripts live in the repository (see `convert_to_journey_events.py`, `parquet_to_csv.py`, `prep_months.py`, `ice_trains_only.py`, `build_ml_dataset.py`) and are used to prepare the final CSV used by the dashboard. Typical invocation sequence:

- Download monthly Parquet files (example script):

```bash
# ./download_data.sh  # downloads data-YYYY-MM.parquet into dashboard/public/data/
```

- Convert Parquet to concatenated CSV:

```bash
# python3 scripts/parquet_to_csv.py dashboard/public/data/ --out all_data.csv
```

- (Optional) Normalize months & create `months.json`:

```bash
# python3 scripts/prep_months.py --input all_data.csv --out data/
```

- (Optional) Filter to ICE trains:

```bash
# python3 scripts/ice_trains_only.py --input all_data.csv --out all_data_ice.csv
```

- Convert station rows → journey events (the important step):

```bash
# python3 scripts/convert_to_journey_events.py --input all_data_ice.csv \
#   --out dashboard/src/data/ice_journey_events_full_year.csv
```

Key behavior of `convert_to_journey_events.py`:
- Groups station rows by ride id, sorts each ride, and emits per-ride events: `DEPARTURE`, `ARRIVAL`, and `CANCELLATION` rows.
- For DEPARTURE events, `expected_next_event_time` is set preferentially from planned expected times; if missing it falls back to the next segment's actual arrival (this fallback can leak information into training labels — see Caveats).
- After emitting events, the script sorts all events globally by timestamp and writes the CSV.

Put the produced CSV where the frontend expects it (for example `dashboard/public/data/ice_journey_events.csv` or update `DataLoader` to point to your file URL).

## Canonical event schema (ArrivalOrDepartureEvent)

Each CSV row should map to the following fields (CSV header names must match the loader mapping used in `useEventStream`):

- event_type: "DEPARTURE" | "ARRIVAL" | "CANCELLATION"
- id_: string (ride identifier)
- train_name: string
- from_station: string
- to_station: string
- station_num: integer (1-based ordinal — frontend expects 1-based)
- timestamp: ISO string (e.g. 2024-07-01T08:15:00+02:00)
- expected_next_event_time: ISO string or empty/null
- final_destination_station: string

Runtime-only field (added by the frontend):
- predicted_delay: number (minutes) — added by ML prediction at runtime and stored on event objects.

Recommended additions to CSV (strongly advised):
- expected_next_event_time_source: "planned" | "fallback_actual_next" | "missing" — marks whether expected times were planned or fallbacked. This helps avoid label leakage when training ML models.

Validation rules:
- Timestamps must be parseable as ISO-8601 by `new Date(...)` (frontend) and `datetime.fromisoformat` (Python). Prefer timezone-aware ISO strings.
- station names referenced must match your `graph_structure` mapping or be normalised using an alternatives mapping.

## How the frontend uses the CSV

- `DataLoader` calls `useEventStream.loadAllEvents(url)`. The loader uses PapaParse to parse the CSV, manually casts `station_num` to Number, and sorts rows by timestamp (defensive).
- The full dataset is kept in-memory in `allEvents`. A simulation cursor (`useSimStore.cursorTs`) controls which events are allowed into `processedEvents` (events with timestamp ≤ cursorTs).
- `useAggregatedJourneysStore.updateRideCache` groups `processedEvents` by `id_` into `Journey` objects, computes ML predictions (writing `predicted_delay` onto events), and exposes lists for the UI (active/finished/canceled).

## ML model notes (runtime & training)

- The frontend calls `predictNextDelay` during ride updates. It builds a flattened numeric vector from event features (datetime-normalised components, station centralities, distance_km, station_num, last observed delay, event_type) and calls a JS `score()` exported by the trained model.
- Predictions are written into event objects and used by visualisations.

Training label definition (how the model was trained):
- target_delay (minutes) = (next_event.timestamp - current_event.expected_next_event_time) / 60000
- Note: if `expected_next_event_time` was fallback-filled with the actual next event time, this creates a zero label and leaks information. Prefer preserving provenance or leaving missing values to avoid this.

## Common pitfalls & recommendations

- Malformed timestamps: a single bad timestamp can throw during parsing/sorting. Validate timestamps during preprocessing and include timezone offsets.
- expected_next_event_time fallbacks: mark fallbacked values with a provenance field or avoid fallbacking to actual next times during preprocessing.
- Performance: the frontend keeps all events in memory and recomputes ML predictions for prefixes of rides during updates — this can be heavy for large datasets. Consider:
  - Limiting dataset size for local dev (sample months only).
  - Adding caching to avoid recomputing predictions for unchanged prefixes.
  - Incremental updates and structural sharing to reduce array copy pressure.
- Station name canonicalisation: provide an `alternative_station_names.json` to map common variants to canonical names.

## Where to put files / config

- Frontend CSV: put `ice_journey_events.csv` under the public folder the app serves (e.g., `dashboard/public/data/ice_journey_events.csv`) and ensure `DataLoader` references that path.
- Graph structure (for ML features): include `graph_structure.json` near your data scripts and ensure the frontend can fetch or import it.