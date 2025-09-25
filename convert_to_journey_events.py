#!/usr/bin/env python3
"""
Convert station-based CSV to journey-based CSV with separate departure/arrival events.
Simple version without pandas dependency.
"""

import csv
import sys
from datetime import datetime


def convert_to_journey_events(input_file: str, output_file: str):
    """Convert station-based events to journey-based events."""

    print(f"Reading {input_file}...")

    # Read the original CSV
    with open(input_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        original_rows = list(reader)

    print(f"Original data: {len(original_rows)} rows")

    journey_events = []

    # Group by ride_id
    rides = {}
    for row in original_rows:
        ride_id = row["train_line_ride_id"]
        if ride_id not in rides:
            rides[ride_id] = []
        rides[ride_id].append(row)

    # Process each ride
    for ride_id, ride_rows in rides.items():
        print(f"Processing ride {ride_id} with {len(ride_rows)} stations")

        # Sort by station number
        ride_rows.sort(key=lambda x: int(x["train_line_station_num"]))

        # Process each station-to-station segment
        for i in range(len(ride_rows)):
            current_station = ride_rows[i]

            # Skip departure events for the final station (no self-loops)
            if i == len(ride_rows) - 1:
                continue

            # Determine destination station (next station)
            to_station = ride_rows[i + 1]["station"]

            # Create departure event
            departure_event = {
                "event_type": "departure",
                "train_line_ride_id": ride_id,
                "from_station": current_station["station"],
                "to_station": to_station,
                "train_line_station_num": current_station["train_line_station_num"],
                "delay_in_min": current_station["delay_in_min"],
                "actual_timestamp": current_station["departure_change_time"]
                if current_station["departure_change_time"]
                else current_station["departure_planned_time"],
                "planned_timestamp": current_station["departure_planned_time"],
                "expected_arrival_timestamp": ride_rows[i + 1]["arrival_planned_time"],
                "final_destination_station": current_station["final_destination_station"],
                "is_canceled": current_station["is_canceled"],
            }
            journey_events.append(departure_event)

            # Create arrival event for next station (if not the last station)
            if i + 1 < len(ride_rows):
                next_station = ride_rows[i + 1]
                arrival_event = {
                    "event_type": "arrival",
                    "train_line_ride_id": ride_id,
                    "from_station": current_station["station"],
                    "to_station": next_station["station"],
                    "train_line_station_num": next_station["train_line_station_num"],
                    "delay_in_min": next_station["delay_in_min"],
                    "actual_timestamp": next_station["arrival_change_time"]
                    if next_station["arrival_change_time"]
                    else next_station["arrival_planned_time"],
                    "planned_timestamp": next_station["arrival_planned_time"],
                    "expected_departure_timestamp": next_station["departure_planned_time"],
                    "final_destination_station": current_station["final_destination_station"],
                    "is_canceled": next_station["is_canceled"],
                }
                journey_events.append(arrival_event)

    # Sort by actual timestamp
    journey_events.sort(key=lambda x: int(x["actual_timestamp"]))

    print(f"Generated {len(journey_events)} journey events")

    # Count event types
    departure_count = sum(1 for e in journey_events if e["event_type"] == "departure")
    arrival_count = sum(1 for e in journey_events if e["event_type"] == "arrival")
    print(f"Event types: departure={departure_count}, arrival={arrival_count}")

    # Write to new CSV
    fieldnames = [
        "event_type",
        "train_line_ride_id",
        "from_station",
        "to_station",
        "train_line_station_num",
        "delay_in_min",
        "actual_timestamp",
        "planned_timestamp",
        "expected_arrival_timestamp",
        "expected_departure_timestamp",
        "final_destination_station",
        "is_canceled",
    ]

    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(journey_events)

    print(f"Saved to {output_file}")

    # Show sample
    print("\nSample of new format:")
    for i, event in enumerate(journey_events[:10]):
        actual_ms = int(event["actual_timestamp"])
        planned_ms = int(event["planned_timestamp"])
        actual_str = datetime.fromtimestamp(actual_ms / 1000).strftime("%H:%M:%S")
        planned_str = datetime.fromtimestamp(planned_ms / 1000).strftime("%H:%M:%S")

        # Show expected times for context
        expected_info = ""
        if event["event_type"] == "departure" and event["expected_arrival_timestamp"]:
            expected_arrival_ms = int(event["expected_arrival_timestamp"])
            expected_arrival_str = datetime.fromtimestamp(expected_arrival_ms / 1000).strftime("%H:%M:%S")
            expected_info = f" (expected arrival: {expected_arrival_str})"
        elif event["event_type"] == "arrival" and event["expected_departure_timestamp"]:
            expected_departure_ms = int(event["expected_departure_timestamp"])
            expected_departure_str = datetime.fromtimestamp(expected_departure_ms / 1000).strftime("%H:%M:%S")
            expected_info = f" (expected departure: {expected_departure_str})"

        print(
            f"{i+1:2d}. {event['event_type']:9s} {event['train_line_ride_id']} {event['from_station']:20s} → {event['to_station']:20s}"
        )
        print(f"    Actual: {actual_str} | Planned: {planned_str}{expected_info}")

    return journey_events


def main():
    input_file = "dashboard/src/data/ice.csv"
    output_file = "dashboard/src/data/ice_journey_events.csv"

    try:
        journey_events = convert_to_journey_events(input_file, output_file)
        print(f"\n✅ Successfully converted {input_file} to {output_file}")
        print(f"📊 Generated {len(journey_events)} journey events")

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
