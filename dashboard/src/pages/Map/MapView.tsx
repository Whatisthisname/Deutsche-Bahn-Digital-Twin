// src/pages/Map/MapView.tsx
import {useMemo} from "react";
import {
  Map as MapGL,
  NavigationControl,
  Source,
  Layer,
} from "@vis.gl/react-maplibre";
import type {FeatureCollection, Feature, Point, LineString} from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

import {useStations} from "@/state/useStations";
import {useVisibleActiveEvents} from "@/state/useTrainEvents";
import {useSimStore} from "@/state/useSimStore";

type StopEvent = {
  station?: string;
  train_line_ride_id?: string | number;
  train_line_station_num?: number;
  delay_in_min?: number;
};

function edgeColor(delay?: number) {
  if ((delay ?? 0) <= 2)  return "#2e7d32";
  if ((delay ?? 0) <= 10) return "#f9a825";
  return "#c62828";
}

export default function MapView() {
  const {stations, loaded} = useStations();
  const events = useVisibleActiveEvents(0) as StopEvent[];
  const playhead = useSimStore(s => s.cursorTs) ?? 0;

  const {stationFC, edgeFC, counts} = useMemo(() => {
    // Stations FC
    const stationFeatures: Feature<Point,{name:string}>[] =
      Object.entries(stations).map(([name, s]) => ({
        type: "Feature",
        geometry: {type: "Point", coordinates: [s.lon, s.lat]},
        properties: {name},
      }));
    // add one bright test point (Berlin) so you can verify rendering
    stationFeatures.push({
      type: "Feature",
      geometry: {type: "Point", coordinates: [13.4050, 52.5200]},
      properties: {name: "__test__ Berlin"},
    });

    const stationFC: FeatureCollection<Point,{name:string}> = {
      type: "FeatureCollection",
      features: stationFeatures
    };

    // Group by ride
    const byRide: globalThis.Map<string, StopEvent[]> = new globalThis.Map();
    for (const e of events) {
      const id = String(e.train_line_ride_id ?? "");
      if (!id) continue;
      (byRide.get(id) ?? (byRide.set(id, []), byRide.get(id)!)).push(e);
    }

    const edgeFeatures: Feature<LineString,{color:string;width:number;label:string}>[] = [];
    for (const [, grpRaw] of byRide) {
      const grp = grpRaw.slice().sort(
        (a, b) =>
          Number(a.train_line_station_num ?? 0) -
          Number(b.train_line_station_num ?? 0)
      );
      if (grp.length < 2) continue;

      // last pair of distinct stations
      let i = grp.length - 1;
      while (i > 0 && grp[i].station === grp[i-1].station) i--;
      if (i <= 0) continue;

      const prev = grp[i-1], curr = grp[i];
      if (!prev.station || !curr.station || prev.station === curr.station) continue;
      const A = stations[prev.station], B = stations[curr.station];
      if (!A || !B) continue;

      const delay = Math.max(Number(prev.delay_in_min ?? 0), Number(curr.delay_in_min ?? 0));
      edgeFeatures.push({
        type: "Feature",
        geometry: {type: "LineString", coordinates: [[A.lon, A.lat], [B.lon, B.lat]]},
        properties: {color: edgeColor(delay), width: 2, label: `${prev.station} → ${curr.station}`},
      });
    }

    const edgeFC: FeatureCollection<LineString,{color:string;width:number;label:string}> = {
      type: "FeatureCollection",
      features: edgeFeatures
    };

    return {
      stationFC,
      edgeFC,
      counts: {
        stations: Object.keys(stations).length,
        events: events.length,
        edges: edgeFeatures.length
      }
    };
  }, [stations, loaded, events, playhead]);

  return (
    <div className="map-view" style={{position:"relative"}}>
      {/* tiny debug badge */}
      <div style={{
        position:"absolute", zIndex:1, top:8, left:8,
        background:"rgba(0,0,0,0.6)", color:"#fff",
        padding:"4px 8px", borderRadius:6, fontSize:12
      }}>
        loaded:{String(loaded)} | stations:{counts.stations} | events:{counts.events} | edges:{counts.edges}
      </div>

      <MapGL
        initialViewState={{longitude: 10, latitude: 51, zoom: 5}}
        mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
      >
        <NavigationControl position="top-right" />

        {/* Only render layers if stations are loaded */}
        {loaded && (
          <>
            <Source id="stations" type="geojson" data={stationFC}>
              <Layer id="stations-dots" type="circle" paint={{
                "circle-radius": 2.5,
                "circle-color": "#1f2937",
                "circle-stroke-color": "#fff",
                "circle-stroke-width": 0.5
              }}/>
            </Source>

            <Source id="edges" type="geojson" data={edgeFC}>
              <Layer id="edges-lines" type="line" paint={{
                "line-color": ["get","color"],
                "line-width": ["get","width"],
                "line-opacity": 0.9
              }}/>
            </Source>
          </>
        )}
      </MapGL>
    </div>
  );
}
