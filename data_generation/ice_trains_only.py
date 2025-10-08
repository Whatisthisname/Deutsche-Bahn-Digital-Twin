#!/usr/bin/env python3
import pandas as pd
import pathlib

DATA_DIR = pathlib.Path("data_generation/data")
INPUT_FILE = DATA_DIR / "all_data.csv"
OUTPUT_FILE = DATA_DIR / "all_data_ice.csv"

def main():
    if not INPUT_FILE.exists():
        print(f"{INPUT_FILE} not found.")
        return

    df = pd.read_csv(INPUT_FILE)
    if "train_type" not in df.columns:
        print("No 'train_type' column found in all_data.csv.")
        return

    ice_df = df[df["train_type"].astype(str).str.upper() == "ICE"]
    ice_df.to_csv(OUTPUT_FILE, index=False)
    print(f"Saved {len(ice_df):,} ICE train rows to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()