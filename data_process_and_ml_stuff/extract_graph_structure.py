#!/usr/bin/env python3
"""
Graph Structure Extractor for Deutsche Bahn Data

This script processes the ICE CSV data to extract a static graph structure
containing stations, edges and their distances, and centrality measures, which might be used for ML features.

It produces a JSON file that encodes the rail network as an adjacency graph.
"""

import dataclasses
import json
import csv
import math
from collections import defaultdict
from datetime import datetime
import convert_to_journey_events as ctje


def load_stations_index(stations_file: str) -> dict[str, dict[str, str | float | None]]:
    """Load station coordinates."""
    with open(stations_file, "r", encoding="utf-8") as f:
        return json.load(f)


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in kilometers."""
    R = 6371  # Earth's radius in km

    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)

    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


class Station:
    def __init__(self, name: str, lat: float, lon: float):
        self.name = name
        self.lat = lat
        self.lon = lon
        self.degree: int | None = None
        self.closenessCentrality: float | None = None

    def to_dict(self):
        return {
            "name": self.name,
            "lat": self.lat,
            "lon": self.lon,
            "degree": self.degree,
            "closenessCentrality": self.closenessCentrality,
        }


@dataclasses.dataclass(frozen=True)
class Edge:
    from_station: int
    to_station: int
    distance_km: float


def order(a, b):
    return (b, a) if a > b else (a, b)


def extract_stations_and_edges(
    csv_file: str, stations_locations: dict[str, dict[str, str | float | None]]
) -> tuple[
    dict[int, Station], dict[tuple[int, int], tuple[float, int]], dict[str, int], dict[tuple[int, int], int]
]:
    """Extract stations and edges from CSV data."""

    events: list[ctje.Arrival_or_Departure_Event] = []
    # Load the CSV back into a list of Arrival_or_Departure_Event objects
    with open(csv_file, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Convert string fields to proper types
            actual_time = datetime.fromisoformat(row["timestamp"])
            expected_time = (
                datetime.fromisoformat(row["expected_next_event_time"])
                if row["expected_next_event_time"]
                else None
            )
            event_type = ctje.EventType[row["event_type"]]

            event = ctje.Arrival_or_Departure_Event(
                event_type=event_type,
                id_=int(row["id_"]),  # Convert string back to int for processing
                train_name=row["train_name"],
                delay_min=int(row["delay_min"]),
                from_station=row["from_station"],
                to_station=row["to_station"],
                station_num=int(row["station_num"]),
                timestamp=actual_time,
                expected_next_event_time=expected_time,
                final_destination_station=row["final_destination_station"],
            )
            events.append(event)

    # Track unique stations and their coordinates
    stations: dict[int, Station] = {}
    edge_dist_freq: dict[tuple[int, int], tuple[float, int]] = dict()
    station_name_to_id: dict[str, int] = {}

    # Track which stations we've seen
    seen_stations = set[str]()
    seen_edges = set[tuple[int, int]]()

    for event in events:
        station_name = event.to_station
        if station_name not in seen_stations:
            seen_stations.add(station_name)
            coords = stations_locations.get(station_name)
            if coords is None:
                raise ValueError(f"Station {station_name} not found in stations_locations")
            lat = coords["lat"]
            lon = coords["lon"]
            if lat is None or lon is None:
                raise ValueError(f"Station {station_name} has missing coordinates")
            stations[hash(station_name)] = Station(
                name=station_name,
                lat=float(lat),
                lon=float(lon),
            )
            station_name_to_id[station_name] = hash(station_name)

    for event in events:
        key = order(hash(event.from_station), hash(event.to_station))
        if key not in seen_edges:
            seen_edges.add(key)
            edge_dist_freq[key] = (
                calculate_distance(
                    stations[hash(event.from_station)].lat,
                    stations[hash(event.from_station)].lon,
                    stations[hash(event.to_station)].lat,
                    stations[hash(event.to_station)].lon,
                ),
                0,
            )
        (dist, freq) = edge_dist_freq[key]
        edge_dist_freq[key] = (dist, freq + 1)

    print(f"Found {len(stations)} unique stations")

    # assert no self loops
    for edge in edge_dist_freq.keys():
        assert edge[0] != edge[1]

    return stations, edge_dist_freq, station_name_to_id


def build_sparse_adjacency(edges: dict[tuple[int, int], float]) -> dict[int, set[int]]:
    """Build sparse adjacency list from stations and edges."""
    adjacency = defaultdict(set)
    for edge in edges.keys():
        from_id = edge[0]
        to_id = edge[1]

        # Undirected graph
        adjacency[from_id].add(to_id)
        adjacency[to_id].add(from_id)

    return dict(adjacency)


def calculate_degree_centrality(adjacency: dict[int, set[int]]) -> dict[int, int]:
    """Calculate degree centrality for each station."""
    return {station_id: len(neighbors) for station_id, neighbors in adjacency.items()}


def calculate_closeness_centrality(adjacency: dict[int, set[int]], num_stations: int) -> dict[int, float]:
    """Calculate closeness centrality using BFS."""
    closeness = {}

    for source in adjacency.keys():
        # BFS to find shortest distances
        distances = {}
        queue = [(source, 0)]
        visited = {source}

        while queue:
            node, dist = queue.pop(0)
            distances[node] = dist

            for neighbor in adjacency.get(node, set()):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append((neighbor, dist + 1))

        # Calculate closeness centrality
        if len(distances) > 1:
            total_distance = sum(distances.values())
            closeness[source] = (len(distances) - 1) / total_distance if total_distance > 0 else 0
        else:
            closeness[source] = 0

    return closeness


def print_statistics(stations: dict[int, Station], edges: dict[tuple[int, int], float]):
    # Print some statistics
    print("\nTop 5 stations by degree centrality:")
    sorted_stations: list[tuple[int, Station]] = sorted(
        stations.items(), key=lambda x: x[1].degree or 0, reverse=True
    )
    for i, (station_id, station_data) in enumerate(sorted_stations[:5]):
        print(f"  {i + 1}. {station_data.name} (degree: {station_data.degree})")

    print("\nBottom 5 stations by degree centrality:")
    for i, (station_id, station_data) in enumerate(sorted_stations[-5:]):
        print(f"  {i + 1}. {station_data.name} (degree: {station_data.degree})")

    print("\nTop 5 stations by closeness centrality:")
    sorted_closeness: list[tuple[int, Station]] = sorted(
        stations.items(), key=lambda x: x[1].closenessCentrality or 0.0, reverse=True
    )
    for i, (station_id, station_data) in enumerate(sorted_closeness[:5]):
        print(f"  {i + 1}. {station_data.name} (closeness: {station_data.closenessCentrality:.3f})")

    print("\nBottom 5 stations by closeness centrality:")
    for i, (station_id, station_data) in enumerate(sorted_closeness[-5:]):
        print(f"  {i + 1}. {station_data.name} (closeness: {station_data.closenessCentrality:.3f})")


if __name__ == "__main__":
    # File paths
    csv_file = "dashboard/src/data/ice_journey_events.csv"
    mapping_file = "dashboard/src/data/alternative_station_name_to_station_name.json"
    stations_file = "station_cache/stations_index.json"
    output_file = "dashboard/src/data/graph_structure.json"

    print("=== Deutsche Bahn Graph Structure Extractor ===")
    print(f"Processing CSV: {csv_file}")
    print(f"Using mapping: {mapping_file}")
    print(f"Using stations: {stations_file}")
    print(f"Output: {output_file}")
    print()

    # Load mapping and station data
    print("Loading station mapping and coordinates...")
    stations_index = load_stations_index(stations_file)

    # Extract stations and edges
    stations, edges, station_name_to_id = extract_stations_and_edges(csv_file, stations_index)

    # Build sparse adjacency structure
    print("Building sparse adjacency structure...")
    adjacency = build_sparse_adjacency(edges)

    # Calculate centrality measures
    print("Calculating centrality measures...")
    degree_centrality = calculate_degree_centrality(adjacency)
    closeness_centrality = calculate_closeness_centrality(adjacency, len(stations))

    # Add centrality measures to stations
    for station_id_str, station_data in stations.items():
        station_id = int(station_id_str)
        station_data.degree = degree_centrality.get(station_id, 0)
        station_data.closenessCentrality = closeness_centrality.get(station_id, 0.0)

    # Create final graph structure
    graph_structure = {
        "metadata": {
            "version": "1.0",
            "created": datetime.now().isoformat(),
            "totalStations": len(stations),
            "totalEdges": len(edges),
            "description": "Static graph structure for Deutsche Bahn network",
        },
        "stations": {str(station_id): station.to_dict() for station_id, station in stations.items()},
        "edges": [
            (str(edge[0]), str(edge[1]), distance, frequency) for edge, (distance, frequency) in edges.items()
        ],
        "stationNameToId": {name: str(station_id) for name, station_id in station_name_to_id.items()},
    }

    # Write output
    print(f"Writing graph structure to {output_file}...")
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(graph_structure, f, indent=2, ensure_ascii=False)

    print()
    print("=== Extraction Complete ===")
    print(f"Stations: {len(stations)}")
    print(f"Edges: {len(edges)}")
    print(f"Output written to: {output_file}")

    print_statistics(stations, edges)
