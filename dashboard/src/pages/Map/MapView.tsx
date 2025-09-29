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
import { useActiveRides } from "@/hooks/useStreamingTrainEvents";
import { useSimStore } from "@/state/useSimStore";
import { useStationStats } from "@/state/useStationStats";
import { ISO_to_ms } from "@/utils/time";
import type { StationInfo } from "@/types/ride";

function delay_to_color(delay?: number) {
  if ((delay ?? 0) <= 2) return "#2e7d32";
  if ((delay ?? 0) <= 10) return "#f9a825";
  return "#c62828";
}

export default function MapView() {
  const { graph, loaded } = useGraphStructure();
  const activeRides = useActiveRides();
  const playhead = useSimStore((s) => s.cursorTs) ?? 0;

  // NEW: pull stations (and stats if you ever want them) from the network stats hook
  const { stations } = useStationStats();

  // Fast lookup by stationId for hover
  const stationFeaturesById = useMemo(() => {
    const m = new Map<string, (typeof stations)[number]["features"]>();
    for (const s of stations) m.set(s.stationId, s.features);
    return m;
  }, [stations]);

  // State for hover popup
  const [hoveredStationInfo, setHoveredStationInfo] = useState<StationInfo | null>(null);

  const { edgeFC, backgroundEdgeFC, counts } = useMemo(() => {
    if (!graph) {
      return {
        edgeFC: { type: "FeatureCollection" as const, features: [] },
        backgroundEdgeFC: { type: "FeatureCollection" as const, features: [] },
        counts: { stations: 0, events: 0, edges: 0, backgroundEdges: 0 },
      };
    }

    // Background edges FC - all possible edges from graph structure
    const backgroundEdgeFeatures: Feature<
      LineString,
      { fromStation: string; toStation: string; distance: number; frequency: number }
    >[] = Object.entries(graph.edges)
      .map(([, edge]) => {
        const from = edge[0];
        const to = edge[1];
        const distance = edge[2];
        const frequency = edge[3];
        const fromStation = graph.stations[from];
        const toStation = graph.stations[to];

        if (!fromStation || !toStation) return null;

        return {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [fromStation.lon, fromStation.lat],
              [toStation.lon, toStation.lat],
            ],
          },
          properties: {
            fromStation: fromStation.name,
            toStation: toStation.name,
            distance,
            frequency,
          },
        };
      })
      .filter(Boolean) as Feature<
        LineString,
        { fromStation: string; toStation: string; distance: number; frequency: number }
      >[];

    const backgroundEdgeFC: FeatureCollection<
      LineString,
      { fromStation: string; toStation: string; distance: number; frequency: number }
    > = {
      type: "FeatureCollection",
      features: backgroundEdgeFeatures,
    };

    // Live edges from active rides: draw latest DEPARTURE segment per ride
    const edgeFeatures: Feature<LineString, { color: string; width: number; label: string }>[] = [];

    for (const ride of activeRides) {
      if (!ride.events || ride.events.length === 0) continue;

      const departureEvents = ride.events.filter((e) => e.event_type === "DEPARTURE");
      const latestDeparture = departureEvents.sort(
        (a, b) => (ISO_to_ms(b.timestamp) ?? 0) - (ISO_to_ms(a.timestamp) ?? 0)
      )[0];

      if (!latestDeparture || !latestDeparture.from_station || !latestDeparture.to_station) continue;

      const fromStationId = graph.stationNameToId[latestDeparture.from_station];
      const toStationId = graph.stationNameToId[latestDeparture.to_station];
      if (fromStationId === undefined || toStationId === undefined) continue;

      const fromStation = graph.stations[fromStationId];
      const toStation = graph.stations[toStationId];
      if (!fromStation || !toStation) continue;

      const delay = latestDeparture.delay_min;

      edgeFeatures.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [fromStation.lon, fromStation.lat],
            [toStation.lon, toStation.lat],
          ],
        },
        properties: {
          color: delay_to_color(delay),
          width: 2,
          label: `${latestDeparture.from_station} → ${latestDeparture.to_station}`,
        },
      });
    }

    const edgeFC: FeatureCollection<LineString, { color: string; width: number; label: string }> = {
      type: "FeatureCollection",
      features: edgeFeatures,
    };

    return {
      edgeFC,
      backgroundEdgeFC,
      counts: {
        stations: graph ? Object.keys(graph.stations).length : 0,
        events: activeRides.reduce((sum, ride) => sum + ride.events.length, 0),
        edges: edgeFeatures.length,
        backgroundEdges: backgroundEdgeFeatures.length,
      },
    };
  }, [graph, activeRides, playhead]);

  return (
    <div className="map-view" style={{ position: "relative" }}>
      {/* tiny debug badge */}
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          top: 8,
          left: 8,
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          padding: "4px 8px",
          borderRadius: 6,
          fontSize: 12,
        }}
      >
        loaded:{String(loaded)} | stations:{counts.stations} | events:{counts.events} | edges:{counts.edges} | bg:
        {counts.backgroundEdges}
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
              <Layer
                id="background-edges-lines"
                type="line"
                paint={{
                  "line-color": "#e5e7eb",
                  "line-width": 2,
                  "line-opacity": 0.7,
                }}
              />
            </Source>

            {/* Live edges - currently active train movements */}
            <Source id="edges" type="geojson" data={edgeFC}>
              <Layer
                id="edges-lines"
                type="line"
                paint={{
                  "line-color": ["get", "color"],
                  "line-width": ["get", "width"],
                  "line-opacity": 0.9,
                }}
              />
            </Source>

            {/* Station Markers - Individual interactive markers */}
            {graph &&
              Object.entries(graph.stations).map(([stationId, station]) => {
                return (
                  <Marker key={stationId} longitude={station.lon} latitude={station.lat}>
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        backgroundColor: "#3b82f6",
                        border: "2px solid #fff",
                        borderRadius: "50%",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                      }}
                      onMouseEnter={() => {
                        const features =
                          stationFeaturesById.get(stationId) ?? {
                            rideCount: 0,
                            totalDelaySum: 0,
                            averageDelay: 0,
                            currentDelay: 0,
                            maxDelay: 0,
                            punctualityRate: 0,
                            lastUpdated: 0,
                          };
                        setHoveredStationInfo({
                          stationName: station.name,
                          stationId,
                          features,
                          coordinates: [station.lon, station.lat],
                        });
                      }}
                      onMouseLeave={() => setHoveredStationInfo(null)}
                    />
                  </Marker>
                );
              })}
          </>
        )}
      </MapGL>

      {/* Station Hover Popup */}
      {hoveredStationInfo && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "white",
            border: "1px solid #ccc",
            borderRadius: "8px",
            padding: "16px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 1000,
            minWidth: "250px",
            maxWidth: "300px",
            pointerEvents: "none", // Prevent popup from interfering with mouse events
          }}
        >
          <div style={{ marginBottom: "8px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "bold", color: "#333" }}>
              {hoveredStationInfo.stationName}
            </h3>
          </div>

          {hoveredStationInfo.features ? (
            <div style={{ fontSize: "14px", lineHeight: "1.4" }}>
              <div style={{ marginBottom: "8px" }}>
                <strong>Rides:</strong> {hoveredStationInfo.features.rideCount}
              </div>
              <div style={{ marginBottom: "8px" }}>
                <strong>Average Delay:</strong> {hoveredStationInfo.features.averageDelay.toFixed(1)} min
              </div>
              <div style={{ marginBottom: "8px" }}>
                <strong>Current Delay:</strong>{" "}
                {(hoveredStationInfo.features.currentDelay ?? 0).toFixed(1)} min
              </div>
              <div style={{ marginBottom: "8px" }}>
                <strong>Max Delay:</strong> {(hoveredStationInfo.features.maxDelay ?? 0).toFixed(1)} min
              </div>
              <div style={{ marginBottom: "8px" }}>
                <strong>Punctuality:</strong>{" "}
                {(hoveredStationInfo.features.punctualityRate ?? 0).toFixed(1)}%
              </div>
              <div style={{ fontSize: "12px", color: "#666", marginTop: "8px" }}>
                Last updated:{" "}
                {hoveredStationInfo.features.lastUpdated
                  ? new Date(hoveredStationInfo.features.lastUpdated).toLocaleTimeString()
                  : "Never"}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "14px", color: "#666" }}>No activity data available</div>
          )}
        </div>
      )}
    </div>
  );
}
