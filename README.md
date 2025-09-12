# Data Processing Scripts
This project includes several scripts to help you download, convert, and process monthly data files for analysis or dashboard use.

## 1. `download_data.sh`

- **Purpose:** Downloads all available monthly `.parquet` data files starting from July 2024 up to the current month.
- **How it works:**
  - Creates a `data` directory if it doesn't exist.
  - Loops through each month, constructs the download URL, and saves the file into the `data` directory.
  - Notifies you when all downloads are complete.

## 2. `parquet_to_csv.py`

- **Purpose:** Converts all downloaded `.parquet` files in the `dashboard/public/data` directory to CSV format.
- **How it works:**
  - Searches for `.parquet` files in the data directory.
  - Reads each file and writes it as a CSV with the same name.
  - Optionally, you can filter columns or sort by timestamp (see comments in the script).
  - Prints a message for each conversion.

## 3. `process_months.py`

- **Purpose:** Cleans and standardizes the monthly CSV files for analysis or dashboard use.
- **How it works:**
  - Looks for files named `data-YYYY-MM.csv` in the data directory.
  - For each file:
    - Reads the CSV and selects the appropriate time column.
    - Normalizes timestamps and adds an epoch milliseconds column.
    - Sorts the data chronologically.
    - Writes the cleaned data to `events-YYYY-MM.csv`.
    - Prints a summary of the processed file.
  - Generates a `months.json` file listing all processed event files.

---

**Workflow Summary:**  
1. Run `download_data.sh` to fetch the latest data files.
2. Use `parquet_to_csv.py` to convert Parquet files to CSV.
3. Run `process_months.py` to clean and prepare the data for analysis or dashboards.

This ensures your data is up-to-date, easy to work with, and ready for further processing.