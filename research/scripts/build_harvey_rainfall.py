"""
Build the bundled Hurricane Harvey (2017) rainfall and flood-evidence dataset from the raw files
cached by fetch_harvey_rainfall.py. Offline and deterministic: the same raw files give the same
output. Nothing is modelled here; every number is read from a provider file or is simple
arithmetic on such numbers (unit conversion, sums, distances, nearest grid cell).

  research/venv/Scripts/python.exe -I research/scripts/build_harvey_rainfall.py

Writes
  public/data/rainfall/harvey_2017_grid.json    daily Stage IV rainfall on a 0.05 degree grid
  public/data/rainfall/harvey_2017_assets.json  per refinery and port: rainfall, Atlas 14, elevation, flood zone, high-water marks
  public/data/rainfall/harvey_2017_hwms.json    USGS high-water marks (compact)
  research/rainfall_gauge_check.json            Stage IV against GHCN-Daily gauges
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import netCDF4
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "research" / "raw"
OUT = ROOT / "public" / "data" / "rainfall"

WEST, EAST, SOUTH, NORTH = -100.0, -89.5, 26.0, 33.0
STEP = 0.05
DAYS = ["20170824", "20170825", "20170826", "20170827", "20170828", "20170829", "20170830", "20170831", "20170901", "20170902"]
MM_PER_INCH = 25.4
M_PER_FT = 0.3048

# HRAP grid of the Stage IV files (read from each file's `crs` variable and checked below):
# polar stereographic, true at 60 N, central meridian 105 W, sphere of radius 6,371,200 m.
R_EARTH = 6371200.0
LON0 = -105.0
LAT_TS = 60.0

ATLAS_DURATIONS = ["24-hr", "2-day", "3-day", "4-day", "7-day"]


def iso(d: str) -> str:
    return f"{d[:4]}-{d[4:6]}-{d[6:]}"


def hrap_xy(lat, lon):
    """Forward polar stereographic projection (sphere). Returns x, y in metres."""
    phi = np.radians(lat)
    lam = np.radians(np.asarray(lon) - LON0)
    rho = R_EARTH * (1.0 + math.sin(math.radians(LAT_TS))) * np.cos(phi) / (1.0 + np.sin(phi))
    return rho * np.sin(lam), -rho * np.cos(lam)


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * np.arcsin(np.sqrt(a))


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def retrieved(folder: str, name: str | None = None) -> str | None:
    """Earliest retrieval time recorded for a raw folder (or one file in it)."""
    log = RAW / folder / "retrieved.log"
    if log.exists():
        rows = [ln.split("\t") for ln in log.read_text(encoding="utf-8").splitlines() if ln.strip()]
        rows = [r for r in rows if name is None or r[1] == name]
        if rows:
            return min(r[0] for r in rows)
    txt = RAW / folder / "retrieved.txt"
    return txt.read_text(encoding="utf-8").strip() if txt.exists() else None


# ---------- Stage IV ----------

def load_stage4():
    fields = []
    x = y = None
    files = []
    for d in DAYS:
        p = RAW / "stage4" / f"nws_precip_1day_{d}_conus.nc"
        ds = netCDF4.Dataset(p)
        crs = ds.variables["crs"]
        assert crs.grid_mapping_name == "polar_stereographic"
        assert abs(float(crs.straight_vertical_longitude_from_pole) - LON0) < 1e-9
        assert abs(float(crs.standard_parallel) - LAT_TS) < 1e-9
        assert abs(float(crs.earth_radius) - R_EARTH) < 1e-6
        v = ds.variables["observation"]
        assert v.units == "Inches", v.units
        assert ds.data_time == f"{d}T12:00:00", ds.data_time
        v.set_auto_mask(False)
        a = np.array(v[:], dtype=np.float64)
        fill = float(v._FillValue)
        a[(a == fill) | (a < 0) | ~np.isfinite(a)] = np.nan  # fill value and the -10000 "no data" flag
        fields.append(a * MM_PER_INCH)
        if x is None:
            x = np.array(ds.variables["x"][:], dtype=np.float64)
            y = np.array(ds.variables["y"][:], dtype=np.float64)
        files.append({"file": p.name, "sha256": sha256(p), "periodEnd": f"{iso(d)}T12:00:00Z", "providerCreationTime": str(ds.creation_time)})
        ds.close()
    return np.stack(fields), x, y, files


class Hrap:
    def __init__(self, x, y):
        self.x0, self.dx, self.nx = x[0], x[1] - x[0], len(x)
        self.y0, self.dy, self.ny = y[0], y[1] - y[0], len(y)
        assert np.allclose(np.diff(x), self.dx) and np.allclose(np.diff(y), self.dy)

    def index(self, lat, lon):
        px, py = hrap_xy(lat, lon)
        i = np.rint((px - self.x0) / self.dx).astype(int)
        j = np.rint((py - self.y0) / self.dy).astype(int)
        return j, i

    def inside(self, j, i):
        return (j >= 0) & (j < self.ny) & (i >= 0) & (i < self.nx)


# ---------- Atlas 14 ----------

def parse_atlas(path: Path):
    """Parse an HDSC fe_text_*.csv. Returns (header dict, {duration: [values by ARI]}, ari list)."""
    text = path.read_text(encoding="utf-8", errors="replace")
    if "PRECIPITATION FREQUENCY ESTIMATES" not in text:
        return None
    head = {}
    for ln in text.splitlines():
        if ln.startswith("NOAA Atlas 14"):
            head["volume"] = ln.strip()
        elif ln.startswith("Project area:"):
            head["projectArea"] = ln.split(":", 1)[1].strip()
        elif ln.startswith("Point precipitation frequency estimates"):
            head["units"] = re.search(r"\((.*?)\)", ln).group(1)
        elif ln.startswith("Time series type:"):
            head["series"] = ln.split(":", 1)[1].strip()
    ari = None
    table = {}
    for row in csv.reader(io.StringIO(text)):
        if not row:
            continue
        if row[0].startswith("by duration for ARI"):
            ari = [int(v) for v in row[1:]]
        elif ari and row[0].endswith(":") and len(row) == len(ari) + 1:
            try:
                table[row[0].rstrip(":")] = [float(v) for v in row[1:]]
            except ValueError:
                pass
    if not ari or head.get("units") != "millimeters":
        return None
    return head, table, ari


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    built = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Sites: refineries and ports of the current app layers, plus refineries of the 2017 fleet
    # (public/data/hindcast/refineries_2017.json) so the hindcast can use the fleet that existed.
    ref = json.loads((ROOT / "public/data/infrastructure/refineries.json").read_text(encoding="utf-8"))
    por = json.loads((ROOT / "public/data/infrastructure/ports.json").read_text(encoding="utf-8"))
    r17 = json.loads((ROOT / "public/data/hindcast/refineries_2017.json").read_text(encoding="utf-8"))
    seen: dict[str, dict] = {}
    for kind, rows_, fleet in (("refinery", ref["facilities"], "2026"), ("port", por["ports"], "ports"), ("refinery", r17["facilities"], "2017")):
        for a in rows_:
            if WEST <= a["lon"] <= EAST and SOUTH <= a["lat"] <= NORTH:
                if a["id"] in seen:
                    assert abs(seen[a["id"]]["lat"] - a["lat"]) < 1e-6 and abs(seen[a["id"]]["lon"] - a["lon"]) < 1e-6, a["id"]
                    seen[a["id"]]["fleets"].append(fleet)
                else:
                    seen[a["id"]] = {"id": a["id"], "kind": kind, "lat": a["lat"], "lon": a["lon"], "fleets": [fleet]}
    assets = list(seen.values())

    rain, x, y, files = load_stage4()  # (day, y, x) in mm
    hrap = Hrap(x, y)

    # Projection self-check: the cell found for a point must be the nearest cell centre, i.e. the
    # inverse-projected centre must lie within about one cell diagonal of the point.
    def cell_latlon(j, i):
        px, py = hrap.x0 + i * hrap.dx, hrap.y0 + j * hrap.dy
        rho = math.hypot(px, py)
        lat = 90.0 - 2.0 * math.degrees(math.atan(rho / (R_EARTH * (1.0 + math.sin(math.radians(LAT_TS))))))
        lon = LON0 + math.degrees(math.atan2(px, -py))
        return lat, lon

    for a in assets:
        j, i = hrap.index(a["lat"], a["lon"])
        assert hrap.inside(j, i)
        clat, clon = cell_latlon(int(j), int(i))
        assert haversine_km(a["lat"], a["lon"], clat, clon) < 3.6, (a["id"], clat, clon)

    # ---------- display grid: nearest HRAP cell at each 0.05 degree cell centre ----------
    nx = int(round((EAST - WEST) / STEP))
    ny = int(round((NORTH - SOUTH) / STEP))
    lons = WEST + (np.arange(nx) + 0.5) * STEP
    lats = SOUTH + (np.arange(ny) + 0.5) * STEP  # row 0 is the southernmost row
    glon, glat = np.meshgrid(lons, lats)
    gj, gi = hrap.index(glat, glon)
    assert hrap.inside(gj, gi).all()
    grid = rain[:, gj, gi]  # (day, ny, nx)
    total = np.nansum(grid, axis=0)
    total[np.isnan(grid).all(axis=0)] = np.nan

    def enc(a2d):
        return [(-1 if not np.isfinite(v) else int(round(float(v)))) for v in a2d.ravel()]

    # Native-grid extremes inside the domain, so subsampling to 0.05 degrees hides nothing.
    cj, ci = np.meshgrid(np.arange(hrap.ny), np.arange(hrap.nx), indexing="ij")
    px, py = hrap.x0 + ci * hrap.dx, hrap.y0 + cj * hrap.dy
    rho = np.hypot(px, py)
    nlat = 90.0 - 2.0 * np.degrees(np.arctan(rho / (R_EARTH * (1.0 + math.sin(math.radians(LAT_TS))))))
    nlon = LON0 + np.degrees(np.arctan2(px, -py))
    indom = (nlon >= WEST) & (nlon <= EAST) & (nlat >= SOUTH) & (nlat <= NORTH)
    native_total = np.where(indom, np.nansum(rain, axis=0), np.nan)
    native_total[np.isnan(rain).all(axis=0)] = np.nan
    jm, im = np.unravel_index(np.nanargmax(native_total), native_total.shape)
    native_max = {"mm": round(float(native_total[jm, im]), 1), "inches": round(float(native_total[jm, im]) / MM_PER_INCH, 2), "lat": round(float(nlat[jm, im]), 3), "lon": round(float(nlon[jm, im]), 3)}
    day_domain_mean = [round(float(np.nanmean(np.where(indom, rain[k], np.nan))), 2) for k in range(len(DAYS))]

    stage4_meta = {
        "provider": "NOAA National Weather Service (NWS), National Centers for Environmental Prediction (NCEP); mosaic of River Forecast Center analyses",
        "dataset": "Stage IV daily multisensor (radar and rain gauge) quantitative precipitation estimate, 24-hour totals ending 1200 UTC",
        "sourceUrl": "https://water.noaa.gov/resources/downloads/precip/stageIV/2017/08/30/nws_precip_1day_20170830_conus.nc",
        "urlPattern": "https://water.noaa.gov/resources/downloads/precip/stageIV/YYYY/MM/DD/nws_precip_1day_YYYYMMDD_conus.nc",
        "landingPage": "https://water.noaa.gov/precip",
        "retrievedAt": retrieved("stage4"),
        "license": "U.S. Government work, public domain",
        "nativeGrid": "HRAP polar stereographic, 1121 x 881 cells, about 3.8 km at 30 N",
        "units": "inches in the source; converted here with 1 inch = 25.4 mm",
        "files": files,
    }

    grid_out = {
        "meta": {
            **stage4_meta,
            "event": "Hurricane Harvey (AL092017)",
            "evidence": "OBSERVED",
            "builtAt": built,
            "builtBy": "research/scripts/build_harvey_rainfall.py",
            "regrid": f"Value of the nearest HRAP cell at the centre of each {STEP} degree cell (no smoothing, no interpolation). Values are rounded to whole millimetres; -1 = no data in the source.",
            "nativeGridMaximumInDomain": {**native_max, "note": "Largest 10-day total of any native HRAP cell whose centre is inside the domain."},
            "domainMeanByDayMm": dict(zip([iso(d) for d in DAYS], day_domain_mean)),
        },
        "grid": {"west": WEST, "south": SOUTH, "east": EAST, "north": NORTH, "step": STEP, "nx": nx, "ny": ny, "order": "row-major, row 0 = southernmost, column 0 = westernmost"},
        "days": [{"date": iso(d), "periodEnd": f"{iso(d)}T12:00:00Z", "mm": enc(grid[k])} for k, d in enumerate(DAYS)],
    }
    (OUT / "harvey_2017_grid.json").write_text(json.dumps(grid_out, separators=(",", ":")), encoding="utf-8")

    # ---------- high-water marks ----------
    hw_raw = json.loads((RAW / "usgs_stn" / "harvey_hwms_filtered.json").read_text(encoding="utf-8"))
    hw = []
    for m in hw_raw:
        la, lo = m.get("latitude_dd"), m.get("longitude_dd")
        if not isinstance(la, (int, float)) or not isinstance(lo, (int, float)):
            continue
        h = m.get("height_above_ground")
        e = m.get("elev_ft")
        hw.append({
            "id": m["id"],
            "lat": round(la, 5),
            "lon": round(lo, 5),
            # 0 is stored for marks whose height above ground was not measured as well as for marks at ground level, so 0 is kept as null.
            "hFt": round(float(h), 2) if isinstance(h, (int, float)) and h > 0 else None,
            "elevFt": round(float(e), 2) if isinstance(e, (int, float)) else None,
            "vdatum": m.get("vertical_datum_name") or None,
            "quality": m.get("hwm_quality_name") or None,
            "env": m.get("environment") or None,
            "type": m.get("hwm_type_name") or None,
            "water": (m.get("waterbody") or "").strip() or None,
            "county": m.get("county_name") or None,
            "state": m.get("state_name") or None,
        })
    hw.sort(key=lambda m: m["id"])
    hw_lat = np.array([m["lat"] for m in hw])
    hw_lon = np.array([m["lon"] for m in hw])
    hw_h = np.array([m["hFt"] if m["hFt"] is not None else np.nan for m in hw])
    hw_meta = {
        "provider": "U.S. Geological Survey (USGS), Short-Term Network (STN) Flood Event Data",
        "dataset": "High-water marks, event 180 '2017 Harvey' (approved records)",
        "sourceUrl": "https://api.waterdata.usgs.gov/stnservices/hwms/filteredhwms/?event=180&format=json",
        "landingPage": "https://apps.usgs.gov/stnweb",
        "retrievedAt": retrieved("usgs_stn"),
        "license": "U.S. Government work, public domain",
        "evidence": "OBSERVED",
        "count": len(hw),
        "sourceSha256": sha256(RAW / "usgs_stn" / "harvey_hwms_filtered.json"),
        "fields": {"hFt": "height of the mark above the ground at the mark, feet (null when not recorded or zero)", "elevFt": "elevation of the mark, feet, in the datum given by vdatum", "quality": "USGS quality class with its stated vertical uncertainty", "env": "Riverine or Coastal"},
        "notes": "A high-water mark records how high water reached at one place. Marks were collected where crews went, mostly along rivers, bayous and the coast; the absence of a mark is not evidence that a place stayed dry.",
    }
    (OUT / "harvey_2017_hwms.json").write_text(json.dumps({"meta": {**hw_meta, "builtAt": built}, "marks": hw}, separators=(",", ":")), encoding="utf-8")

    # ---------- per asset ----------
    rows = []
    gaps: dict[str, list[str]] = {"atlas14": [], "imerg": [], "elevation": [], "nfhl": []}
    for a in assets:
        j, i = (int(v) for v in hrap.index(a["lat"], a["lon"]))
        daily = rain[:, j, i]
        nb = rain[:, max(0, j - 1) : j + 2, max(0, i - 1) : i + 2].sum(axis=0)  # 10-day totals of the 3 x 3 block
        row = {
            "id": a["id"],
            "kind": a["kind"],
            "fleets": a["fleets"],
            "lat": a["lat"],
            "lon": a["lon"],
            "stage4": {
                "dailyMm": [None if not np.isfinite(v) else round(float(v), 1) for v in daily],
                "block3x3TotalMm": None if not np.isfinite(nb).any() else {"min": round(float(np.nanmin(nb)), 1), "max": round(float(np.nanmax(nb)), 1)},
            },
        }

        # NOAA Atlas 14
        parsed = {k: (parse_atlas(RAW / "atlas14" / f"{a['id']}_{k}.csv") if (RAW / "atlas14" / f"{a['id']}_{k}.csv").exists() else None) for k in ("mean", "uppr", "lwr")}
        if all(parsed.values()) and all(d in parsed["mean"][1] for d in ATLAS_DURATIONS):
            head, table, ari = parsed["mean"]
            row["atlas14"] = {
                "volume": head.get("volume"),
                "projectArea": head.get("projectArea"),
                "ariYears": ari,
                "mm": {d: table[d] for d in ATLAS_DURATIONS},
                "upper90": {d: parsed["uppr"][1][d] for d in ATLAS_DURATIONS},
                "lower90": {d: parsed["lwr"][1][d] for d in ATLAS_DURATIONS},
            }
        else:
            row["atlas14"] = None
            gaps["atlas14"].append(a["id"])

        # NASA POWER: IMERG and MERRA-2
        p = RAW / "power_imerg" / f"{a['id']}.json"
        row["nasa"] = None
        if p.exists():
            try:
                pj = json.loads(p.read_text(encoding="utf-8"))
                par = pj["properties"]["parameter"]
                fillv = pj["header"]["fill_value"]
                assert pj["header"]["time_standard"] == "UTC"

                def series(name):
                    return [None if par[name][d] == fillv else round(float(par[name][d]), 2) for d in DAYS]

                row["nasa"] = {"imergDailyMm": series("IMERG_PRECTOT"), "merra2DailyMm": series("PRECTOTCORR")}
            except (KeyError, ValueError, AssertionError):
                pass
        if row["nasa"] is None:
            gaps["imerg"].append(a["id"])

        # USGS 3DEP elevation
        p = RAW / "epqs" / f"{a['id']}.json"
        row["elevationM"] = None
        if p.exists():
            try:
                v = float(json.loads(p.read_text(encoding="utf-8"))["value"])
                if -100 < v < 9000:
                    row["elevationM"] = round(v, 2)
            except (KeyError, ValueError, TypeError):
                pass
        if row["elevationM"] is None:
            gaps["elevation"].append(a["id"])

        # FEMA NFHL flood zone at the point
        p = RAW / "nfhl" / f"{a['id']}.json"
        row["nfhl"] = None
        if p.exists():
            try:
                fj = json.loads(p.read_text(encoding="utf-8"))
                if "features" in fj:
                    if fj["features"]:
                        at = fj["features"][0]["attributes"]
                        row["nfhl"] = {"mapped": True, "zone": at.get("FLD_ZONE"), "subtype": (at.get("ZONE_SUBTY") or "").strip() or None, "sfha": at.get("SFHA_TF") == "T"}
                    else:
                        row["nfhl"] = {"mapped": False, "zone": None, "subtype": None, "sfha": None}
            except (KeyError, ValueError):
                pass
        if row["nfhl"] is None:
            gaps["nfhl"].append(a["id"])

        # USGS high-water marks near the point
        dist = haversine_km(a["lat"], a["lon"], hw_lat, hw_lon)
        near5 = dist <= 5.0
        hs = hw_h[near5 & np.isfinite(hw_h)]
        row["hwm"] = {
            "within2km": int((dist <= 2.0).sum()),
            "within5km": int(near5.sum()),
            "nearestKm": round(float(dist.min()), 2),
            "withHeightWithin5km": int(hs.size),
            "maxHeightFtWithin5km": round(float(hs.max()), 2) if hs.size else None,
            "medianHeightFtWithin5km": round(float(np.median(hs)), 2) if hs.size else None,
        }
        rows.append(row)

    assets_out = {
        "meta": {
            "event": "Hurricane Harvey (AL092017)",
            "builtAt": built,
            "builtBy": "research/scripts/build_harvey_rainfall.py",
            "domain": {"west": WEST, "south": SOUTH, "east": EAST, "north": NORTH},
            "days": [iso(d) for d in DAYS],
            "dayDefinition": {"stage4": "24 hours ending 1200 UTC on the date", "nasa": "UTC calendar day"},
            "assetCount": len(rows),
            "missing": gaps,
            "sources": {
                "stage4": {k: v for k, v in stage4_meta.items() if k != "files"},
                "atlas14": {
                    "provider": "NOAA National Weather Service, Hydrometeorological Design Studies Center (HDSC)",
                    "dataset": "NOAA Atlas 14 point precipitation frequency estimates, partial duration series, with 90% confidence bounds",
                    "sourceUrl": "https://hdsc.nws.noaa.gov/cgi-bin/new/fe_text_mean.csv?lat=29.72&lon=-95.2&data=depth&units=metric&series=pds",
                    "landingPage": "https://hdsc.nws.noaa.gov/pfds/",
                    "retrievedAt": retrieved("atlas14"),
                    "license": "U.S. Government work, public domain",
                    "units": "millimetres",
                },
                "nasa": {
                    "provider": "NASA Langley Research Center, POWER project",
                    "dataset": "POWER daily point data at source native resolution: IMERG_PRECTOT (GPM IMERG) and PRECTOTCORR (MERRA-2 bias-corrected precipitation)",
                    "sourceUrl": "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=IMERG_PRECTOT,PRECTOTCORR&community=AG&longitude=-95.2789&latitude=29.6381&start=20170824&end=20170902&format=JSON&time-standard=UTC",
                    "landingPage": "https://power.larc.nasa.gov/",
                    "retrievedAt": retrieved("power_imerg"),
                    "license": "NASA open data",
                    "units": "mm/day",
                },
                "elevation": {
                    "provider": "U.S. Geological Survey, 3D Elevation Program (3DEP)",
                    "dataset": "Elevation Point Query Service, metres (NAVD88)",
                    "sourceUrl": "https://epqs.nationalmap.gov/v1/json?x=-95.2&y=29.72&units=Meters&wkid=4326",
                    "landingPage": "https://apps.nationalmap.gov/epqs/",
                    "retrievedAt": retrieved("epqs"),
                    "license": "U.S. Government work, public domain",
                },
                "nfhl": {
                    "provider": "Federal Emergency Management Agency (FEMA)",
                    "dataset": "National Flood Hazard Layer, Flood Hazard Zones (layer 28), queried at each point",
                    "sourceUrl": "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28",
                    "landingPage": "https://www.fema.gov/flood-maps/national-flood-hazard-layer",
                    "retrievedAt": retrieved("nfhl"),
                    "license": "U.S. Government work, public domain",
                    "notes": "The zone effective on the retrieval date, not the map in force in August 2017.",
                },
                "hwm": hw_meta,
            },
        },
        "assets": rows,
    }
    (OUT / "harvey_2017_assets.json").write_text(json.dumps(assets_out, separators=(",", ":")), encoding="utf-8")

    # ---------- Stage IV against GHCN-Daily gauges ----------
    st_path = RAW / "ghcn" / "stations.json"
    check = {"note": "GHCN-Daily files not present"}
    if st_path.exists():
        stations = {s["id"]: s for s in json.loads(st_path.read_text(encoding="utf-8"))}
        obs: dict[str, dict[str, float]] = {}
        flagged: set[str] = set()
        names: dict[str, str] = {}
        for p in sorted((RAW / "ghcn").glob("data_*.json")):
            for r in json.loads(p.read_text(encoding="utf-8")):
                sid = r["STATION"]
                names[sid] = r.get("NAME", "")
                v = r.get("PRCP")
                if v in (None, ""):
                    continue
                attrs = (r.get("PRCP_ATTRIBUTES") or "").split(",")
                # attributes: measurement flag, quality flag, source flag[, obs time]. A non-blank quality flag = failed a QC check.
                if len(attrs) > 1 and attrs[1].strip():
                    flagged.add(sid)
                    continue
                obs.setdefault(sid, {})[r["DATE"]] = float(v)
        want = [iso(d) for d in DAYS]
        pairs = []
        for sid, dd in obs.items():
            if sid in flagged or any(d not in dd for d in want) or sid not in stations:
                continue
            s = stations[sid]
            if not (WEST <= s["lon"] <= EAST and SOUTH <= s["lat"] <= NORTH):
                continue
            j, i = (int(v) for v in hrap.index(s["lat"], s["lon"]))
            cell = rain[:, j, i]
            if not np.isfinite(cell).all():
                continue
            pairs.append({"id": sid, "name": names.get(sid, ""), "lat": s["lat"], "lon": s["lon"], "gaugeMm": round(sum(dd[d] for d in want), 1), "stage4Mm": round(float(cell.sum()), 1)})
        pairs.sort(key=lambda r: -r["gaugeMm"])
        g = np.array([r["gaugeMm"] for r in pairs])
        s4 = np.array([r["stage4Mm"] for r in pairs])

        def stats(mask):
            if mask.sum() < 3:
                return {"n": int(mask.sum())}
            d = s4[mask] - g[mask]
            return {
                "n": int(mask.sum()),
                "gaugeMeanMm": round(float(g[mask].mean()), 1),
                "stage4MeanMm": round(float(s4[mask].mean()), 1),
                "meanDifferenceMm": round(float(d.mean()), 1),
                "meanAbsoluteDifferenceMm": round(float(np.abs(d).mean()), 1),
                "rmsDifferenceMm": round(float(np.sqrt((d**2).mean())), 1),
                "medianRatioStage4OverGauge": round(float(np.median(s4[mask][g[mask] > 0] / g[mask][g[mask] > 0])), 3),
                "pearsonR": round(float(np.corrcoef(g[mask], s4[mask])[0, 1]), 3),
            }

        check = {
            "builtAt": built,
            "what": "Ten-day totals (2017-08-24 to 2017-09-02) at GHCN-Daily stations against the Stage IV cell containing each station.",
            "source": {"provider": "NOAA National Centers for Environmental Information (NCEI)", "dataset": "Global Historical Climatology Network - Daily (daily-summaries), PRCP", "sourceUrl": "https://www.ncei.noaa.gov/access/services/data/v1", "retrievedAt": retrieved("ghcn"), "license": "U.S. Government work, public domain"},
            "selection": "Stations inside the domain with a PRCP value on all ten dates and no value carrying a quality-control flag. Stations with any flagged value are dropped whole.",
            "stationsInDomain": len(stations),
            "stationsWithFlaggedValues": len(flagged),
            "caveats": [
                "Not an independent test: Stage IV is itself adjusted with rain gauges, and some of these stations may be among them.",
                "A gauge samples a few hundred square centimetres; a Stage IV cell is an average over about 15 square kilometres.",
                "Station days differ: many observers read at about 7 a.m. local time (close to the 1200 UTC Stage IV day), airport stations report midnight to midnight local time. Ten-day totals limit this effect; it does not vanish.",
                "Gauges under-catch in strong wind and can overflow or fail in extreme rain; stations that failed leave no record and are absent here.",
            ],
            "all": stats(np.ones(len(pairs), dtype=bool)),
            "gaugeAtLeast250mm": stats(g >= 250),
            "gaugeAtLeast750mm": stats(g >= 750),
            "pairs": pairs,
        }
    (ROOT / "research" / "rainfall_gauge_check.json").write_text(json.dumps(check, indent=1), encoding="utf-8")

    print("grid", nx, "x", ny, "| assets", len(rows), "| hwms", len(hw), "| missing", {k: len(v) for k, v in gaps.items()})
    print("native max", native_max, "| domain mean by day", day_domain_mean)
    if "all" in check:
        print("gauge check", check["all"], check["gaugeAtLeast750mm"])
    for name in ("harvey_2017_grid.json", "harvey_2017_assets.json", "harvey_2017_hwms.json"):
        print(name, (OUT / name).stat().st_size, "bytes")


if __name__ == "__main__":
    main()
