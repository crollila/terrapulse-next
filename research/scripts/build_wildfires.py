"""
Build the bundled wildfire record: three historical fires with OBSERVED perimeters, OBSERVED
satellite fire detections, gridded fire-weather conditions, nearby energy infrastructure and
documented facts. Nothing is simulated: there is no fire-spread model here.

  research/venv/Scripts/python.exe -I research/scripts/build_wildfires.py

Every download is keyless and is cached under research/raw/wildfire_build/ (git-ignored); delete a
cached file to refresh it. The build itself is deterministic given the cached files.

Sources
  Perimeters     NIFC Open Data: InterAgencyFirePerimeterHistory_All_Years_View (to 2019) and
                 WFIGS_Interagency_Perimeters (2020 on); Historic_Geomac_Perimeters_2018 for the
                 Camp Fire's dated perimeters. services3.arcgis.com/T4QMspbfLg3qTGWY
  Detections     NASA FIRMS yearly country archive, VIIRS 375 m (Suomi NPP; NOAA-20 where published)
                 firms.modaps.eosdis.nasa.gov/data/country/
  Conditions     gridMET (Abatzoglou 2013) point series through the THREDDS NetCDF Subset Service;
                 NASA POWER daily point API
  Drought        U.S. Drought Monitor county statistics
  Infrastructure U.S. EIA power plants and natural gas pipelines (shapefiles, public domain);
                 electric transmission lines from the archived HIFLD layer (derived counts only)
  Facts          CAL FIRE incident API and DINS damage inspections; U.S. Census TIGERweb; quotes from
                 the Texas House committee report, Texas A&M Forest Service and Boulder County, each
                 checked against the saved copy of the document.

Writes public/data/wildfire/index.json and public/data/wildfire/<id>.json.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

import netCDF4
import shapefile
from shapely.geometry import LineString, MultiLineString, Point, shape
from shapely.ops import transform as _transform


def transform(func, geom):
    """Project a geometry with a (lon, lat) -> (x, y) function."""
    import warnings

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        return _transform(func, geom)

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "research" / "raw" / "wildfire_build"
FACT_DOCS = ROOT / "research" / "raw" / "wildfire" / "facts"
OUT = ROOT / "public" / "data" / "wildfire"
UA = "Mozilla/5.0 (research-client)"
NIFC = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
HIFLD_TX = "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0"
ACRES_PER_KM2 = 247.105381

EVENTS = [
    {
        "id": "camp-2018",
        "name": "Camp Fire",
        "place": "Butte County, California",
        "year": 2018,
        "countyFips": "06007",
        "perimeter": {"service": "InterAgencyFirePerimeterHistory_All_Years_View", "where": "INCIDENT='CAMP' AND FIRE_YEAR_INT=2018 AND UNIT_ID='CABTU'", "acresField": "GIS_ACRES", "offset": 0.0005},
        "progression": {"service": "Historic_Geomac_Perimeters_2018", "where": "UPPER(incidentname)='CAMP' AND state='CA'", "offset": 0.001},
        "calfire": {"year": 2018, "name": "Camp Fire", "county": "Butte"},
        "detections": ("2018-11-08", "2018-11-26"),
        "conditions": ("2018-10-25", "2018-11-30"),
    },
    {
        "id": "marshall-2021",
        "name": "Marshall Fire",
        "place": "Boulder County, Colorado",
        "year": 2021,
        "countyFips": "08013",
        "perimeter": {"service": "WFIGS_Interagency_Perimeters", "where": "attr_UniqueFireIdentifier='2021-COBLX-000995'", "acresField": "poly_GISAcres", "offset": 0.0002},
        "detections": ("2021-12-30", "2022-01-02"),
        "conditions": ("2021-12-16", "2022-01-05"),
    },
    {
        "id": "smokehouse-creek-2024",
        "name": "Smokehouse Creek Fire",
        "place": "Texas Panhandle and western Oklahoma",
        "year": 2024,
        "countyFips": "48233",
        "perimeter": {"service": "WFIGS_Interagency_Perimeters", "where": "attr_UniqueFireIdentifier='2024-TXTXS-240317'", "acresField": "poly_GISAcres", "offset": 0.0005},
        "detections": ("2024-02-26", "2024-03-05"),
        "conditions": ("2024-02-12", "2024-03-10"),
    },
]

GRIDMET = [
    ("erc", "energy_release_component-g", "Energy release component (ERC-G)", "index"),
    ("bi", "burning_index_g", "Burning index (BI-G)", "index"),
    ("fm100", "dead_fuel_moisture_100hr", "100-hour dead fuel moisture", "%"),
    ("vs", "wind_speed", "Daily mean wind speed at 10 m", "m/s"),
    ("rmin", "relative_humidity", "Daily minimum relative humidity", "%"),
    ("vpd", "mean_vapor_pressure_deficit", "Mean vapour pressure deficit", "kPa"),
    ("pr", "precipitation_amount", "Daily precipitation", "mm"),
]

# Documented facts. Each quote is checked against the saved copy of its source (whitespace ignored,
# because PDF text extraction breaks words); a quote that cannot be found is dropped, not shown.
FACTS = {
    "smokehouse-creek-2024": [
        {"label": "Size", "value": "1,054,153 acres", "doc": "tamfs_law_enforcement.txt", "quote": "the Smokehouse Creek Fire—the largest wildfire in Texas history that originated near Stinnett, Texas, in February 2024 and burned 1,054,153 acres", "source": "Texas A&M Forest Service", "url": "https://tfsweb.tamu.edu/texas-am-forest-service-honors-law-enforcement-officers/"},
        {"label": "Ignition", "value": "A power pole broke and its line fell into grass, 26 February 2024", "doc": "tx_house_panhandle_wildfires_report.txt", "quote": "a decayed power pole broke at ground level and caused the three-wire power line atop it to fall and make contact with fine grassy fuels, igniting what would become the Smokehouse Creek Fire", "source": "Texas House of Representatives, Investigative Committee on the Panhandle Wildfires, report", "url": "https://www.house.texas.gov/pdfs/committees/reports/interim/88interim/House-Interim-Committee-on-The-Panhandle-Wildfires-Report.pdf"},
        {"label": "Cause, as found by the committee", "value": "Downed power poles owned by Xcel Energy", "doc": "tx_house_panhandle_wildfires_report.txt", "quote": "Both the Smokehouse Creek and Reamer Creek fires were caused by downed power poles owned by Xcel Energy", "source": "Texas House of Representatives, Investigative Committee on the Panhandle Wildfires, report", "url": "https://www.house.texas.gov/pdfs/committees/reports/interim/88interim/House-Interim-Committee-on-The-Panhandle-Wildfires-Report.pdf"},
        {"label": "Spread", "value": "About 40,000 acres on 27 February, more than 900,000 two days later", "doc": "tx_house_panhandle_wildfires_report.txt", "quote": "Approximately 40,000 acres burned on February 27th, expanding to more than 900,000 acres over the next two days", "source": "Texas House of Representatives, Investigative Committee on the Panhandle Wildfires, report", "url": "https://www.house.texas.gov/pdfs/committees/reports/interim/88interim/House-Interim-Committee-on-The-Panhandle-Wildfires-Report.pdf"},
        {"label": "Losses", "value": "More than 15,000 cattle; an estimated 138 homes and businesses", "doc": "tx_house_panhandle_wildfires_report.txt", "quote": "More than 15,000 head of cattle (including pregnant cows) perished, an estimated 138 homes and businesses were destroyed, and over one million acres of land were consumed", "source": "Texas House of Representatives, Investigative Committee on the Panhandle Wildfires, report", "url": "https://www.house.texas.gov/pdfs/committees/reports/interim/88interim/House-Interim-Committee-on-The-Panhandle-Wildfires-Report.pdf"},
        {"label": "Costs to utilities", "value": "The committee expects utilities may seek to pass costs on", "doc": "tx_house_panhandle_wildfires_report.txt", "quote": "it is anticipated that utility companies may seek to pass along the costs of electrical infrastructure repairs and damages paid to landowners for fire-related losses", "source": "Texas House of Representatives, Investigative Committee on the Panhandle Wildfires, report", "url": "https://www.house.texas.gov/pdfs/committees/reports/interim/88interim/House-Interim-Committee-on-The-Panhandle-Wildfires-Report.pdf"},
    ],
    "marshall-2021": [
        {"label": "Wind", "value": "Gusts of 70 to 100 mph at the base of the foothills", "doc": "boulder_marshall_aar.txt", "quote": "Wind gusts from 70 to 100 mph occurred right at the base of the foothills, including in Boulder and along Highway 93 south toward Golden", "source": "Boulder County, Marshall Fire Operational After-Action Report", "url": "https://assets.bouldercounty.gov/wp-content/uploads/2025/03/marshall-fire-operational-after-action-report-003.pdf"},
        {"label": "Fuels and humidity", "value": "Cured grass, relative humidity around 20%", "doc": "boulder_marshall_aar.txt", "quote": "it spread rapidly in cured grass fuels (dry grass materials) with relative humidity around 20% and winds up to 100 mph", "source": "Boulder County, Marshall Fire Operational After-Action Report", "url": "https://assets.bouldercounty.gov/wp-content/uploads/2025/03/marshall-fire-operational-after-action-report-003.pdf"},
        {"label": "Structures, after-action report", "value": "1,084 homes and 7 commercial structures destroyed", "doc": "boulder_marshall_aar.txt", "quote": "At last count, the Marshall Fire destroyed 1,084 homes, and seven commercial structures and damaged 149 homes and 30 commercial structures", "source": "Boulder County, Marshall Fire Operational After-Action Report", "url": "https://assets.bouldercounty.gov/wp-content/uploads/2025/03/marshall-fire-operational-after-action-report-003.pdf"},
        {"label": "Structures, county recovery page", "value": "1,109 homes destroyed", "doc": "bouldercounty_marshall.txt", "quote": "Of the 1,109 homes destroyed", "source": "Boulder County, Marshall Fire recovery page", "url": "https://bouldercounty.gov/disasters/wildfires/marshall/"},
    ],
    "camp-2018": [],
}


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get(url: str, name: str, *, tries: int = 4, pause: float = 0.5, headers: dict | None = None) -> Path | None:
    dest = RAW / name
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    last = ""
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*", **(headers or {})})
            with urllib.request.urlopen(req, timeout=300) as r:
                body = r.read()
            if not body:
                raise ValueError("empty body")
            dest.write_bytes(body)
            (RAW / "retrieved.log").open("a", encoding="utf-8").write(f"{now()}\t{name}\t{url}\n")
            time.sleep(pause)
            return dest
        except (urllib.error.URLError, urllib.error.HTTPError, ValueError, TimeoutError, ConnectionError) as e:
            last = str(e)
            time.sleep(2.0 * (i + 1))
    print(f"  FAILED {name}: {last}", file=sys.stderr)
    return None


def retrieved(name: str) -> str | None:
    log = RAW / "retrieved.log"
    if not log.exists():
        return None
    rows = [ln.split("\t") for ln in log.read_text(encoding="utf-8").splitlines() if ln.strip()]
    hit = [r[0] for r in rows if r[1] == name]
    return hit[-1] if hit else None


def arcgis(base: str, service: str, where: str, name: str, *, offset: float | None = None, fields: str = "*", extra: dict | None = None) -> dict | None:
    q = {"where": where, "outFields": fields, "outSR": 4326, "f": "geojson", "geometryPrecision": 5}
    if offset:
        q["maxAllowableOffset"] = offset
    if extra:
        q.update(extra)
    url = f"{base}{service}/FeatureServer/0/query?{urllib.parse.urlencode(q)}"
    p = get(url, name)
    if not p:
        return None
    d = json.loads(p.read_text(encoding="utf-8"))
    d["_url"] = url
    return d


# ---------- geometry (local equirectangular metres about a reference latitude) ----------

def projector(lat0: float):
    kx = 111_320.0 * math.cos(math.radians(lat0))
    ky = 110_574.0
    return lambda x, y, z=None: (x * kx, y * ky)


def round_geom(g: dict, nd: int = 4) -> dict:
    def r(c):
        return [round(c[0], nd), round(c[1], nd)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    return {"type": g["type"], "coordinates": r(g["coordinates"])}


def iso_ms(ms: float | None) -> str | None:
    return None if ms is None else datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def squeeze(s: str) -> str:
    return re.sub(r"\s+", "", s).replace("—", "-").replace("–", "-").replace("’", "'").replace("“", '"').replace("”", '"')


def verified_facts(event_id: str) -> tuple[list[dict], list[str]]:
    out, dropped = [], []
    for f in FACTS.get(event_id, []):
        p = FACT_DOCS / f["doc"]
        ok = p.exists() and squeeze(f["quote"]) in squeeze(p.read_text(encoding="utf-8", errors="replace"))
        if ok:
            out.append({"label": f["label"], "value": f["value"], "quote": f["quote"], "source": f["source"], "url": f["url"], "evidence": "HISTORICAL", "quoteCheckedAgainstSavedCopy": True})
        else:
            dropped.append(f"{f['label']}: quote not found in {f['doc']}")
    return out, dropped


def firms_rows(year: int) -> tuple[list[dict], list[dict]]:
    rows, files = [], []
    for sat, folder in (("Suomi NPP", "viirs-snpp"), ("NOAA-20", "viirs-jpss1")):
        name = f"firms_{folder}_{year}_United_States.csv"
        url = f"https://firms.modaps.eosdis.nasa.gov/data/country/{folder}/{year}/{folder}_{year}_United_States.csv"
        p = get(url, name, tries=2)
        if not p:
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        if not text.startswith("latitude,longitude"):
            p.unlink()
            continue
        files.append({"satellite": sat, "url": url, "sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "retrievedAt": retrieved(name)})
        for r in csv.DictReader(io.StringIO(text)):
            r["_sat"] = sat
            rows.append(r)
    return rows, files


def gridmet_packing(var: str, ncvar: str, year: int) -> tuple[float, float]:
    """scale_factor and add_offset of a gridMET variable, read from the dataset's own attributes.

    The point subsets returned by the NetCDF Subset Service hold the packed integers WITHOUT these
    attributes, so they must be read from the full dataset's attribute listing (.das). A variable
    whose packing cannot be read is not used.
    """
    p = get(f"https://thredds.northwestknowledge.net/thredds/dodsC/MET/{var}/{var}_{year}.nc.das", f"gridmet_das_{var}_{year}.txt")
    if not p:
        raise ValueError(f"no attribute listing for {var}")
    text = p.read_text(encoding="utf-8", errors="replace")
    m = re.search(r"\b" + re.escape(ncvar) + r"\s*\{(.*?)\n\s*\}", text, re.S)
    if not m:
        raise ValueError(f"{ncvar} not found in the attribute listing")
    block = m.group(1)
    sf = re.search(r"scale_factor\s+([-0-9.eE+]+)\s*;", block)
    ao = re.search(r"add_offset\s+([-0-9.eE+]+)\s*;", block)
    if not sf:
        raise ValueError(f"{ncvar}: scale_factor missing")
    return float(sf.group(1)), float(ao.group(1)) if ao else 0.0


def gridmet_series(var: str, ncvar: str, lat: float, lon: float, start: str, end: str, tag: str) -> tuple[list[tuple[str, float | None]], dict]:
    out: dict[str, float | None] = {}
    packing = {}
    y0, y1 = int(start[:4]), int(end[:4])
    for year in range(y0, y1 + 1):
        scale, offset = gridmet_packing(var, ncvar, year)
        packing = {"scaleFactor": scale, "addOffset": offset}
        a = max(start, f"{year}-01-01")
        b = min(end, f"{year}-12-31")
        q = urllib.parse.urlencode({"var": ncvar, "latitude": lat, "longitude": lon, "time_start": f"{a}T00:00:00Z", "time_end": f"{b}T00:00:00Z", "accept": "netcdf"})
        p = get(f"https://thredds.northwestknowledge.net/thredds/ncss/MET/{var}/{var}_{year}.nc?{q}", f"gridmet_{tag}_{var}_{year}.nc")
        if not p:
            continue
        ds = netCDF4.Dataset("inmem", memory=p.read_bytes())
        v = ds.variables[ncvar]
        v.set_auto_maskandscale(False)
        assert "scale_factor" not in v.ncattrs(), "subset already carries a scale factor: do not apply it twice"
        t = ds.variables["time"]
        dates = netCDF4.num2date(t[:], t.units, only_use_cftime_datetimes=False)
        for d, x in zip(dates.reshape(-1), v[:].reshape(-1)):
            raw = int(x)
            out[d.strftime("%Y-%m-%d")] = None if raw in (32767, -32767, -32768) else round(raw * scale + offset, 2)
        ds.close()
    return sorted(out.items()), packing


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    built = now()
    refineries = json.loads((ROOT / "public/data/infrastructure/refineries.json").read_text(encoding="utf-8"))["facilities"]
    ports = json.loads((ROOT / "public/data/infrastructure/ports.json").read_text(encoding="utf-8"))["ports"]

    # EIA shapefiles (public domain)
    eia = {}
    for key, zname, stem in (("plants", "PowerPlants_US_EIA.zip", None), ("gas", "NaturalGas_InterIntrastate_Pipelines_US_EIA.zip", None)):
        p = get(f"https://www.eia.gov/maps/map_data/{zname}", zname)
        if not p:
            raise SystemExit(f"{zname} not available")
        zf = zipfile.ZipFile(p)
        shp = [n for n in zf.namelist() if n.lower().endswith(".shp")][0]
        base = shp[:-4]
        rd = shapefile.Reader(shp=io.BytesIO(zf.read(base + ".shp")), dbf=io.BytesIO(zf.read(base + ".dbf")), shx=io.BytesIO(zf.read(base + ".shx")))
        eia[key] = {"reader": rd, "fields": [f[0] for f in rd.fields[1:]], "file": zname, "sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "retrievedAt": retrieved(zname)}
    print("EIA plant fields:", eia["plants"]["fields"])
    print("EIA gas pipeline fields:", eia["gas"]["fields"])
    plant_recs = [(r.as_dict(), s.points[0]) for r, s in zip(eia["plants"]["reader"].records(), eia["plants"]["reader"].shapes()) if s.points]
    # The pipeline file holds a few records with no geometry; they are skipped and counted.
    gas_shapes, gas_empty = [], 0
    grd = eia["gas"]["reader"]
    for i in range(len(grd)):
        try:
            shp_i = grd.shape(i)
        except shapefile.ShapefileException:
            gas_empty += 1
            continue
        if shp_i.points:
            gas_shapes.append((grd.record(i), shp_i))
    print("gas pipeline records", len(grd), "without geometry", gas_empty)

    index = []
    for ev in EVENTS:
        eid = ev["id"]
        print("==", eid)
        gaps: list[str] = []
        pc = ev["perimeter"]
        fc = arcgis(NIFC, pc["service"], pc["where"], f"{eid}_perimeter.geojson", offset=pc["offset"])
        assert fc and len(fc["features"]) == 1, (eid, fc and len(fc["features"]))
        feat = fc["features"][0]
        props = feat["properties"]
        geom = shape(feat["geometry"])
        w, s, e, n = geom.bounds
        lat0 = (s + n) / 2
        proj = projector(lat0)
        gm = transform(proj, geom)
        if not gm.is_valid:
            gm = gm.buffer(0)
        area_km2 = gm.area / 1e6
        reported_acres = float(props[pc["acresField"]])

        def dist_km(lon: float, lat: float) -> float:
            return gm.distance(Point(*proj(lon, lat))) / 1000.0

        # --- start, containment, ignition point ---
        if "calfire" in ev:
            cf = ev["calfire"]
            p = get(f"https://incidents.fire.ca.gov/umbraco/api/IncidentApi/List?inactive=true&year={cf['year']}", f"calfire_incidents_{cf['year']}.json")
            rec = [x for x in json.loads(p.read_text(encoding="utf-8")) if x.get("Name") == cf["name"] and x.get("County") == cf["county"]]
            assert len(rec) == 1, rec
            rec = rec[0]
            start, contained = rec["Started"], rec["ExtinguishedDate"]
            ign = {"lat": rec["Latitude"], "lon": rec["Longitude"]}
            cause = None
            admin = {"provider": "CAL FIRE", "dataset": "Incident API", "sourceUrl": f"https://incidents.fire.ca.gov/umbraco/api/IncidentApi/List?inactive=true&year={cf['year']}", "landingPage": rec.get("Url"), "retrievedAt": retrieved(f"calfire_incidents_{cf['year']}.json"), "reportedAcres": rec["AcresBurned"], "location": rec.get("Location")}
            mapped = {"date": props.get("DATE_CUR"), "method": props.get("MAP_METHOD"), "sourceAgency": props.get("SOURCE")}
        else:
            start, contained = iso_ms(props.get("attr_FireDiscoveryDateTime")), iso_ms(props.get("attr_ContainmentDateTime"))
            ign = {"lat": props.get("attr_InitialLatitude"), "lon": props.get("attr_InitialLongitude")}
            cause = props.get("attr_FireCause")
            admin = {"provider": "National Interagency Fire Center (NIFC), WFIGS", "dataset": "Incident attributes on the perimeter record", "sourceUrl": fc["_url"], "retrievedAt": retrieved(f"{eid}_perimeter.geojson"), "reportedAcres": props.get("attr_IncidentSize"), "location": f"{props.get('attr_POOCounty')} County"}
            mapped = {"date": iso_ms(props.get("poly_DateCurrent")), "method": props.get("poly_MapMethod"), "sourceAgency": props.get("poly_Source")}
        assert start and ign["lat"] and ign["lon"], (eid, start, ign)
        t0 = datetime.strptime(start, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)

        # --- dated perimeters (progression) ---
        progression = []
        if "progression" in ev:
            pg = ev["progression"]
            pf = arcgis(NIFC, pg["service"], pg["where"], f"{eid}_progression.geojson", offset=pg["offset"])
            for f in (pf or {}).get("features", []):
                pp = f["properties"]
                when = pp.get("perimeterdatetime")
                if when is None or not f.get("geometry"):
                    continue
                progression.append({"time": iso_ms(when), "acres": round(float(pp["gisacres"]), 1) if pp.get("gisacres") is not None else None, "method": pp.get("mapmethod"), "geometry": round_geom(f["geometry"], 4)})
            progression.sort(key=lambda x: x["time"])
            # one record per time; keep the larger when two share a timestamp
            dedup: dict[str, dict] = {}
            for x in progression:
                if x["time"] not in dedup or (x["acres"] or 0) > (dedup[x["time"]]["acres"] or 0):
                    dedup[x["time"]] = x
            progression = list(dedup.values())
            prog_meta = {"provider": "NIFC Open Data (GeoMAC archive)", "dataset": pg["service"], "sourceUrl": pf["_url"] if pf else None, "retrievedAt": retrieved(f"{eid}_progression.geojson"), "count": len(progression), "caveat": "GeoMAC: 'Perimeter data in this geospatial dataset is not the final or official perimeter for any incident and is provided for informational purposes only.'"}
        else:
            prog_meta = None
            gaps.append("No dated perimeters are published for this fire: the timeline uses satellite detections only.")

        # --- satellite detections ---
        d0, d1 = ev["detections"]
        rows, firms_files = firms_rows(ev["year"]) if d1[:4] == d0[:4] else ([], [])
        if d1[:4] != d0[:4]:
            for y in (int(d0[:4]), int(d1[:4])):
                r2, f2 = firms_rows(y)
                rows += r2
                firms_files += f2
        pad = 0.2
        det = []
        for r in rows:
            la, lo = float(r["latitude"]), float(r["longitude"])
            if not (w - pad <= lo <= e + pad and s - pad <= la <= n + pad) or not (d0 <= r["acq_date"] <= d1):
                continue
            if str(r.get("type", "0")) not in ("0", ""):  # 0 = presumed vegetation fire
                continue
            hhmm = r["acq_time"].zfill(4)
            t = datetime.strptime(f"{r['acq_date']} {hhmm}", "%Y-%m-%d %H%M").replace(tzinfo=timezone.utc)
            dk = dist_km(lo, la)
            det.append({"t": t, "lat": round(la, 5), "lon": round(lo, 5), "frp": round(float(r["frp"]), 1) if r.get("frp") not in (None, "") else None, "conf": r.get("confidence"), "dn": r.get("daynight"), "sat": r["_sat"], "dk": dk})
        det.sort(key=lambda x: (x["t"], x["lat"], x["lon"]))
        if det and det[0]["t"] < t0:
            gaps.append("Satellite detections begin %.1f hours before the discovery time on the administrative record (%s); the record's time is kept as printed." % ((t0 - det[0]["t"]).total_seconds() / 3600, start))
        far = sum(1 for x in det if x["dk"] > 2.0)
        if far:
            gaps.append("%d of %d detections lie more than 2 km outside this fire's final perimeter: other fires were burning in the same area. They are kept and marked, not removed." % (far, len(det)))
        if not det:
            gaps.append("No VIIRS detections were found in the FIRMS archive for this fire's area and dates.")
        inside = sum(1 for x in det if x["dk"] <= 0.375)
        within2 = sum(1 for x in det if x["dk"] <= 2.0)
        passes = sorted({(x["t"], x["sat"]) for x in det})
        detections = {
            "fields": ["minutesFromStart", "lat", "lon", "frpMw", "confidence", "dayNight", "satellite", "kmOutsideFinalPerimeter"],
            "rows": [[round((x["t"] - t0).total_seconds() / 60), x["lat"], x["lon"], x["frp"], x["conf"], x["dn"], 0 if x["sat"] == "Suomi NPP" else 1, round(x["dk"], 2)] for x in det],
            "satellites": ["Suomi NPP", "NOAA-20"],
            "overpasses": [{"time": t.strftime("%Y-%m-%dT%H:%M:%SZ"), "satellite": sat, "count": sum(1 for x in det if x["t"] == t and x["sat"] == sat)} for t, sat in passes],
            "count": len(det),
            "withinOnePixelOfFinalPerimeter": inside,
            "within2kmOfFinalPerimeter": within2,
        }

        # --- conditions at the ignition point ---
        c0, c1 = ev["conditions"]
        grid = {}
        for var, ncvar, label, unit in GRIDMET:
            try:
                ser, packing = gridmet_series(var, ncvar, ign["lat"], ign["lon"], c0, c1, eid)
            except ValueError as err:
                ser, packing = [], {}
                gaps.append(f"gridMET {var}: {err}.")
            if ser:
                grid[var] = {"label": label, "units": unit, "dates": [d for d, _ in ser], "values": [v for _, v in ser], **packing}
            elif not any(g.startswith(f"gridMET {var}") for g in gaps):
                gaps.append(f"gridMET {var} could not be retrieved.")
        q = urllib.parse.urlencode({"parameters": "WS10M_MAX,RH2M,T2M_MAX,PRECTOTCORR", "community": "AG", "longitude": f"{ign['lon']:.4f}", "latitude": f"{ign['lat']:.4f}", "start": c0.replace("-", ""), "end": c1.replace("-", ""), "format": "JSON", "time-standard": "UTC"})
        pw = get(f"https://power.larc.nasa.gov/api/temporal/daily/point?{q}", f"{eid}_power.json")
        power = None
        if pw:
            pj = json.loads(pw.read_text(encoding="utf-8"))
            par, fill = pj["properties"]["parameter"], pj["header"]["fill_value"]
            dates = sorted(par["WS10M_MAX"])
            power = {"dates": [f"{d[:4]}-{d[4:6]}-{d[6:]}" for d in dates], **{k: [None if par[k][d] == fill else par[k][d] for d in dates] for k in par}}
        else:
            gaps.append("NASA POWER daily series could not be retrieved.")

        # --- U.S. Drought Monitor, county of origin, map dates around the start ---
        a = (t0 - timedelta(days=21)).strftime("%m/%d/%Y").lstrip("0").replace("/0", "/")
        b = (t0 + timedelta(days=1)).strftime("%m/%d/%Y").lstrip("0").replace("/0", "/")
        du = get(f"https://usdmdataservices.unl.edu/api/CountyStatistics/GetDroughtSeverityStatisticsByAreaPercent?aoi={ev['countyFips']}&startdate={a}&enddate={b}&statisticsType=1", f"{eid}_usdm.json", headers={"Accept": "application/json"})
        drought = None
        if du:
            try:
                rowsd = sorted(({k.lower(): v for k, v in r.items()} for r in json.loads(du.read_text(encoding="utf-8"))), key=lambda r: r["validstart"])
                last = [r for r in rowsd if r["validstart"][:10] <= start[:10]][-1]
                drought = {"county": f"{last['county']}, {last['state']}", "mapDate": last["mapdate"][:10], "validStart": last["validstart"][:10], "validEnd": last["validend"][:10], "percentOfCountyAtOrAbove": {k.upper(): float(last[k]) for k in ("d0", "d1", "d2", "d3", "d4")}, "percentNone": float(last["none"])}
            except (ValueError, KeyError, IndexError):
                gaps.append("U.S. Drought Monitor statistics could not be parsed.")
        else:
            gaps.append("U.S. Drought Monitor statistics could not be retrieved.")

        # --- infrastructure ---
        reach = 0.75
        plants = []
        for rec, (lo, la) in plant_recs:
            if not (w - reach <= lo <= e + reach and s - reach <= la <= n + reach):
                continue
            dk = dist_km(lo, la)
            if dk > 50:
                continue
            g = lambda *names: next((rec[k] for k in names if k in rec and rec[k] not in (None, "")), None)
            plants.append({"id": f"eia-plant-{g('Plant_Code', 'plant_code', 'OBJECTID')}", "name": g("Plant_Name", "plant_name"), "operator": g("Utility_Na", "Utility_Name", "utility_na"), "primarySource": g("PrimSource", "primsource"), "technology": g("tech_desc", "Tech_Desc"), "capacityMw": g("Total_MW", "total_mw"), "lat": round(la, 5), "lon": round(lo, 5), "kmFromPerimeter": round(dk, 2), "inside": dk == 0})
        plants.sort(key=lambda x: (x["kmFromPerimeter"], -(x["capacityMw"] or 0)))

        gas = []
        box = shape({"type": "Polygon", "coordinates": [[[w - 0.3, s - 0.3], [e + 0.3, s - 0.3], [e + 0.3, n + 0.3], [w - 0.3, n + 0.3], [w - 0.3, s - 0.3]]]})
        for rec, shp in gas_shapes:
            bb = shp.bbox
            if bb[2] < w - 0.3 or bb[0] > e + 0.3 or bb[3] < s - 0.3 or bb[1] > n + 0.3:
                continue
            parts = list(shp.parts) + [len(shp.points)]
            lines = [LineString(shp.points[parts[i] : parts[i + 1]]) for i in range(len(parts) - 1) if parts[i + 1] - parts[i] >= 2]
            if not lines:
                continue
            ml = MultiLineString(lines).intersection(box)
            if ml.is_empty:
                continue
            mm = transform(proj, ml)
            dk = gm.distance(mm) / 1000.0
            if dk > 10:
                continue
            d = rec.as_dict()
            gas.append({"operator": d.get("Operator") or d.get("operator"), "type": d.get("TYPEPIPE") or d.get("typepipe"), "kmInside": round(mm.intersection(gm).length / 1000.0, 2), "kmFromPerimeter": round(dk, 2), "geometry": round_geom(json.loads(json.dumps(ml.simplify(0.002).__geo_interface__)), 4)})
        gas_summary: dict[tuple, dict] = {}
        for gline in gas:
            k = (gline["operator"], gline["type"])
            x = gas_summary.setdefault(k, {"operator": k[0], "type": k[1], "kmInside": 0.0, "kmFromPerimeter": 1e9, "segments": 0})
            x["kmInside"] = round(x["kmInside"] + gline["kmInside"], 2)
            x["kmFromPerimeter"] = min(x["kmFromPerimeter"], gline["kmFromPerimeter"])
            x["segments"] += 1

        # Electric transmission: the only authoritative copy still online is an archived layer whose
        # redistribution terms were not verified, so only derived counts are stored, never the lines.
        tx = None
        q = {"where": "1=1", "geometry": f"{w - 0.1},{s - 0.1},{e + 0.1},{n + 0.1}", "geometryType": "esriGeometryEnvelope", "inSR": 4326, "spatialRel": "esriSpatialRelIntersects", "outFields": "OWNER,VOLTAGE,VOLT_CLASS,STATUS", "outSR": 4326, "f": "geojson", "geometryPrecision": 5}
        ptx = get(f"{HIFLD_TX}/query?{urllib.parse.urlencode(q)}", f"{eid}_transmission.geojson")
        if ptx:
            tj = json.loads(ptx.read_text(encoding="utf-8"))
            crossing, km_in, by_class, owners = 0, 0.0, {}, {}
            for f in tj.get("features", []):
                if not f.get("geometry"):
                    continue
                lm = transform(proj, shape(f["geometry"]))
                inter = lm.intersection(gm)
                if inter.is_empty:
                    continue
                crossing += 1
                k_in = inter.length / 1000.0
                km_in += k_in
                vc = f["properties"].get("VOLT_CLASS") or "not stated"
                by_class[vc] = round(by_class.get(vc, 0.0) + k_in, 1)
                ow = f["properties"].get("OWNER") or "not stated"
                owners[ow] = round(owners.get(ow, 0.0) + k_in, 1)
            tx = {"linesInBoundingBox": len(tj.get("features", [])), "linesCrossingPerimeter": crossing, "kmInsidePerimeter": round(km_in, 1), "kmInsideByVoltageClass": dict(sorted(by_class.items(), key=lambda kv: -kv[1])), "kmInsideByOwner": dict(sorted(owners.items(), key=lambda kv: -kv[1])[:8]), "truncated": bool(tj.get("properties", {}).get("exceededTransferLimit") or tj.get("exceededTransferLimit"))}
        else:
            gaps.append("Electric transmission lines could not be retrieved.")

        near = []
        for kind, items in (("refinery", refineries), ("port", ports)):
            for a_ in items:
                if abs(a_["lat"] - lat0) > 3 or abs(a_["lon"] - (w + e) / 2) > 4:
                    continue
                dk = dist_km(a_["lon"], a_["lat"])
                if dk <= 150:
                    near.append({"id": a_["id"], "kind": kind, "name": a_["name"], "operator": a_.get("company"), "capacityBpd": a_.get("capacityBpd"), "kmFromPerimeter": round(dk, 1), "inside": dk == 0})
        near.sort(key=lambda x: x["kmFromPerimeter"])

        # --- documented facts ---
        facts, dropped = verified_facts(eid)
        gaps += dropped
        if eid == "camp-2018":
            dq = urllib.parse.urlencode({"where": "INCIDENTNAME='Camp'", "groupByFieldsForStatistics": "DAMAGE", "outStatistics": json.dumps([{"statisticType": "count", "onStatisticField": "OBJECTID", "outStatisticFieldName": "n"}]), "f": "json"})
            dp = get(f"https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/POSTFIRE_MASTER_DATA_SHARE/FeatureServer/0/query?{dq}", f"{eid}_dins_counts.json")
            if dp:
                counts = {f["attributes"]["DAMAGE"]: f["attributes"]["n"] for f in json.loads(dp.read_text(encoding="utf-8")).get("features", [])}
                if counts.get("Destroyed (>50%)"):
                    facts.append({"label": "Structures inspected as destroyed", "value": f"{counts['Destroyed (>50%)']:,}", "quote": None, "source": "CAL FIRE Damage Inspection (DINS) database, count of records with DAMAGE = 'Destroyed (>50%)' for the Camp incident", "url": "https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/POSTFIRE_MASTER_DATA_SHARE/FeatureServer/0", "evidence": "OBSERVED", "counts": counts})
            else:
                gaps.append("CAL FIRE damage inspection counts could not be retrieved.")
            pop = {}
            for vintage, layer in (("2010", "tigerWMS_Census2010/MapServer/34"), ("2020", "tigerWMS_Census2020/MapServer/26")):
                tq = urllib.parse.urlencode({"where": "GEOID='0655520'", "outFields": "NAME,GEOID,POP100,HU100", "returnGeometry": "false", "f": "json"})  # Paradise town, California
                tp = get(f"https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/{layer}/query?{tq}", f"{eid}_tigerweb_place_{vintage}.json")
                if tp:
                    fs = json.loads(tp.read_text(encoding="utf-8")).get("features", [])
                    if len(fs) == 1:
                        pop[vintage] = fs[0]["attributes"]
            if len(pop) == 2:
                facts.append({"label": "Population of the Town of Paradise", "value": f"{int(pop['2010']['POP100']):,} in the 2010 Census; {int(pop['2020']['POP100']):,} in the 2020 Census", "quote": None, "source": "U.S. Census Bureau, TIGERweb (decennial census counts for incorporated places)", "url": "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Census2020/MapServer/26", "evidence": "OBSERVED", "note": "The 2010 count is eight years before the fire and the 2020 count seventeen months after it. The change is not attributed here to any single cause."})
            else:
                gaps.append("Census counts for Paradise could not be retrieved.")
            gaps.append("CAL FIRE's incident page (cause and fatalities) and the Butte County District Attorney's report refuse automated requests, so no saved copy exists to check quotes against; the cause of the Camp Fire is therefore not stated here.")
        if eid == "marshall-2021":
            facts.append({"label": "Cause on the interagency record", "value": str(cause), "quote": None, "source": "NIFC WFIGS perimeter record, field attr_FireCause", "url": fc["_url"], "evidence": "OBSERVED", "note": "Later findings by local authorities were not retrieved from a primary source and are not stated here."})

        doc = {
            "meta": {
                "id": eid,
                "name": ev["name"],
                "place": ev["place"],
                "year": ev["year"],
                "builtAt": built,
                "builtBy": "research/scripts/build_wildfires.py",
                "evidence": "OBSERVED perimeters and satellite detections; gridded conditions; documented facts. No fire spread is simulated.",
                "start": start,
                "contained": contained,
                "ignition": ign,
                "causeOnRecord": cause,
                "admin": admin,
                "gaps": gaps,
                "sources": {
                    "perimeter": {"provider": "National Interagency Fire Center (NIFC) Open Data", "dataset": pc["service"], "sourceUrl": fc["_url"], "landingPage": "https://data-nifc.opendata.arcgis.com/", "retrievedAt": retrieved(f"{eid}_perimeter.geojson"), "license": "U.S. Government interagency data; provided without warranty", "caveat": "Simplified by the server to about %d m for display. NIFC: perimeters are 'not better than the original sources from which they were derived'." % round(pc["offset"] * 111_000)},
                    "progression": prog_meta,
                    "detections": {"provider": "NASA FIRMS (LANCE), VIIRS 375 m active fire product", "dataset": "Yearly country archive, United States", "landingPage": "https://firms.modaps.eosdis.nasa.gov/country/", "files": firms_files, "license": "NASA open data; cite FIRMS", "caveat": "FIRMS: each detection 'represents the center of a pixel flagged as containing one or more fires'; 'the location is the center point of the pixel (not necessarily the coordinates of the actual fire)'. Smoke, cloud and the gaps between overpasses hide fire."},
                    "gridmet": {"provider": "Climatology Lab, University of California Merced (gridMET; Abatzoglou 2013)", "dataset": "Daily 4-km surface meteorology and fire danger indices, point series at the ignition point", "landingPage": "https://www.climatologylab.org/gridmet.html", "sourceUrl": "https://thredds.northwestknowledge.net/thredds/ncss/MET/erc/erc_%d.nc" % ev["year"], "retrievedAt": retrieved(f"gridmet_{eid}_erc_{ev['year']}.nc"), "license": "Copyright waived by the author (public domain dedication)", "caveat": "A gridded estimate, not a station observation. gridMET: wind fields 'are interpolated from NARR/NLDAS-2 which has a 32-km spatial resolution. This will be insufficient for capturing mesoscale influences of terrain on wind fields.'"},
                    "power": {"provider": "NASA Langley Research Center, POWER project (MERRA-2)", "dataset": "Daily point data: WS10M_MAX, RH2M, T2M_MAX, PRECTOTCORR", "landingPage": "https://power.larc.nasa.gov/", "retrievedAt": retrieved(f"{eid}_power.json"), "license": "NASA open data", "caveat": "About half a degree of latitude by five eighths of a degree of longitude: a regional value, not conditions at the fire front."},
                    "drought": {"provider": "U.S. Drought Monitor (NDMC, USDA, NOAA, NASA)", "dataset": "County statistics by area percent", "landingPage": "https://droughtmonitor.unl.edu", "retrievedAt": retrieved(f"{eid}_usdm.json"), "license": "Authorized for use with attribution: 'The U.S. Drought Monitor is jointly produced by the National Drought Mitigation Center at the University of Nebraska-Lincoln, the U.S. Department of Agriculture, the National Oceanic and Atmospheric Administration and NASA. Data courtesy of NDMC.'"},
                    "plants": {"provider": "U.S. Energy Information Administration (EIA)", "dataset": "Power plants (map layer shapefile)", "sourceUrl": "https://www.eia.gov/maps/map_data/PowerPlants_US_EIA.zip", "landingPage": "https://www.eia.gov/maps/layer_info-m.php", "retrievedAt": eia["plants"]["retrievedAt"], "sha256": eia["plants"]["sha256"], "license": "U.S. Government work, public domain"},
                    "gasPipelines": {"provider": "U.S. Energy Information Administration (EIA)", "dataset": "Natural gas interstate and intrastate pipelines (map layer shapefile)", "sourceUrl": "https://www.eia.gov/maps/map_data/NaturalGas_InterIntrastate_Pipelines_US_EIA.zip", "landingPage": "https://www.eia.gov/maps/layer_info-m.php", "retrievedAt": eia["gas"]["retrievedAt"], "sha256": eia["gas"]["sha256"], "license": "U.S. Government work, public domain", "caveat": "A schematic national layer: positions are approximate."},
                    "transmission": {"provider": "Homeland Infrastructure Foundation-Level Data (HIFLD), archived copy", "dataset": "U.S. Electric Power Transmission Lines (Archive), last data update 30 September 2024", "sourceUrl": HIFLD_TX, "retrievedAt": retrieved(f"{eid}_transmission.geojson"), "license": "Redistribution terms of the archived copy were not verified; only derived counts and lengths are stored, not the lines", "caveat": "The layer describes the grid as of its last update, not on the day of the fire."},
                },
            },
            "perimeter": {
                "geometry": round_geom(feat["geometry"], 4),
                "bbox": [round(w, 4), round(s, 4), round(e, 4), round(n, 4)],
                "reportedAcres": round(reported_acres, 1),
                "areaOfDisplayedShapeAcres": round(area_km2 * ACRES_PER_KM2, 0),
                "areaKm2": round(area_km2, 1),
                "mapped": mapped,
            },
            "progression": progression,
            "detections": detections,
            "conditions": {"point": ign, "gridmet": grid, "power": power, "drought": drought},
            "infrastructure": {"powerPlants": plants, "gasPipelines": gas, "gasPipelineSummary": sorted(gas_summary.values(), key=lambda x: (-x["kmInside"], x["kmFromPerimeter"])), "transmission": tx, "refineriesAndPorts": near},
            "facts": facts,
        }
        (OUT / f"{eid}.json").write_text(json.dumps(doc, separators=(",", ":")), encoding="utf-8")
        size = (OUT / f"{eid}.json").stat().st_size
        index.append({"id": eid, "name": ev["name"], "place": ev["place"], "year": ev["year"], "start": start, "contained": contained, "reportedAcres": round(reported_acres, 1), "bbox": doc["perimeter"]["bbox"], "detections": len(det), "datedPerimeters": len(progression), "file": f"{eid}.json", "bytes": size})
        print(f"  acres reported {reported_acres:,.0f} | displayed shape {area_km2 * ACRES_PER_KM2:,.0f} | start {start} | ignition {ign}")
        print(f"  detections {len(det)} ({inside} within one pixel, {within2} within 2 km of the final perimeter) in {len(passes)} overpasses | dated perimeters {len(progression)}")
        print(f"  plants within 50 km {len(plants)} (inside {sum(1 for x in plants if x['inside'])}) | gas segments within 10 km {len(gas)} | transmission {tx and (tx['linesCrossingPerimeter'], tx['kmInsidePerimeter'], tx['truncated'])} | refineries/ports within 150 km {len(near)}")
        print(f"  facts {len(facts)} | gaps {len(gaps)} | drought {drought and drought['percentOfCountyAtOrAbove']} | {size:,} bytes")
        for g_ in gaps:
            print("   gap:", g_)

    (OUT / "index.json").write_text(json.dumps({"meta": {"builtAt": built, "builtBy": "research/scripts/build_wildfires.py", "note": "Historical fires with observed perimeters and satellite detections. No fire spread is simulated and nothing here forecasts a fire."}, "events": index}, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
