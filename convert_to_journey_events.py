#!/usr/bin/env python3
"""
Convert station-based CSV to journey-based CSV with separate departure/arrival events.
"""

import csv
import dataclasses
from datetime import datetime
from enum import StrEnum
import itertools
import json


@dataclasses.dataclass
class JointEvent:
    id_: int
    train_name: str
    station: str
    station_num: int
    actual_arrival_time: datetime | None
    expected_arrival_time: datetime | None
    actual_departure_time: datetime | None
    expected_departure_time: datetime | None
    delay_in_min: int
    is_canceled: bool
    final_destination_station: str


class EventType(StrEnum):
    DEPARTURE = "DEPARTURE"
    ARRIVAL = "ARRIVAL"
    CANCELLATION = "CANCELLATION"


@dataclasses.dataclass
class Arrival_or_Departure_Event:
    event_type: EventType
    id_: int
    train_name: str
    delay_min: int
    from_station: str
    to_station: str
    station_num: int
    timestamp: datetime
    expected_next_event_time: datetime | None
    final_destination_station: str


def build_departure_event(
    current_segment: JointEvent, next_segment: JointEvent
) -> Arrival_or_Departure_Event:
    assert current_segment.actual_departure_time is not None
    if (current_segment.expected_arrival_time is None):
        expected_arrival_time = next_segment.actual_arrival_time
    else:
        expected_arrival_time = current_segment.expected_arrival_time
    assert expected_arrival_time is not None
    return Arrival_or_Departure_Event(
        event_type=EventType.DEPARTURE,
        id_=current_segment.id_,
        train_name=current_segment.train_name,
        delay_min=current_segment.delay_in_min,
        from_station=current_segment.station,
        to_station=next_segment.station,
        station_num=current_segment.station_num,
        timestamp=current_segment.actual_departure_time,
        expected_next_event_time = expected_arrival_time,
        final_destination_station=current_segment.final_destination_station,
    )


def build_arrival_event(current_segment: JointEvent, next_segment: JointEvent) -> Arrival_or_Departure_Event:
    assert next_segment.actual_arrival_time is not None
    if (next_segment.expected_departure_time is None):
        expected_departure_time = None
    else:
        expected_departure_time = next_segment.expected_departure_time
    return Arrival_or_Departure_Event(
        event_type=EventType.ARRIVAL,
        id_=current_segment.id_,
        train_name=current_segment.train_name,
        delay_min=current_segment.delay_in_min,
        from_station=current_segment.station,
        to_station=next_segment.station,
        station_num=next_segment.station_num,
        timestamp=next_segment.actual_arrival_time,
        expected_next_event_time=expected_departure_time,
        final_destination_station=current_segment.final_destination_station,
    )


def build_arrival_cancellation_event(
    current_segment: JointEvent, next_segment: JointEvent
) -> Arrival_or_Departure_Event:
    assert (not current_segment.is_canceled) and next_segment.is_canceled
    event = build_arrival_event(current_segment, next_segment)
    event.event_type = EventType.CANCELLATION
    return event


def convert_to_journey_events(input_file: str, output_file: str, name_mapping: dict[str, str]):
    """Convert station-based events to journey-based events."""

    # Read the original CSV
    with open(input_file, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        original_rows = list(reader)

    print(f"Original data: {len(original_rows)} rows")

    # Go through all rows and build segments
    segments: list[JointEvent] = []
    for jointevent_ in original_rows:
        station_num = int(jointevent_["train_line_station_num"])
        departure_change_time = jointevent_["departure_change_time"]
        departure_planned_time = jointevent_["departure_planned_time"]
        arrival_change_time = jointevent_["arrival_change_time"]
        arrival_planned_time = jointevent_["arrival_planned_time"]
        station = jointevent_["station"]
        final_destination_station = jointevent_["final_destination_station"]
        segments.append(
            JointEvent(
                id_=jointevent_["train_line_ride_id"],
                station_num=station_num,
                train_name=jointevent_["train_name"],
                station=name_mapping.get(station, station),
                actual_departure_time=datetime.fromisoformat(departure_change_time)
                if departure_change_time
                else None,
                expected_departure_time=datetime.fromisoformat(departure_planned_time)
                if departure_planned_time
                else None,
                actual_arrival_time=datetime.fromisoformat(arrival_change_time) if station_num > 1 else None,
                expected_arrival_time=datetime.fromisoformat(arrival_planned_time)
                if station_num > 1
                else None,
                delay_in_min=int(jointevent_["delay_in_min"]),
                is_canceled=jointevent_["is_canceled"] == "True",  # wack code for boolean
                final_destination_station=name_mapping.get(
                    final_destination_station, final_destination_station
                ),
            )
        )

    # Group by ride_id
    rides: dict[int, list[JointEvent]] = {}
    for jointevent in segments:
        if jointevent.id_ not in rides:
            rides[jointevent.id_] = []
        rides[jointevent.id_].append(jointevent)

    journey_events: list[Arrival_or_Departure_Event] = []

    # Process each ride and convert to journey events
    for ride_id, ride_rows in rides.items():
        #print(f"Processing ride {ride_id} with {len(ride_rows)} stations")

        # Sort by station number
        ride_rows.sort(key=lambda x: x.station_num)
        if ride_rows[0].station_num != 1:
            continue  # skip rides that don't start at station 1
        illegal_journey = False
        for current_station, next_station in itertools.pairwise(ride_rows):
            if current_station.actual_departure_time > next_station.actual_arrival_time:
                illegal_journey = True
                print("First if")
                break
            if current_station.actual_arrival_time is not None and current_station.actual_departure_time is not None:
                if current_station.actual_arrival_time > current_station.actual_departure_time:
                    illegal_journey = True
                    print("Second if")

                    break
        if illegal_journey: continue


        
        

        if ride_id == "-5665409642092229233-2407020558":
            print(ride_rows)

        if ride_rows[-1].station != ride_rows[-1].final_destination_station and not ride_rows[-1].is_canceled:
            continue  # skip rides where the last stop isn't the final destination station (and were not canceled)

        numbers = {station.station_num: i for station, i in zip(ride_rows, range(len(ride_rows)))}
        print(numbers)
        to_add = []

        for current_station, next_station in itertools.pairwise(ride_rows):
            departure_event = build_departure_event(current_station, next_station)
            if (not current_station.is_canceled) and next_station.is_canceled:
                cancellation_event = build_arrival_cancellation_event(current_station, next_station)
                to_add.extend([departure_event, cancellation_event])
            else:
                arrival_event = build_arrival_event(current_station, next_station)
                to_add.extend([departure_event, arrival_event])

        for event in to_add:
            event.station_num = numbers[event.station_num]

        journey_events.extend(to_add)
            


    # Sort by actual timestamp
    journey_events.sort(key=lambda x: x.timestamp)

    print(f"Generated {len(journey_events)} journey events")

    # Count unique stations:
    unique_stations = set()
    for event in journey_events:
        unique_stations.add(event.to_station)
        if event.from_station:  # Add from_station if it exists
            unique_stations.add(event.from_station)
    print(f"\nFound {len(unique_stations)} unique stations")

    # Count event types
    departure_count = len([e for e in journey_events if e.event_type == EventType.DEPARTURE])
    arrival_count = len([e for e in journey_events if e.event_type == EventType.ARRIVAL])
    cancellation_count = len([e for e in journey_events if e.event_type == EventType.CANCELLATION])
    print(
        f"Event types: departure={departure_count}, arrival={arrival_count}, cancellation={cancellation_count}"
    )
    assert arrival_count + cancellation_count == departure_count

    # Count final-destination type arrivals (to-station is the final destination station)
    final_destination_arrivals = len(
        [
            e
            for e in journey_events
            if e.to_station == e.final_destination_station and e.event_type == EventType.ARRIVAL
        ]
    )
    print(f"Final-destination type arrivals: {final_destination_arrivals}")

    # Write to new CSV
    fieldnames = list(Arrival_or_Departure_Event.__dataclass_fields__.keys())

    with open(output_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        # Convert id_ to string to preserve precision in JavaScript
        for event in journey_events:
            event_dict = event.__dict__.copy()
            event_dict["id_"] = str(event_dict["id_"])
            writer.writerow(event_dict)

    print(f"Saved to {output_file}")

    # Show sample
    print("\nSample of new format:")
    for i, event in enumerate(journey_events[:10]):
        actual_str = event.timestamp.strftime("%H:%M:%S")
        planned_str = (
            event.expected_next_event_time.strftime("%H:%M:%S") if event.expected_next_event_time else "N/A"
        )

        # Show expected times for context
        expected_info = ""
        if event.event_type == EventType.DEPARTURE and event.expected_next_event_time:
            expected_arrival_str = event.expected_next_event_time.strftime("%H:%M:%S")
            expected_info = f" (expected arrival: {expected_arrival_str})"
        elif event.event_type == EventType.ARRIVAL and event.expected_next_event_time:
            expected_departure_str = event.expected_next_event_time.strftime("%H:%M:%S")
            expected_info = f" (expected departure: {expected_departure_str})"

        print(
            f"{i + 1:2d}. {event.event_type:9s} {event.id_} {event.from_station:20s} → {event.to_station:20s}"
        )
        print(f"    Actual: {actual_str} | Planned: {planned_str}{expected_info}")

    return journey_events


def load_station_mapping(mapping_file: str) -> dict[str, str]:
    """Load the alternative station name mapping."""
    with open(mapping_file, encoding="utf-8") as f:
        return json.load(f)


def main():
    input_file = "dashboard/src/data/ice.csv"
    output_file = "dashboard/src/data/ice_journey_events.csv"

    try:
        name_mapping = load_station_mapping(
            "dashboard/src/data/alternative_station_name_to_station_name.json"
        )
        journey_events = convert_to_journey_events(input_file, output_file, name_mapping)
        print(f"\n✅ Successfully converted {input_file} to {output_file}")
        print(f"📊 Generated {len(journey_events)} journey events")

    except Exception as e:
        print("❌ Error")
        raise e


if __name__ == "__main__":
    main()
