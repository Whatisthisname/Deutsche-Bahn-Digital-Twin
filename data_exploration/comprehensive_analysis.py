#!/usr/bin/env python3
"""
Comprehensive Analysis of Deutsche Bahn Train Data
Analyzes station statistics, timing patterns, delays, and other interesting metrics.
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import glob
import os
from datetime import datetime, timedelta
from collections import defaultdict
import warnings

warnings.filterwarnings("ignore")


def load_sample_data(data_dir="Deutsche-Bahn-Digital-Twin/dashboard/public/data", sample_months=3, sample_fraction=0.1):
    """Load a sample of parquet files for faster analysis."""
    print("🚂 Loading Deutsche Bahn data (sample for faster analysis)...")
    files = glob.glob(os.path.join(data_dir, "*.parquet"))
    files.sort()

    # Use only the most recent months for analysis
    files_to_use = files[-sample_months:]
    print(f"📁 Using {len(files_to_use)} most recent files: {[os.path.basename(f) for f in files_to_use]}")

    dataframes = []
    for file in files_to_use:
        print(f"  Loading {os.path.basename(file)}...")
        df = pd.read_parquet(file)
        # Sample the data for faster processing
        if len(df) > 100000:  # Only sample if dataset is large
            df_sample = df.sample(frac=sample_fraction, random_state=42)
            print(f"  → Sampled {len(df_sample):,} records ({sample_fraction*100:.0f}% of {len(df):,})")
            dataframes.append(df_sample)
        else:
            dataframes.append(df)

    combined_df = pd.concat(dataframes, ignore_index=True)
    print(f"✅ Loaded {len(combined_df):,} records from {len(files_to_use)} files")
    print(f"📅 Date range: {combined_df['time'].min()} to {combined_df['time'].max()}")
    return combined_df


def analyze_stations(df):
    """Analyze station-related statistics."""
    print("\n🏢 STATION ANALYSIS")
    print("=" * 50)

    # Basic station count
    unique_stations = df["station"].nunique()
    print(f"📍 Total unique stations: {unique_stations:,}")

    # Most frequent stations
    station_counts = df["station"].value_counts()
    print(f"\n🔝 Top 10 busiest stations (by number of records):")
    for i, (station, count) in enumerate(station_counts.head(10).items(), 1):
        print(f"  {i:2d}. {station}: {count:,} records")

    # Station activity distribution
    print(f"\n📊 Station activity distribution:")
    print(f"  - Stations with >10k records: {(station_counts > 10000).sum()}")
    print(f"  - Stations with 1k-10k records: {((station_counts >= 1000) & (station_counts <= 10000)).sum()}")
    print(f"  - Stations with <1k records: {(station_counts < 1000).sum()}")

    return station_counts


def calculate_time_between_stations(df, max_journeys=1000):
    """Calculate average time between stations for train journeys (optimized with sampling)."""
    print("\n⏱️  TIME BETWEEN STATIONS ANALYSIS")
    print("=" * 50)

    # Filter out canceled trains and those with missing times
    valid_df = df[
        (~df["is_canceled"]) & (df["departure_planned_time"].notna()) & (df["arrival_planned_time"].notna())
    ].copy()

    # Sort by train ride and station number
    valid_df = valid_df.sort_values(["train_line_ride_id", "train_line_station_num"])

    # Get unique train journeys and sample them for faster processing
    unique_journeys = valid_df["train_line_ride_id"].unique()
    if len(unique_journeys) > max_journeys:
        print(
            f"🎯 Sampling {max_journeys} journeys from {len(unique_journeys):,} total journeys for faster analysis"
        )
        sampled_journeys = np.random.choice(unique_journeys, max_journeys, replace=False)
        valid_df = valid_df[valid_df["train_line_ride_id"].isin(sampled_journeys)]
    else:
        print(f"📊 Processing all {len(unique_journeys):,} train journeys")

    journey_times = []

    # Group by train journey (now with fewer journeys)
    for ride_id, group in valid_df.groupby("train_line_ride_id"):
        if len(group) < 2:  # Need at least 2 stations
            continue

        group = group.sort_values("train_line_station_num")

        for i in range(len(group) - 1):
            current_station = group.iloc[i]
            next_station = group.iloc[i + 1]

            # Calculate travel time between stations
            if pd.notna(current_station["departure_planned_time"]) and pd.notna(
                next_station["arrival_planned_time"]
            ):
                travel_time = (
                    next_station["arrival_planned_time"] - current_station["departure_planned_time"]
                ).total_seconds() / 60

                # Filter out unrealistic times (negative or extremely long)
                if 0 < travel_time < 300:  # Between 0 and 5 hours
                    journey_times.append(
                        {
                            "from_station": current_station["station"],
                            "to_station": next_station["station"],
                            "travel_time_min": travel_time,
                            "train_type": current_station["train_type"],
                        }
                    )

    if journey_times:
        journey_df = pd.DataFrame(journey_times)
        avg_time = journey_df["travel_time_min"].mean()
        median_time = journey_df["travel_time_min"].median()

        print(f"📏 Average time between stations: {avg_time:.1f} minutes")
        print(f"📏 Median time between stations: {median_time:.1f} minutes")
        print(f"📊 Total station-to-station segments analyzed: {len(journey_df):,}")

        # Time by train type
        print(f"\n🚄 Average travel time by train type:")
        type_times = (
            journey_df.groupby("train_type")["travel_time_min"].agg(["mean", "count"]).sort_values("mean")
        )
        for train_type, row in type_times.iterrows():
            if row["count"] > 10:  # Lower threshold since we're using a sample
                print(f"  {train_type}: {row['mean']:.1f} min (from {row['count']:,} segments)")

        return journey_df
    else:
        print("❌ No valid journey time data found")
        return None


def analyze_delays_and_cancellations(df):
    """Analyze delay and cancellation patterns."""
    print("\n🚨 DELAYS & CANCELLATIONS ANALYSIS")
    print("=" * 50)

    total_records = len(df)
    canceled_records = df["is_canceled"].sum()
    canceled_rate = canceled_records / total_records * 100

    print(
        f"❌ Cancellation rate: {canceled_rate:.2f}% ({canceled_records:,} out of {total_records:,} records)"
    )

    # Delay analysis (excluding canceled trains)
    non_canceled = df[~df["is_canceled"]]

    if len(non_canceled) > 0:
        avg_delay = non_canceled["delay_in_min"].mean()
        median_delay = non_canceled["delay_in_min"].median()
        on_time_rate = (non_canceled["delay_in_min"] <= 0).sum() / len(non_canceled) * 100

        print(f"⏰ Average delay: {avg_delay:.1f} minutes")
        print(f"⏰ Median delay: {median_delay:.1f} minutes")
        print(f"✅ On-time rate (≤0 min delay): {on_time_rate:.1f}%")

        # Delay distribution
        delay_ranges = [
            ("On time (≤0 min)", (non_canceled["delay_in_min"] <= 0).sum()),
            (
                "1-5 min late",
                ((non_canceled["delay_in_min"] > 0) & (non_canceled["delay_in_min"] <= 5)).sum(),
            ),
            (
                "6-15 min late",
                ((non_canceled["delay_in_min"] > 5) & (non_canceled["delay_in_min"] <= 15)).sum(),
            ),
            (
                "16-30 min late",
                ((non_canceled["delay_in_min"] > 15) & (non_canceled["delay_in_min"] <= 30)).sum(),
            ),
            (">30 min late", (non_canceled["delay_in_min"] > 30).sum()),
        ]

        print(f"\n📈 Delay distribution:")
        for desc, count in delay_ranges:
            percentage = count / len(non_canceled) * 100
            print(f"  {desc}: {percentage:.1f}% ({count:,} records)")


def analyze_train_types(df):
    """Analyze different train types and their characteristics."""
    print("\n🚅 TRAIN TYPE ANALYSIS")
    print("=" * 50)

    type_stats = (
        df.groupby("train_type")
        .agg({"delay_in_min": ["mean", "median"], "is_canceled": ["sum", "count"], "station": "nunique"})
        .round(2)
    )

    type_stats.columns = ["avg_delay", "median_delay", "cancellations", "total_records", "unique_stations"]
    type_stats["cancellation_rate"] = (type_stats["cancellations"] / type_stats["total_records"] * 100).round(
        2
    )
    type_stats = type_stats.sort_values("total_records", ascending=False)

    print("📊 Train type statistics (top 15 by frequency):")
    print(f"{'Type':<8} {'Records':<10} {'Avg Delay':<10} {'Cancel %':<9} {'Stations':<9}")
    print("-" * 55)

    for train_type, row in type_stats.head(15).iterrows():
        print(
            f"{train_type:<8} {int(row['total_records']):<10,} {row['avg_delay']:<10.1f} {row['cancellation_rate']:<9.1f} {int(row['unique_stations']):<9}"
        )


def analyze_temporal_patterns(df):
    """Analyze patterns by time of day, day of week, and month."""
    print("\n📅 TEMPORAL PATTERNS ANALYSIS")
    print("=" * 50)

    df = df.copy()
    df["hour"] = df["time"].dt.hour
    df["day_of_week"] = df["time"].dt.day_name()
    df["month"] = df["time"].dt.month_name()

    # Peak hours analysis
    hourly_records = df.groupby("hour").size().sort_index()
    peak_hour = hourly_records.idxmax()
    peak_count = hourly_records.max()

    print(f"🕐 Peak hour: {peak_hour}:00 with {peak_count:,} records")
    print(f"📊 Top 5 busiest hours:")
    for hour, count in hourly_records.nlargest(5).items():
        print(f"  {hour:2d}:00 - {count:,} records")

    # Day of week patterns
    daily_avg_delay = df[~df["is_canceled"]].groupby("day_of_week")["delay_in_min"].mean()
    daily_cancellation = df.groupby("day_of_week")["is_canceled"].mean() * 100

    # Order days properly
    day_order = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

    print(f"\n📈 Average delays by day of week:")
    for day in day_order:
        if day in daily_avg_delay:
            delay = daily_avg_delay[day]
            cancel_rate = daily_cancellation[day]
            print(f"  {day:<10}: {delay:.1f} min avg delay, {cancel_rate:.1f}% cancellation rate")


def create_visualizations(df, journey_df, station_counts):
    """Create visualizations of the analysis."""
    print("\n📊 CREATING VISUALIZATIONS")
    print("=" * 50)

    plt.style.use("default")
    fig, axes = plt.subplots(2, 3, figsize=(18, 12))
    fig.suptitle("Deutsche Bahn Train Statistics Analysis", fontsize=16, fontweight="bold")

    # 1. Top stations
    ax1 = axes[0, 0]
    top_stations = station_counts.head(10)
    ax1.bar(range(len(top_stations)), top_stations.values)
    ax1.set_title("Top 10 Busiest Stations")
    ax1.set_xlabel("Station Rank")
    ax1.set_ylabel("Number of Records")
    ax1.set_xticks(range(len(top_stations)))
    ax1.set_xticklabels([f"{i+1}" for i in range(len(top_stations))])

    # 2. Delay distribution
    ax2 = axes[0, 1]
    non_canceled = df[~df["is_canceled"]]
    delays = non_canceled["delay_in_min"]
    # Cap extremely high delays for better visualization
    delays_capped = np.clip(delays, -10, 60)
    ax2.hist(delays_capped, bins=50, alpha=0.7, color="orange")
    ax2.set_title("Distribution of Delays")
    ax2.set_xlabel("Delay (minutes, capped at 60)")
    ax2.set_ylabel("Frequency")
    ax2.axvline(x=0, color="red", linestyle="--", alpha=0.7, label="On Time")
    ax2.legend()

    # 3. Travel time between stations
    if journey_df is not None:
        ax3 = axes[0, 2]
        travel_times = np.clip(journey_df["travel_time_min"], 0, 120)  # Cap at 2 hours for visualization
        ax3.hist(travel_times, bins=30, alpha=0.7, color="green")
        ax3.set_title("Travel Time Between Stations")
        ax3.set_xlabel("Travel Time (minutes, capped at 120)")
        ax3.set_ylabel("Frequency")
    else:
        axes[0, 2].text(
            0.5,
            0.5,
            "No journey time data\navailable",
            ha="center",
            va="center",
            transform=axes[0, 2].transAxes,
        )
        axes[0, 2].set_title("Travel Time Between Stations")

    # 4. Hourly patterns
    ax4 = axes[1, 0]
    df_copy = df.copy()
    df_copy["hour"] = df_copy["time"].dt.hour
    hourly_counts = df_copy.groupby("hour").size()
    ax4.plot(hourly_counts.index, hourly_counts.values, marker="o")
    ax4.set_title("Train Activity by Hour of Day")
    ax4.set_xlabel("Hour of Day")
    ax4.set_ylabel("Number of Records")
    ax4.set_xticks(range(0, 24, 2))
    ax4.grid(True, alpha=0.3)

    # 5. Train type frequency
    ax5 = axes[1, 1]
    top_train_types = df["train_type"].value_counts().head(10)
    ax5.bar(range(len(top_train_types)), top_train_types.values)
    ax5.set_title("Top 10 Train Types by Frequency")
    ax5.set_xlabel("Train Type Rank")
    ax5.set_ylabel("Number of Records")
    ax5.set_xticks(range(len(top_train_types)))
    ax5.set_xticklabels([f"{i+1}" for i in range(len(top_train_types))])

    # 6. Cancellation rate by train type
    ax6 = axes[1, 2]
    type_cancel_rates = df.groupby("train_type").agg({"is_canceled": ["sum", "count"]})
    type_cancel_rates.columns = ["cancellations", "total"]
    type_cancel_rates["cancel_rate"] = type_cancel_rates["cancellations"] / type_cancel_rates["total"] * 100
    # Only show types with >1000 records
    significant_types = (
        type_cancel_rates[type_cancel_rates["total"] > 1000]
        .sort_values("cancel_rate", ascending=False)
        .head(10)
    )

    if len(significant_types) > 0:
        bars = ax6.bar(range(len(significant_types)), significant_types["cancel_rate"])
        ax6.set_title("Cancellation Rate by Train Type")
        ax6.set_xlabel("Train Type Rank")
        ax6.set_ylabel("Cancellation Rate (%)")
        ax6.set_xticks(range(len(significant_types)))
        ax6.set_xticklabels([f"{i+1}" for i in range(len(significant_types))])

        # Add value labels on bars
        for i, bar in enumerate(bars):
            height = bar.get_height()
            ax6.text(
                bar.get_x() + bar.get_width() / 2.0,
                height,
                f"{height:.1f}%",
                ha="center",
                va="bottom",
                fontsize=8,
            )
    else:
        ax6.text(0.5, 0.5, "Insufficient data", ha="center", va="center", transform=ax6.transAxes)

    plt.tight_layout()
    plt.savefig("deutsche_bahn_analysis.png", dpi=300, bbox_inches="tight")
    print("📈 Visualizations saved as 'deutsche_bahn_analysis.png'")

    return fig


def main():
    """Main analysis function."""
    print("🇩🇪 Deutsche Bahn Train Data Analysis")
    print("=" * 60)

    # Load data (sample for faster analysis)
    df = load_sample_data(sample_months=3, sample_fraction=0.2)  # Use recent 3 months, 20% sample

    # Run all analyses
    station_counts = analyze_stations(df)
    journey_df = calculate_time_between_stations(df)
    analyze_delays_and_cancellations(df)
    analyze_train_types(df)
    analyze_temporal_patterns(df)

    # Create visualizations
    fig = create_visualizations(df, journey_df, station_counts)

    # Summary statistics
    print("\n📋 SUMMARY STATISTICS")
    print("=" * 50)
    print(f"📊 Total records analyzed: {len(df):,}")
    print(
        f"📅 Time period: {df['time'].min().strftime('%Y-%m-%d')} to {df['time'].max().strftime('%Y-%m-%d')}"
    )
    print(f"🏢 Unique stations: {df['station'].nunique():,}")
    print(f"🚂 Unique train names: {df['train_name'].nunique():,}")
    print(f"🎫 Unique train types: {df['train_type'].nunique():,}")
    print(f"🛤️  Unique train journeys: {df['train_line_ride_id'].nunique():,}")

    if journey_df is not None:
        print(f"⏱️  Average time between stations: {journey_df['travel_time_min'].mean():.1f} minutes")

    overall_delay = df[~df["is_canceled"]]["delay_in_min"].mean()
    overall_cancel_rate = df["is_canceled"].mean() * 100
    print(f"🚨 Overall average delay: {overall_delay:.1f} minutes")
    print(f"❌ Overall cancellation rate: {overall_cancel_rate:.2f}%")

    print("\n✅ Analysis complete! Check 'deutsche_bahn_analysis.png' for visualizations.")


if __name__ == "__main__":
    main()
