// src/pages/Map/MapView.tsx
import { useMemo, useState } from "react";
import {
  Map as MapGL,
  NavigationControl,
  Source,
  Layer,
} from "@vis.gl/react-maplibre";
import type { FeatureCollection, Feature, Point, LineString } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import { useGraphStructure } from "@/state/useGraphStructure";
import { useVisibleActiveEvents, useActiveRides } from "@/state/useTrainEvents";
import { useSimStore } from "@/state/useSimStore";
import { useDynamicStationFeatures } from "@/state/useStationFeatures";

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
const toMs = (n: any): number | undefined => {
  if (!Number.isFinite(n)) return undefined;
  return String(Math.trunc(n)).length === 10 ? n * 1000 : n;
};

export default function MapView() {
  const { graph, loaded } = useGraphStructure();
  const events = useVisibleActiveEvents(0) as JourneyEvent[];
  const playhead = useSimStore(s => s.cursorTs) ?? 0;
  const { getStationFeatures } = useDynamicStationFeatures();

  // Debug: Check active rides
  const activeRides = useActiveRides();
  console.log('Active rides at', new Date(playhead).toISOString(), ':', activeRides.map(r => ({
    rideId: r.rideId,
    startTs: new Date(r.startTs).toISOString(),
    endTs: new Date(r.endTs).toISOString(),
    canceled: r.canceled
  })));

  // State for popup
  const [popupInfo, setPopupInfo] = useState<{
    stationName: string;
    stationId: number;
    features: any;
    coordinates: [number, number];
  } | null>(null);

  // State for hover
  const [hoveredStation, setHoveredStation] = useState<number | null>(null);

  const { stationFC, edgeFC, backgroundEdgeFC, counts } = useMemo(() => {
    if (!graph) {
      return {
        stationFC: { type: "FeatureCollection" as const, features: [] },
        edgeFC: { type: "FeatureCollection" as const, features: [] },
        backgroundEdgeFC: { type: "FeatureCollection" as const, features: [] },
        counts: { stations: 0, events: 0, edges: 0, backgroundEdges: 0 }
      };
    }

    // Debug: Log what events we're getting
    console.log('MapView Debug:', {
      totalEvents: events.length,
      events: events.map(e => ({
        eventType: e.event_type,
        rideId: e.train_line_ride_id,
        fromStation: e.from_station,
        toStation: e.to_station,
        stationNum: e.train_line_station_num,
        delay: e.delay_in_min,
        actualTimestamp: e.actual_timestamp,
        plannedTimestamp: e.planned_timestamp,
        expectedArrivalTimestamp: e.expected_arrival_timestamp,
        expectedDepartureTimestamp: e.expected_departure_timestamp
      })),
      playhead: new Date(playhead).toISOString(),
      playheadMs: playhead
    });

    // Stations FC - only show the 91 ICE stations
    const stationFeatures: Feature<Point, { name: string; degree: number; centrality: number; stationId: number }>[] =
      Object.entries(graph.stations).map(([stationIdStr, station]) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [station.lon, station.lat] },
        properties: {
          name: station.name,
          degree: station.degree,
          centrality: station.closenessCentrality,
          stationId: parseInt(stationIdStr)
        },
      }));

    const stationFC: FeatureCollection<Point, { name: string; degree: number; centrality: number; stationId: number }> = {
      type: "FeatureCollection",
      features: stationFeatures
    };

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

    console.log(`Found ${journeySegments.size} journey segments`);

    // Check each segment for active journeys
    for (const [segmentKey, segment] of journeySegments) {
      const { departure, arrival } = segment;

      if (!departure) {
        console.log(`No departure event for segment ${segmentKey}`);
        continue;
      }

      // Check if journey is active
      const departureTime = toMs(departure.actual_timestamp) ?? 0;
      const arrivalTime = arrival ? (toMs(arrival.actual_timestamp) ?? 0) : (toMs(departure.expected_arrival_timestamp) ?? 0);

      const isJourneyActive = departureTime <= playhead && arrivalTime > playhead;

      console.log(`Journey ${segmentKey}:`, {
        departureTime: new Date(departureTime).toISOString(),
        arrivalTime: new Date(arrivalTime).toISOString(),
        currentTime: new Date(playhead).toISOString(),
        isActive: isJourneyActive,
        hasArrivalEvent: !!arrival
      });

      if (!isJourneyActive) {
        console.log(`Journey ${segmentKey} not active, skipping`);
        continue;
      }

      // Look up stations in graph structure
      const fromStationId = graph.stationNameToId[departure.from_station!];
      const toStationId = graph.stationNameToId[departure.to_station!];

      if (fromStationId === undefined || toStationId === undefined) {
        console.log(`Station not found in graph: ${departure.from_station} (${fromStationId}) or ${departure.to_station} (${toStationId})`);
        continue;
      }

      const fromStation = graph.stations[fromStationId.toString()];
      const toStation = graph.stations[toStationId.toString()];

      if (!fromStation || !toStation) {
        console.log(`Station coordinates not found: ${departure.from_station} or ${departure.to_station}`);
        continue;
      }

      const delay = Number(departure.delay_in_min ?? 0);
      console.log(`Creating ACTIVE journey edge: ${departure.from_station} → ${departure.to_station} (delay: ${delay}min)`);

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
      stationFC,
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

  // Handle station click
  const handleStationClick = (event: any) => {
    const stationFeature = event.features?.find((f: any) => f.layer.id === 'stations-dots');
    if (!stationFeature || !graph) return;

    const stationId = stationFeature.properties.stationId;
    const stationName = stationFeature.properties.name;
    const features = getStationFeatures(stationId);
    const coordinates = event.lngLat;

    setPopupInfo({
      stationName,
      stationId,
      features,
      coordinates: [coordinates.lng, coordinates.lat]
    });
  };

  // Handle station hover
  const handleStationHover = (event: any) => {
    const stationFeature = event.features?.find((f: any) => f.layer.id === 'stations-dots');
    if (stationFeature) {
      setHoveredStation(stationFeature.properties.stationId);
    } else {
      setHoveredStation(null);
    }
  };

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
        onClick={handleStationClick}
        onMouseMove={handleStationHover}
      >
        <NavigationControl position="top-right" />

        {/* Only render layers if stations are loaded */}
        {loaded && (
          <>
            <Source id="stations" type="geojson" data={stationFC}>
              <Layer id="stations-dots" type="circle" paint={{
                "circle-radius": [
                  "case",
                  ["==", ["get", "stationId"], hoveredStation],
                  6, // Larger when hovered
                  [
                    "interpolate",
                    ["linear"],
                    ["get", "centrality"],
                    0, 2,
                    0.5, 4
                  ]
                ],
                "circle-color": [
                  "interpolate",
                  ["linear"],
                  ["get", "degree"],
                  0, "#e5e7eb",
                  10, "#3b82f6",
                  20, "#1d4ed8"
                ],
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 0.5
              }} />
            </Source>

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
          </>
        )}
      </MapGL>

      {/* Station Popup */}
      {popupInfo && (
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
          maxWidth: '300px'
        }}>
          <div style={{ marginBottom: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#333' }}>
              {popupInfo.stationName}
            </h3>
            <button
              onClick={() => setPopupInfo(null)}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'none',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#666'
              }}
            >
              ×
            </button>
          </div>

          {popupInfo.features ? (
            <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
              <div style={{ marginBottom: '8px' }}>
                <strong>Rides:</strong> {popupInfo.features.rideCount}
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Average Delay:</strong> {popupInfo.features.averageDelay.toFixed(1)} min
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Current Delay:</strong> {popupInfo.features.currentDelay.toFixed(1)} min
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Max Delay:</strong> {popupInfo.features.maxDelay.toFixed(1)} min
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Punctuality:</strong> {popupInfo.features.punctualityRate.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                Last updated: {new Date(popupInfo.features.lastUpdated).toLocaleTimeString()}
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
