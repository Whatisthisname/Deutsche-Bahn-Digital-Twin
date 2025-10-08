# Data Generation Instructions

Follow these steps to generate the `all_data_ice.csv` file containing ICE train data:

---

## 1. Download Monthly Parquet Data

Run the shell script to download all monthly Parquet files to `data_generation/data`:

```bash
bash data_generation/download_data.sh
```

---

## 2. Merge Parquet Files into a Single CSV

Convert all downloaded Parquet files into one CSV file:

```bash
python3 data_generation/parquet_to_csv.py
```

This creates `data_generation/data/all_data.csv`.

---

## 3. Filter for ICE Trains

Filter the merged CSV to include only ICE trains:

```bash
python3 data_generation/ice_trains_only.py
```

This creates `data_generation/data/all_data_ice.csv`.

---

## 4. (Optional) Fetch Station Metadata

To fetch and cache station metadata from the Deutsche Bahn API:

```bash
python3 data_generation/fetch_stations_only.py
```

---

All output files are stored in data_generation/data