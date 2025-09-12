#!/usr/bin/env python3
import pandas as pd
import pathlib

DATA_DIR = pathlib.Path("dashboard/public/data")

def convert_file(parquet_path: pathlib.Path):
    print(f"Converting {parquet_path.name} …")
    df = pd.read_parquet(parquet_path)

    # Optional: keep only the useful columns (uncomment if needed)
    # cols = [c for c in df.columns if c in ["train_id","timestamp","station_name","delay_min","planned_ts","actual_ts"]]
    # if cols:
    #     df = df[cols]

    # Optional: sort by timestamp if it exists
    if "timestamp" in df.columns:
        df = df.sort_values("timestamp")

    csv_path = parquet_path.with_suffix(".csv")
    df.to_csv(csv_path, index=False)
    print(f" → wrote {len(df):,} rows to {csv_path.name}")

def main():
    DATA_DIR.mkdir(exist_ok=True)
    parquet_files = sorted(DATA_DIR.glob("*.parquet"))
    if not parquet_files:
        print("No .parquet files found in ./data/")
        return

    for f in parquet_files:
        convert_file(f)

if __name__ == "__main__":
    main()
