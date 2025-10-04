#!/usr/bin/env python3
"""
This script is taking a csv event dataset that is already split into our internal arrival/departure format, and then processing the events to build a dataset that can be immediately be put into most classical ML methods for tabular learning.
"""

import csv
import dataclasses
from datetime import datetime
from enum import StrEnum
import itertools
import json


class EventType(StrEnum):
    DEPARTURE = "DEPARTURE"
    ARRIVAL = "ARRIVAL"
    CANCELLATION = "CANCELLATION"


@dataclasses.dataclass
class Arrival_or_Departure_Event:
    event_type: EventType
    id_: str
    train_name: str
    delay_min: int
    from_station: str
    to_station: str
    station_num: int
    timestamp: datetime
    expected_next_event_time: datetime | None
    final_destination_station: str


@dataclasses.dataclass
class Model_Input:
    event_type: float
    expected_next_event_time: tuple[float, float, float, float, float]
    timestamp: tuple[float, float, float, float, float]
    delay_min: float
    from_station: int
    to_station: int
    station_num: int
    distance: float

    def flatten(self) -> list[float]:
        return (
            [self.event_type]
            + list(self.expected_next_event_time)
            + list(self.timestamp)
            + [self.delay_min, self.from_station, self.to_station, self.station_num, self.distance]
        )


def datetime_feature_map(time: datetime) -> tuple[float, float, float, float, float]:
    month = time.month / 12
    day = time.day / 31
    hour = time.hour / 23
    min = time.minute / 59
    second = time.second / 59
    weekend = time.weekday() / 6

    return (month, day, hour, min, second, weekend)


def load_csv(input_path: str) -> list[Arrival_or_Departure_Event]:
    events = []
    with open(input_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # print(row)
            event = Arrival_or_Departure_Event(
                event_type=EventType(row["event_type"]),
                id_=str(row["id_"]),
                train_name=row["train_name"],
                delay_min=int(row["delay_min"]),
                from_station=row["from_station"],
                to_station=row["to_station"],
                station_num=int(row["station_num"]),
                timestamp=datetime.fromisoformat(row["timestamp"]),
                expected_next_event_time=datetime.fromisoformat(row["expected_next_event_time"])
                if row["expected_next_event_time"]
                else None,
                final_destination_station=row["final_destination_station"],
            )
            events.append(event)
    return events


graph = json.load(open("dashboard/src/data/graph_structure.json", "r", encoding="utf-8"))
print(graph.keys())
rows = load_csv("dashboard/src/data/ice_journey_events.csv")


event_dict: dict[str, list[Arrival_or_Departure_Event]] = {}
for event in rows:
    if event.id_ not in event_dict:
        event_dict[event.id_] = []
    event_dict[event.id_].append(event)


def window(seq, n=2):
    "Returns a sliding window (of width n) over data from the iterable"
    "   s -> (s0,s1,...s[n-1]), (s1,s2,...,sn), ...                   "
    it = iter(seq)
    result = tuple(itertools.islice(it, n))
    if len(result) == n:
        yield result
    for elem in it:
        result = result[1:] + (elem,)
        yield result


rows: list[Model_Input] = []
delays: list[float] = []
n = len(graph["stationNameToId"])
station_name_to_new_id = {
    station_name: i / n for station_name, i in zip(graph["stationNameToId"].keys(), range(0, n))
}

for journey_id, events in event_dict.items():
    events = sorted(events, key=lambda e: e.timestamp)  # Ensure chronological order

    # Handle cases where we have 2 events (no previous event for delay calculation)
    for i in range(len(events)):
        if i + 1 < len(events):  # Need at least 2 events
            past_event = events[i] if i > 0 else None
            current_event = events[i + 1]
            next_event = events[i + 2] if i + 2 < len(events) else None

            if current_event.expected_next_event_time is None:
                continue  # Skip events without expected next time

            map_ = {EventType.DEPARTURE: 1.0, EventType.ARRIVAL: 0.0, EventType.CANCELLATION: -1.0}
            mapped_value = map_[current_event.event_type]

            # Calculate delay - if no past event, use zero as past delay
            if past_event is None:
                delay = 0.0  # No previous event, so no historical delay
            else:
                delay = ((current_event.timestamp - past_event.expected_next_event_time).total_seconds()) / 60

            from_station_id = graph["stationNameToId"][current_event.from_station]
            to_station_id = graph["stationNameToId"][current_event.to_station]
            # Find the edge between from_station_id and to_station_id (order doesn't matter)
            edge = next(
                (
                    e
                    for e in graph["edges"]
                    if (str(from_station_id) == str(e[0]) and str(to_station_id) == str(e[1]))
                    or (str(from_station_id) == str(e[1]) and str(to_station_id) == str(e[0]))
                ),
                None,
            )

            # edge will be a list like [from_id, to_id, distance, duration]
            rows.append(
                Model_Input(
                    event_type=mapped_value,
                    expected_next_event_time=datetime_feature_map(current_event.expected_next_event_time),
                    timestamp=datetime_feature_map(current_event.timestamp),
                    delay_min=delay,
                    from_station=station_name_to_new_id[current_event.from_station],
                    to_station=station_name_to_new_id[current_event.to_station],
                    station_num=current_event.station_num,
                    distance=edge[2],
                ).flatten()
            )

            # Calculate target delay for training
            if next_event is not None:
                actual_delay = (
                    (next_event.timestamp - current_event.expected_next_event_time).total_seconds()
                ) / 60
                delays.append(actual_delay)
            else:
                # No next event available - cannot train for this example
                delays.append(0.0)  # or skip by not appending

print(delays)
with open("dataset.csv", "w", encoding="utf-8") as f:
    for x, y in zip(rows, delays):
        f.write(",".join([str(i) for i in x + [y]]))
        f.write("\n")
