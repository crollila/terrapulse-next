"""
Fetch the raw inputs for the Hurricane Harvey (2017) rainfall and flood-evidence dataset.

Everything is keyless and public. Each response is cached under research/raw/ (git-ignored), so
the script can be re-run without repeating requests; delete a cached file to refresh it.

  research/venv/Scripts/python.exe -I research/scripts/fetch_harvey_rainfall.py

Sources (all U.S. Government works):
  stage4/      NOAA NWS / NCEP Stage IV daily multisensor precipitation analysis (netCDF, HRAP grid)
               https://water.noaa.gov/resources/downloads/precip/stageIV/YYYY/MM/DD/nws_precip_1day_YYYYMMDD_conus.nc
  atlas14/     NOAA Atlas 14 point precipitation frequency estimates (HDSC PFDS text service)
               https://hdsc.nws.noaa.gov/cgi-bin/new/fe_text_{mean,uppr,lwr}.csv
  power_imerg/ NASA POWER daily point API, parameters IMERG_PRECTOT (GPM IMERG) and PRECTOTCORR (MERRA-2)
               https://power.larc.nasa.gov/api/temporal/daily/point
  epqs/        USGS 3DEP Elevation Point Query Service  https://epqs.nationalmap.gov/v1/json
  nfhl/        FEMA National Flood Hazard Layer, layer 28 (Flood Hazard Zones)
               https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query
  usgs_stn/    USGS Short-Term Network high-water marks, event 180 "2017 Harvey"
               https://api.waterdata.usgs.gov/stnservices/hwms/filteredhwms/?event=180&format=json
  ghcn/        NOAA NCEI GHCN-Daily station precipitation (daily-summaries)
               https://www.ncei.noaa.gov/access/services/search/v1/data and .../data/v1
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "research" / "raw"
UA = "Mozilla/5.0 (research-client)"

# Domain of the bundled dataset (degrees). Chosen before looking at the rainfall: the Texas and
# Louisiana Gulf Coast refining region, from the Rio Grande to the Mississippi River.
WEST, EAST, SOUTH, NORTH = -100.0, -89.5, 26.0, 33.0
# Stage IV daily files: each covers the 24 hours ending 1200 UTC on the file date.
DAYS = ["20170824", "20170825", "20170826", "20170827", "20170828", "20170829", "20170830", "20170831", "20170901", "20170902"]


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get(url: str, dest: Path, *, binary: bool = False, tries: int = 4, pause: float = 0.35) -> bool:
    """Download url to dest unless dest already exists. Returns True when the file is present."""
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    last = ""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=120) as r:
                body = r.read()
            if not body:
                raise ValueError("empty body")
            dest.write_bytes(body)
            (dest.parent / "retrieved.log").open("a", encoding="utf-8").write(f"{now()}\t{dest.name}\t{url}\n")
            time.sleep(pause)
            return True
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError, ConnectionError) as e:
            last = str(e)
            time.sleep(1.5 * (i + 1))
    print(f"  FAILED {dest.name}: {last}", file=sys.stderr)
    return False


def assets() -> list[dict]:
    """Refineries and ports of the current app layers, plus refineries of the 2017 fleet, inside the domain."""
    out: dict[str, dict] = {}
    ref = json.loads((ROOT / "public/data/infrastructure/refineries.json").read_text(encoding="utf-8"))
    por = json.loads((ROOT / "public/data/infrastructure/ports.json").read_text(encoding="utf-8"))
    r17 = json.loads((ROOT / "public/data/hindcast/refineries_2017.json").read_text(encoding="utf-8"))
    for kind, rows in (("refinery", ref["facilities"]), ("port", por["ports"]), ("refinery", r17["facilities"])):
        for a in rows:
            if WEST <= a["lon"] <= EAST and SOUTH <= a["lat"] <= NORTH and a["id"] not in out:
                out[a["id"]] = {"id": a["id"], "kind": kind, "lat": a["lat"], "lon": a["lon"], "name": a["name"]}
    return list(out.values())


def main() -> None:
    A = assets()
    print(f"{len(A)} assets in the domain")
    fails = 0

    for d in DAYS:
        url = f"https://water.noaa.gov/resources/downloads/precip/stageIV/{d[:4]}/{d[4:6]}/{d[6:]}/nws_precip_1day_{d}_conus.nc"
        fails += not get(url, RAW / "stage4" / f"nws_precip_1day_{d}_conus.nc", binary=True)

    fails += not get("https://api.waterdata.usgs.gov/stnservices/hwms/filteredhwms/?event=180&format=json", RAW / "usgs_stn" / "harvey_hwms_filtered.json")

    for i, a in enumerate(A):
        q = urllib.parse.urlencode({"lat": f"{a['lat']:.4f}", "lon": f"{a['lon']:.4f}", "data": "depth", "units": "metric", "series": "pds"})
        for kind in ("mean", "uppr", "lwr"):
            fails += not get(f"https://hdsc.nws.noaa.gov/cgi-bin/new/fe_text_{kind}.csv?{q}", RAW / "atlas14" / f"{a['id']}_{kind}.csv")
        q = urllib.parse.urlencode({"parameters": "IMERG_PRECTOT,PRECTOTCORR", "community": "AG", "longitude": f"{a['lon']:.4f}", "latitude": f"{a['lat']:.4f}", "start": DAYS[0], "end": DAYS[-1], "format": "JSON", "time-standard": "UTC"})
        fails += not get(f"https://power.larc.nasa.gov/api/temporal/daily/point?{q}", RAW / "power_imerg" / f"{a['id']}.json", pause=0.6)
        q = urllib.parse.urlencode({"x": f"{a['lon']:.6f}", "y": f"{a['lat']:.6f}", "units": "Meters", "wkid": 4326})
        fails += not get(f"https://epqs.nationalmap.gov/v1/json?{q}", RAW / "epqs" / f"{a['id']}.json")
        q = urllib.parse.urlencode({"geometry": f"{a['lon']:.6f},{a['lat']:.6f}", "geometryType": "esriGeometryPoint", "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF,STATIC_BFE,DFIRM_ID", "returnGeometry": "false", "f": "json"})
        fails += not get(f"https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?{q}", RAW / "nfhl" / f"{a['id']}.json")
        if (i + 1) % 10 == 0:
            print(f"  assets {i + 1}/{len(A)}")

    # GHCN-Daily: station list by bounding box (paged), then daily PRCP in batches of stations.
    stations: dict[str, dict] = {}
    offset = 0
    while True:
        q = urllib.parse.urlencode({"dataset": "daily-summaries", "bbox": f"{NORTH},{WEST},{SOUTH},{EAST}", "startDate": "2017-08-24T00:00:00", "endDate": "2017-09-02T23:59:59", "dataTypes": "PRCP", "limit": 1000, "offset": offset})
        dest = RAW / "ghcn" / f"search_{offset:05d}.json"
        if not get(f"https://www.ncei.noaa.gov/access/services/search/v1/data?{q}", dest, pause=1.0):
            fails += 1
            break
        page = json.loads(dest.read_text(encoding="utf-8"))
        for r in page.get("results", []):
            sid = Path(r["filePath"]).stem
            pts = r.get("boundingPoints") or []
            if pts and pts[0].get("type") == "point":
                lon, lat = pts[0]["coordinates"]
                stations[sid] = {"id": sid, "lat": lat, "lon": lon}
        offset += 1000
        if offset >= int(page.get("count", 0)):
            break
    ids = sorted(stations)
    (RAW / "ghcn" / "stations.json").write_text(json.dumps([stations[i] for i in ids]), encoding="utf-8")
    print(f"{len(ids)} GHCN-Daily stations with PRCP in the domain and window")
    for b in range(0, len(ids), 40):
        q = urllib.parse.urlencode({"dataset": "daily-summaries", "stations": ",".join(ids[b : b + 40]), "startDate": "2017-08-24", "endDate": "2017-09-02", "dataTypes": "PRCP", "format": "json", "units": "metric", "includeAttributes": "true", "includeStationName": "true"})
        fails += not get(f"https://www.ncei.noaa.gov/access/services/data/v1?{q}", RAW / "ghcn" / f"data_{b:05d}.json", pause=0.8)

    print("done;", fails, "failed downloads")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
