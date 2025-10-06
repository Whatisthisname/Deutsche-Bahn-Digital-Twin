#!/bin/bash

# Create the target data directory
mkdir -p "Deutsche-Bahn-Digital-Twin/dashboard/public/data"

# Set the start and end dates
start_date="2024-07-01"
end_date="2025-08-01"

# Loop through months and download files
while [[ "$start_date" < "$end_date" ]]; do
    year_month=$(date -j -f "%Y-%m-%d" "$start_date" +"%Y-%m")
    url="https://github.com/piebro/deutsche-bahn-data/raw/refs/heads/main/monthly_data_releases/data-$year_month.parquet"
    output_file="Deutsche-Bahn-Digital-Twin/dashboard/public/data/data-$year_month.parquet"
    
    echo "Downloading $url"
    curl -L "$url" -o "$output_file"
    
    # Move to next month
    start_date=$(date -j -f "%Y-%m-%d" -v+1m "$start_date" +"%Y-%m-01")
done

echo "Download complete"