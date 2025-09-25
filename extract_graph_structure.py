#!/usr/bin/env python3
"""
Graph Structure Extractor for Deutsche Bahn Data

This script processes the ICE CSV data to extract a static graph structure
containing stations, edges, and centrality measures.

Phase 1: Extract stations and edges from CSV
Phase 2: Compute centrality measures using sparse adjacency
"""

import json
import csv
import math
from collections import defaultdict, Counter
from typing import Dict, List, Set, Tuple, Any
import sys
from datetime import datetime


def load_station_mapping(mapping_file: str) -> Dict[str, str]:
    """Load the alternative station name mapping."""
    with open(mapping_file, "r", encoding="utf-8") as f:
        return json.load(f)


def load_stations_index(stations_file: str) -> Dict[str, Dict[str, float]]:
    """Load station coordinates."""
    with open(stations_file, "r", encoding="utf-8") as f:
        return json.load(f)


def normalize_station_name(name: str, mapping: Dict[str, str]) -> str:
    """Normalize station name using the mapping file."""
    return mapping.get(name, name)


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


def extract_stations_and_edges(
    csv_file: str, mapping: Dict[str, str], stations_index: Dict[str, Dict[str, float]]
) -> Tuple[Dict[str, Dict], Dict[str, Dict], Dict[str, int]]:
    """Extract stations and edges from CSV data."""

    print("Loading CSV data...")

    # Track unique stations and their coordinates
    stations = {}
    station_name_to_id = {}
    next_station_id = 0

    # Track edges (station pairs) and their frequencies
    edge_frequencies = Counter()
    edge_distances = {}

    # Track which stations we've seen
    seen_stations = set()

    with open(csv_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row_num, row in enumerate(reader):
            if row_num % 10000 == 0:
                print(f"Processed {row_num} rows...")

            # Get station name and normalize it
            station_name = row.get("station", "").strip()
            if not station_name:
                continue

            normalized_name = normalize_station_name(station_name, mapping)

            # Add station if not seen before
            if normalized_name not in seen_stations:
                seen_stations.add(normalized_name)

                # Get coordinates
                coords = stations_index.get(normalized_name, {"lat": 0.0, "lon": 0.0})

                stations[str(next_station_id)] = {
                    "name": normalized_name,
                    "lat": coords["lat"],
                    "lon": coords["lon"],
                }

                station_name_to_id[normalized_name] = next_station_id
                next_station_id += 1

    print(f"Found {len(stations)} unique stations")

    # Now process rides to extract edges
    print("Extracting edges from rides...")

    with open(csv_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)

        # Group events by ride
        rides = defaultdict(list)

        for row in reader:
            ride_id = row.get("train_line_ride_id", "").strip()
            station_name = row.get("station", "").strip()
            station_num = row.get("train_line_station_num", "0")

            if not ride_id or not station_name:
                continue

            normalized_name = normalize_station_name(station_name, mapping)

            if normalized_name in station_name_to_id:
                rides[ride_id].append(
                    {
                        "station": normalized_name,
                        "station_id": station_name_to_id[normalized_name],
                        "station_num": int(station_num) if station_num.isdigit() else 0,
                    }
                )

    print(f"Found {len(rides)} unique rides")

    # Process each ride to extract edges
    for ride_id, events in rides.items():
        if len(events) < 2:
            continue

        # Sort by station number to get correct sequence
        events.sort(key=lambda x: x["station_num"])

        # Create edges between consecutive stations
        for i in range(len(events) - 1):
            station1 = events[i]["station"]
            station2 = events[i + 1]["station"]

            # Create undirected edge (smaller ID first)
            station1_id = station_name_to_id[station1]
            station2_id = station_name_to_id[station2]

            edge_key = tuple(sorted([station1_id, station2_id]))
            edge_frequencies[edge_key] += 1

            # Calculate distance if not already calculated
            if edge_key not in edge_distances:
                station1_coords = stations[str(station1_id)]
                station2_coords = stations[str(station2_id)]

                distance = calculate_distance(
                    station1_coords["lat"],
                    station1_coords["lon"],
                    station2_coords["lat"],
                    station2_coords["lon"],
                )

                edge_distances[edge_key] = distance

    # Convert edges to final format
    edges = {}
    next_edge_id = 0

    for (station1_id, station2_id), frequency in edge_frequencies.items():
        edges[str(next_edge_id)] = {
            "from": station1_id,
            "to": station2_id,
            "distance": edge_distances[(station1_id, station2_id)],
            "frequency": frequency,
        }
        next_edge_id += 1

    print(f"Found {len(edges)} unique edges")

    return stations, edges, station_name_to_id


def build_sparse_adjacency(stations: Dict[str, Dict], edges: Dict[str, Dict]) -> Dict[int, Set[int]]:
    """Build sparse adjacency list from stations and edges."""
    adjacency = defaultdict(set)

    for edge in edges.values():
        from_id = edge["from"]
        to_id = edge["to"]

        # Undirected graph
        adjacency[from_id].add(to_id)
        adjacency[to_id].add(from_id)

    return dict(adjacency)


def calculate_degree_centrality(adjacency: Dict[int, Set[int]]) -> Dict[int, int]:
    """Calculate degree centrality for each station."""
    return {station_id: len(neighbors) for station_id, neighbors in adjacency.items()}


def calculate_closeness_centrality(adjacency: Dict[int, Set[int]], num_stations: int) -> Dict[int, float]:
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


def main():
    """Main function to extract graph structure."""

    # File paths
    csv_file = "dashboard/src/data/ice.csv"
    mapping_file = "dashboard/src/data/alternative_station_name_to_station_name.json"
    stations_file = "dashboard/src/data/stations_index.json"
    output_file = "dashboard/src/data/graph_structure.json"

    print("=== Deutsche Bahn Graph Structure Extractor ===")
    print(f"Processing CSV: {csv_file}")
    print(f"Using mapping: {mapping_file}")
    print(f"Using stations: {stations_file}")
    print(f"Output: {output_file}")
    print()

    # Load mapping and station data
    print("Loading station mapping and coordinates...")
    mapping = load_station_mapping(mapping_file)
    stations_index = load_stations_index(stations_file)

    # Extract stations and edges
    stations, edges, station_name_to_id = extract_stations_and_edges(csv_file, mapping, stations_index)

    # Build sparse adjacency structure
    print("Building sparse adjacency structure...")
    adjacency = build_sparse_adjacency(stations, edges)

    # Calculate centrality measures
    print("Calculating centrality measures...")
    degree_centrality = calculate_degree_centrality(adjacency)
    closeness_centrality = calculate_closeness_centrality(adjacency, len(stations))

    # Add centrality measures to stations
    for station_id_str, station_data in stations.items():
        station_id = int(station_id_str)
        station_data["degree"] = degree_centrality.get(station_id, 0)
        station_data["closenessCentrality"] = closeness_centrality.get(station_id, 0.0)

    # Create final graph structure
    graph_structure = {
        "metadata": {
            "version": "1.0",
            "created": datetime.now().isoformat(),
            "totalStations": len(stations),
            "totalEdges": len(edges),
            "description": "Static graph structure for Deutsche Bahn network",
        },
        "stations": stations,
        "edges": edges,
        "stationNameToId": station_name_to_id,
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

    # Print some statistics
    print("\nTop 5 stations by degree centrality:")
    sorted_stations = sorted(stations.items(), key=lambda x: x[1]["degree"], reverse=True)
    for i, (station_id, station_data) in enumerate(sorted_stations[:5]):
        print(f"  {i+1}. {station_data['name']} (degree: {station_data['degree']})")

    print("\nTop 5 stations by closeness centrality:")
    sorted_closeness = sorted(stations.items(), key=lambda x: x[1]["closenessCentrality"], reverse=True)
    for i, (station_id, station_data) in enumerate(sorted_closeness[:5]):
        print(f"  {i+1}. {station_data['name']} (closeness: {station_data['closenessCentrality']:.3f})")


if __name__ == "__main__":
    main()
