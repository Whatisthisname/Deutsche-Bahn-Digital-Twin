#!/usr/bin/env python3
import pathlib
import pandas as pd
import json

OUT_DIR = pathlib.Path("dashboard/public/data")
RAW_DIR = OUT_DIR  # <- read the monthly CSVs from the same folder
OUT_DIR.mkdir(parents=True, exist_ok=True)

FALLBACK_TS = ["arrival_planned_time","arrival_change_time","departure_planned_time","departure_change_time"]

def pick_time_column(df: pd.DataFrame) -> str:
    if "time" in df.columns:
        return "time"
    for c in FALLBACK_TS:
        if c in df.columns:
            return c
    raise RuntimeError(f"No usable time column found. Columns: {list(df.columns)}")

def process_month(src: pathlib.Path) -> str:
    # Month tag from filename like data-2024-07.csv
    month = src.stem.replace("data-", "")
    # Load
    if src.suffix.lower() != ".csv":
        raise ValueError(f"Unsupported: {src}")
    df = pd.read_csv(src)

    # Choose and normalize time
    tcol = pick_time_column(df)
    ts = pd.to_datetime(df[tcol], errors="coerce")  # naive -> assume local clock

    df = df.loc[ts.notna()].copy()
    df.insert(0, "timestamp", ts.loc[ts.notna()].astype("datetime64[ns]"))
    # epoch ms
    df.insert(1, "ts_ms", (df["timestamp"].astype("int64") // 1_000_000))

    # Sort chronologically
    df = df.sort_values("timestamp")

    # Write out
    out = OUT_DIR / f"events-{month}.csv"
    df.to_csv(out, index=False)
    print(f"{src.name} → {out.name} | rows: {len(df):,}")
    return out.name

def main():
    # Only pick up the monthly inputs, not our outputs
    files = sorted(list(RAW_DIR.glob("data-*.csv")))
    if not files:
        print("No monthly files found in ./dashboard/public/data/ (expected data-YYYY-MM.csv)")
        return
    written = []
    for f in files:
        try:
            written.append(process_month(f))
        except Exception as e:
            print(f"❌ {f.name}: {e}")

    with open(OUT_DIR / "months.json", "w", encoding="utf-8") as fh:
        json.dump({"files": written, "default": written[0] if written else None}, fh, indent=2)

if __name__ == "__main__":
    main()
