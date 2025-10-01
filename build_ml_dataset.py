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

    def flatten(self) -> list[float]:
        return [self.event_type] + list(self.expected_next_event_time) + list(self.timestamp) + [self.delay_min, self.from_station, self.to_station, self.station_num]

def datetime_feature_map(time: datetime) -> tuple[float, float, float, float, float]:
    month = time.month / 12
    day = time.day / 31
    hour = time.hour / 23
    min = time.minute / 59
    second = time.second / 59
    weekend = time.weekday()/ 6
    
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
                expected_next_event_time=datetime.fromisoformat(row["expected_next_event_time"]) if row["expected_next_event_time"] else None,
                final_destination_station=row["final_destination_station"]
            )
            events.append(event)
    return events




rows = load_csv('dashboard/src/data/ice_journey_events.csv')


event_dict: dict[str, list[Arrival_or_Departure_Event]]= {}
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

for journey_id, events in event_dict.items():

    for past_event, current_event, next_event in window(events, 3):
        assert(current_event.expected_next_event_time is not None), f"Previous event: {past_event}\n Current event: {current_event}\n Next event {next_event}"
        past_event: Arrival_or_Departure_Event
        current_event: Arrival_or_Departure_Event
        next_event: Arrival_or_Departure_Event
        map_ = {EventType.DEPARTURE: 1.0, EventType.ARRIVAL: 0.0, EventType.CANCELLATION: -1.0}
        mapped_value = map_[current_event.event_type]
        delay = ((current_event.timestamp - past_event.expected_next_event_time).total_seconds()) / 60
        rows.append(Model_Input(event_type=mapped_value, 
                                expected_next_event_time= datetime_feature_map(current_event.expected_next_event_time),
                                timestamp=datetime_feature_map(current_event.timestamp),
                                delay_min=delay,
                                from_station=0,
                                to_station=0,
                                station_num=current_event.station_num
                                ).flatten())
        actual_delay =((next_event.timestamp - current_event.expected_next_event_time).total_seconds()) / 60
        delays.append(actual_delay)



print(delays)
