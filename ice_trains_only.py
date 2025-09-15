#!/usr/bin/env python3
import pathlib
import pandas as pd

DATA_DIR = pathlib.Path("dashboard/public/data")
OUT_DIR = DATA_DIR / "ice"
OUT_DIR.mkdir(parents=True, exist_ok=True)

def filter_ice(src: pathlib.Path):
    # Read the monthly events CSV
    df = pd.read_csv(src)

    # Only keep ICE trains
    if "train_type" not in df.columns:
        print(f"⚠️  {src.name}: no 'train_type' column, skipping")
        return None

    ice_df = df[df["train_type"].astype(str).str.upper() == "ICE"].copy()

    if ice_df.empty:
        print(f"ℹ️  {src.name}: no ICE trains found")
        return None

    out = OUT_DIR / src.name.replace("events-", "events-ice-")
    ice_df.to_csv(out, index=False)
    print(f"{src.name} → {out.name} | ICE rows: {len(ice_df):,}")
    return out

def main():
    files = sorted(list(DATA_DIR.glob("events-*.csv")))
    if not files:
        print("No events-*.csv files found in ./dashboard/public/data/")
        return

    written = []
    for f in files:
        try:
            result = filter_ice(f)
            if result:
                written.append(result.name)
        except Exception as e:
            print(f"❌ {f.name}: {e}")

    if written:
        print("\nDone! ICE-only files written:")
        for w in written:
            print("  -", w)

if __name__ == "__main__":
    main()
