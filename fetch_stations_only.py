import os, sys, time, json, csv
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import requests

BASE = "https://apis.deutschebahn.com/db-api-marketplace/apis/ris-stations/v1"
ACCEPT = "application/vnd.de.db.ris+json"

CLIENT_ID = "1841a2dce543a958051e84c5f8c5e2a3"
API_KEY   = "340a8295b79cb8169f49cd9158bfd51b"

if not CLIENT_ID or not API_KEY:
    print("Set env vars and reopen your terminal:")
    print('  setx DB_CLIENT_ID "your-client-id"')
    print('  setx DB_API_KEY  "your-api-key"')
    sys.exit(1)

HEADERS = {
    "DB-Client-Id": CLIENT_ID,
    "DB-Api-Key": API_KEY,
    "Accept": ACCEPT,
}

def get_json(session: requests.Session, path: str, params: Dict[str, Any]) -> Dict[str, Any] | List[Any]:
    url = f"{BASE}{path}"
    while True:
        r = session.get(url, headers=HEADERS, params=params)
        if r.status_code == 429:
            wait = int(r.headers.get("Retry-After", "2"))
            print(f"[rate-limit] wait {wait}s …")
            time.sleep(wait); continue
        r.raise_for_status()
        try:
            return r.json()
        except Exception:
            print("Non-JSON response:", r.text[:400])
            raise

def fetch_all_stations(session: requests.Session, page_size: int = 1000) -> List[Dict[str, Any]]:
    """Page through /stations until exhausted. Expected structure:
       { limit, offset, stations: [...] }"""
    out: List[Dict[str, Any]] = []
    offset = 0
    while True:
        payload = get_json(session, "/stations", {"limit": page_size, "offset": offset})
        stations = payload.get("stations") if isinstance(payload, dict) else payload
        if not isinstance(stations, list):
            print("Unexpected response structure:", payload)
            break
        out.extend(stations)
        print(f"…fetched {len(out)} total (page size={len(stations)}, offset={offset})")
        if len(stations) < page_size:
            break
        offset += page_size
    return out

def name_from_station(st: Dict[str, Any]) -> Optional[str]:
    # Prefer localized German name if present
    names = st.get("names") or {}
    de = names.get("DE") or {}
    return de.get("name") or st.get("name")

def coords_from_station(st: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    # Newer schema
    pos = st.get("position")
    if isinstance(pos, dict) and "latitude" in pos and "longitude" in pos:
        return float(pos["latitude"]), float(pos["longitude"])
    # Older schema
    geo = st.get("geocoordinates")
    if isinstance(geo, dict) and "x" in geo and "y" in geo:
        lat, lon = float(geo["x"]), float(geo["y"])
        if abs(lat) > 90 or abs(lon) > 180:  # sanity swap if needed
            lat, lon = lon, lat
        return lat, lon
    return None

def ril100_from_station(st: Dict[str, Any]) -> Optional[str]:
    arr = st.get("ril100Identifiers")
    if isinstance(arr, list) and arr:
        return arr[0].get("rilIdentifier")
    return st.get("rl100Code")  # sometimes present flat

def main():
    out_dir = Path("station_cache"); out_dir.mkdir(parents=True, exist_ok=True)
    s = requests.Session()

    print("Fetching stations from RIS-Stations …")
    stations = fetch_all_stations(s)

    # Save raw directory
    (out_dir / "stations_directory_raw.json").write_text(
        json.dumps(stations, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("Building index (using only RIS-Stations data)…")
    index: Dict[str, Dict[str, Any]] = {}
    misses: List[Dict[str, Any]] = []

    for i, st in enumerate(stations, 1):
        name = name_from_station(st)
        if not name:
            continue
        latlon = coords_from_station(st)
        eva = st.get("evaNr") or st.get("evaNumber")
        rl100 = ril100_from_station(st)

        if latlon:
            index[name] = {
                "stationID": st.get("stationID"),
                "evaNr": eva,
                "rl100Code": rl100,
                "lat": latlon[0],
                "lon": latlon[1],
            }
        else:
            misses.append({
                "name": name,
                "stationID": st.get("stationID"),
                "evaNr": eva,
                "rl100Code": rl100,
            })

        if i % 200 == 0:
            print(f"  processed {i}/{len(stations)} …")

    # Write outputs
    (out_dir / "stations_index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    with (out_dir / "stations_index.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["name","stationID","evaNr","rl100Code","lat","lon"])
        for name, d in sorted(index.items()):
            w.writerow([name, d.get("stationID"), d.get("evaNr"), d.get("rl100Code"), d["lat"], d["lon"]])

    if misses:
        (out_dir / "stations_misses.json").write_text(
            json.dumps(misses, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"⚠ {len(misses)} stations had no coordinates in RIS-Stations; see {out_dir/'stations_misses.json'}")

    print("✔ done")
    print("  ", out_dir / "stations_directory_raw.json")
    print("  ", out_dir / "stations_index.json")
    print("  ", out_dir / "stations_index.csv")
    if misses: print("  ", out_dir / "stations_misses.json")

if __name__ == "__main__":
    main()
