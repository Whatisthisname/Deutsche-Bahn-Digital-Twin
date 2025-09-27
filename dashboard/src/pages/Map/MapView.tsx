// src/pages/Map/MapView.tsx
import { useMemo, useState } from "react";
import {
  Map as MapGL,
  NavigationControl,
  Source,
  Layer,
  Marker,
} from "@vis.gl/react-maplibre";
import type { FeatureCollection, Feature, LineString } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import { useGraphStructure } from "@/state/useGraphStructure";
import { useVisibleActiveEvents, useActiveRides } from "@/hooks/useStreamingTrainEvents";
import { useIncrementalRides } from "@/state/useIncrementalRides";
import { useSimStore } from "@/state/useSimStore";
import { useDynamicStationFeatures } from "@/state/useStationFeatures";
import { formatTime, toMs } from "@/utils/time";

type JourneyEvent = {
  event_type?: 'departure' | 'arrival';
  train_line_ride_id?: string | number;
  from_station?: string;
  to_station?: string;
  train_line_station_num?: number;
  delay_in_min?: number;
  actual_timestamp?: number;
  planned_timestamp?: number;
  expected_arrival_timestamp?: number;
  expected_departure_timestamp?: number;
  final_destination_station?: string;
  is_canceled?: boolean;
};

function edgeColor(delay?: number) {
  if ((delay ?? 0) <= 2) return "#2e7d32";
  if ((delay ?? 0) <= 10) return "#f9a825";
  return "#c62828";
}

// Helper function to convert timestamps to milliseconds
// const toMs = (n: any): number | undefined => {
//   if (!Number.isFinite(n)) return undefined;
//   return String(Math.trunc(n)).length === 10 ? n * 1000 : n;
// };

export default function MapView() {
  const { graph, loaded } = useGraphStructure();
  const events = useVisibleActiveEvents() as JourneyEvent[];
  const playhead = useSimStore(s => s.cursorTs) ?? 0;
  const { getStationFeatures } = useDynamicStationFeatures();

  // Debug: Check active rides
  const activeRides = useActiveRides();
  const allRides = useIncrementalRides(state => state.rides);


  // State for hover popup
  const [hoveredStationInfo, setHoveredStationInfo] = useState<{
    stationName: string;
    stationId: number;
    features: any;
    coordinates: [number, number];
  } | null>(null);


  const { edgeFC, backgroundEdgeFC, counts } = useMemo(() => {
    if (!graph) {
      return {
        edgeFC: { type: "FeatureCollection" as const, features: [] },
        backgroundEdgeFC: { type: "FeatureCollection" as const, features: [] },
        counts: { stations: 0, events: 0, edges: 0, backgroundEdges: 0 }
      };
    }



    // Background edges FC - all possible edges from graph structure
    const backgroundEdgeFeatures: Feature<LineString, { fromStation: string; toStation: string; distance: number; frequency: number }>[] =
      Object.entries(graph.edges).map(([, edge]) => {
        const fromStation = graph.stations[edge.from];
        const toStation = graph.stations[edge.to];

        if (!fromStation || !toStation) return null;

        return {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [fromStation.lon, fromStation.lat],
              [toStation.lon, toStation.lat]
            ]
          },
          properties: {
            fromStation: fromStation.name,
            toStation: toStation.name,
            distance: edge.distance,
            frequency: edge.frequency
          }
        };
      }).filter(Boolean) as Feature<LineString, { fromStation: string; toStation: string; distance: number; frequency: number }>[];

    const backgroundEdgeFC: FeatureCollection<LineString, { fromStation: string; toStation: string; distance: number; frequency: number }> = {
      type: "FeatureCollection",
      features: backgroundEdgeFeatures
    };

    // NEW APPROACH: Process journey events to find active journeys
    // An active journey is one where:
    // 1. A departure event has occurred (departure.actual_timestamp <= current_time)
    // 2. The corresponding arrival event has NOT occurred yet (arrival.actual_timestamp > current_time)

    const edgeFeatures: Feature<LineString, { color: string; width: number; label: string }>[] = [];

    // Group events by ride and journey segment (from_station → to_station)
    const journeySegments: globalThis.Map<string, { departure?: JourneyEvent; arrival?: JourneyEvent }> = new globalThis.Map();

    for (const event of events) {
      if (!event.train_line_ride_id || !event.from_station || !event.to_station) continue;

      // Create a unique key for each journey segment
      const segmentKey = `${event.train_line_ride_id}:${event.from_station}→${event.to_station}`;

      if (!journeySegments.has(segmentKey)) {
        journeySegments.set(segmentKey, {});
      }

      const segment = journeySegments.get(segmentKey)!;

      if (event.event_type === 'departure') {
        segment.departure = event;
      } else if (event.event_type === 'arrival') {
        segment.arrival = event;
      }
    }


    // Check each segment for active journeys
    for (const [segmentKey, segment] of journeySegments) {
      const { departure, arrival } = segment;

      if (!departure) {
        continue;
      }

      // Check if journey is active
      const departureTime = toMs(departure.actual_timestamp) ?? 0;
      const arrivalTime = arrival ? (toMs(arrival.actual_timestamp) ?? 0) : (toMs(departure.expected_arrival_timestamp) ?? 0);

      const isJourneyActive = departureTime <= playhead && arrivalTime > playhead;


      if (!isJourneyActive) {
        continue;
      }

      // Look up stations in graph structure
      const fromStationId = graph.stationNameToId[departure.from_station!];
      const toStationId = graph.stationNameToId[departure.to_station!];

      if (fromStationId === undefined || toStationId === undefined) {
        continue;
      }

      const fromStation = graph.stations[fromStationId.toString()];
      const toStation = graph.stations[toStationId.toString()];

      if (!fromStation || !toStation) {
        continue;
      }

      const delay = Number(departure.delay_in_min ?? 0);

      edgeFeatures.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[fromStation.lon, fromStation.lat], [toStation.lon, toStation.lat]] },
        properties: { color: edgeColor(delay), width: 2, label: `${departure.from_station} → ${departure.to_station}` },
      });
    }

    const edgeFC: FeatureCollection<LineString, { color: string; width: number; label: string }> = {
      type: "FeatureCollection",
      features: edgeFeatures
    };

    return {
      edgeFC,
      backgroundEdgeFC,
      counts: {
        stations: graph ? Object.keys(graph.stations).length : 0,
        events: events.length,
        edges: edgeFeatures.length,
        backgroundEdges: backgroundEdgeFeatures.length
      }
    };
  }, [graph, events.length, playhead]); // Only depend on events.length, not full events array


  return (
    <div className="map-view" style={{ position: "relative" }}>
      {/* tiny debug badge */}
      <div style={{
        position: "absolute", zIndex: 1, top: 8, left: 8,
        background: "rgba(0,0,0,0.6)", color: "#fff",
        padding: "4px 8px", borderRadius: 6, fontSize: 12
      }}>
        loaded:{String(loaded)} | stations:{counts.stations} | events:{counts.events} | edges:{counts.edges} | bg:{counts.backgroundEdges}
      </div>

      <MapGL
        initialViewState={{ longitude: 10, latitude: 51, zoom: 5 }}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      >
        <NavigationControl position="top-right" />

        {/* Only render layers if stations are loaded */}
        {loaded && (
          <>

            {/* Background edges - all possible connections */}
            <Source id="background-edges" type="geojson" data={backgroundEdgeFC}>
              <Layer id="background-edges-lines" type="line" paint={{
                "line-color": "#e5e7eb", // Light gray
                "line-width": 2, // 2px wide
                "line-opacity": 0.7 // More opaque
              }} />
            </Source>

            {/* Live edges - currently active train movements */}
            <Source id="edges" type="geojson" data={edgeFC}>
              <Layer id="edges-lines" type="line" paint={{
                "line-color": ["get", "color"],
                "line-width": ["get", "width"],
                "line-opacity": 0.9
              }} />
            </Source>

            {/* Station Markers - Individual interactive markers */}
            {graph && Object.entries(graph.stations).map(([stationIdStr, station]) => {
              const stationId = parseInt(stationIdStr);

              return (
                <Marker
                  key={stationId}
                  longitude={station.lon}
                  latitude={station.lat}
                >
                  <div
                    style={{
                      width: '10px',
                      height: '10px',
                      backgroundColor: '#3b82f6',
                      border: '2px solid #fff',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                    onMouseEnter={() => {
                      const features = getStationFeatures(stationId);
                      setHoveredStationInfo({
                        stationName: station.name,
                        stationId,
                        features,
                        coordinates: [station.lon, station.lat]
                      });
                    }}
                    onMouseLeave={() => {
                      setHoveredStationInfo(null);
                    }}
                  />
                </Marker>
              );
            })}
          </>
        )}
      </MapGL>

      {/* Station Hover Popup */}
      {hoveredStationInfo && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'white',
          border: '1px solid #ccc',
          borderRadius: '8px',
          padding: '16px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          zIndex: 1000,
          minWidth: '250px',
          maxWidth: '300px',
          pointerEvents: 'none' // Prevent popup from interfering with mouse events
        }}>
          <div style={{ marginBottom: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#333' }}>
              {hoveredStationInfo.stationName}
            </h3>
          </div>

          {hoveredStationInfo.features ? (
            <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
              <div style={{ marginBottom: '8px' }}>
                <strong>Rides:</strong> {hoveredStationInfo.features.rideCount}
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Average Delay:</strong> {hoveredStationInfo.features.averageDelay.toFixed(1)} min
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Current Delay:</strong> {hoveredStationInfo.features.currentDelay.toFixed(1)} min
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Max Delay:</strong> {hoveredStationInfo.features.maxDelay.toFixed(1)} min
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Punctuality:</strong> {hoveredStationInfo.features.punctualityRate.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                Last updated: {new Date(hoveredStationInfo.features.lastUpdated).toLocaleTimeString()}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '14px', color: '#666' }}>
              No activity data available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
