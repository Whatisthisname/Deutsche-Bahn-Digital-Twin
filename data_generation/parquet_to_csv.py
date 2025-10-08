#!/usr/bin/env python3
import pandas as pd
import pathlib

DATA_DIR = pathlib.Path("data_generation/data")

def main():
    DATA_DIR.mkdir(exist_ok=True)
    parquet_files = sorted(DATA_DIR.glob("*.parquet"))
    if not parquet_files:
        print("No .parquet files found in ./data/")
        return

    dfs = []
    for f in parquet_files:
        print(f"Reading {f.name} …")
        df = pd.read_parquet(f)
        dfs.append(df)

    if not dfs:
        print("No data to concatenate.")
        return

    combined_df = pd.concat(dfs, ignore_index=True)

    # Optional: sort by timestamp if it exists
    if "timestamp" in combined_df.columns:
        combined_df = combined_df.sort_values("timestamp")

    output_csv = DATA_DIR / "all_data.csv"
    combined_df.to_csv(output_csv, index=False)
    print(f" → wrote {len(combined_df):,} rows to {output_csv.name}")

if __name__ == "__main__":
    main()