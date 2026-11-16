"""Build public/data/hindcast/best_tracks.json from the NHC Atlantic HURDAT2 best-track file.

Only Hurricane Harvey (AL092017) and Hurricane Ike (AL092008) are extracted. Every value is read
from the downloaded file in research/raw/hurdat2/; nothing is typed in by hand.

Download (done once, by hand, with a generic User-Agent):
  https://www.nhc.noaa.gov/data/  ->  "Best Track Data (HURDAT2)"
  curl -L -A "Mozilla/5.0 (research-client)" -o research/raw/hurdat2/<file>.txt <file URL>
  date -u +%Y-%m-%dT%H:%M:%SZ > research/raw/hurdat2/retrieved.txt

Format: "The revised Atlantic hurricane database (HURDAT2)", Chris Landsea, April 2022
  https://www.nhc.noaa.gov/data/hurdat/hurdat2-format-atl-1851-2021.pdf
  Header line:  AL092021, IDA, 40,          (basin+number+year, name, number of data rows)
  Data line, comma separated, 21 fields:
    0 date YYYYMMDD   1 time HHMM (UTC)   2 record identifier (L = landfall, ...)   3 status
    4 latitude + N/S  5 longitude + W/E   6 max sustained wind (kt)   7 min pressure (mb)
    8-11  34-kt wind radii, maximum extent in the NE, SE, SW, NW quadrant (nautical miles)
    12-15 50-kt wind radii NE, SE, SW, NW      16-19 64-kt wind radii NE, SE, SW, NW
    20 radius of maximum wind (nm; best tracked only from 2021)
  Missing values: -999 (radii, pressure, RMW) and -99 (wind). A radius of 0 is NOT missing: it
  means that wind speed is not reached in that quadrant. Missing -> null here; 0 stays 0.

Run: python -I research/scripts/build_best_tracks.py
"""
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW_DIR = os.path.join(ROOT, "research", "raw", "hurdat2")
RAW_NAME = "hurdat2-1851-2025-092326.txt"
SOURCE_URL = "https://www.nhc.noaa.gov/data/hurdat/" + RAW_NAME
FORMAT_DOC = "https://www.nhc.noaa.gov/data/hurdat/hurdat2-format-atl-1851-2021.pdf"
OUT = os.path.join(ROOT, "public", "data", "hindcast", "best_tracks.json")
WANTED = ["AL092017", "AL092008"]


def missing(v, codes=(-999, -99)):
    return None if v in codes else v


def parse_latlon(s):
    s = s.strip()
    val, hemi = float(s[:-1]), s[-1]
    if hemi not in "NSEW":
        raise ValueError("bad hemisphere in %r" % s)
    return -val if hemi in "SW" else val


def parse_fix(line):
    f = [x.strip() for x in line.rstrip("\n").split(",")]
    if len(f) < 21:
        raise ValueError("expected 21 fields, got %d: %r" % (len(f), line))
    d, t = f[0], f[1]
    if len(d) != 8 or len(t) != 4:
        raise ValueError("bad date/time: %r" % line)
    n = [int(x) for x in f[6:21]]

    def quad(i):
        return {"ne": missing(n[i]), "se": missing(n[i + 1]), "sw": missing(n[i + 2]), "nw": missing(n[i + 3])}

    return {
        "time": "%s-%s-%sT%s:%s:00Z" % (d[0:4], d[4:6], d[6:8], t[0:2], t[2:4]),
        "recordId": f[2],
        "status": f[3],
        "lat": parse_latlon(f[4]),
        "lon": parse_latlon(f[5]),
        "vmaxKt": missing(n[0]),
        "pressureMb": missing(n[1]),
        "r34": quad(2),
        "r50": quad(6),
        "r64": quad(10),
        "rmwNm": missing(n[14]),
    }


def main():
    raw_path = os.path.join(RAW_DIR, RAW_NAME)
    retrieved = open(os.path.join(RAW_DIR, "retrieved.txt"), encoding="utf-8").read().strip()
    blob = open(raw_path, "rb").read()
    lines = blob.decode("ascii").splitlines()

    storms = {}
    i = 0
    while i < len(lines):
        head = [x.strip() for x in lines[i].split(",")]
        if not (len(head) >= 3 and head[0][:2] == "AL" and len(head[0]) == 8):
            raise ValueError("line %d is not a header: %r" % (i + 1, lines[i]))
        sid, name, count = head[0], head[1], int(head[2])
        if sid in WANTED:
            fixes = [parse_fix(l) for l in lines[i + 1 : i + 1 + count]]
            if len(fixes) != count:
                raise ValueError("%s: header says %d rows, found %d" % (sid, count, len(fixes)))
            times = [f["time"] for f in fixes]
            if times != sorted(times) or len(set(times)) != len(times):
                raise ValueError("%s: fix times are not strictly increasing" % sid)
            storms[sid] = {"id": sid, "name": name, "year": int(sid[4:8]), "fixes": fixes}
        i += 1 + count

    absent = [s for s in WANTED if s not in storms]
    if absent:
        raise SystemExit("not found in %s: %s" % (RAW_NAME, absent))

    out = {
        "meta": {
            "provider": "NOAA National Hurricane Center (NHC)",
            "dataset": "Atlantic hurricane database (HURDAT2) 1851-2025, best-track records for AL092017 (Harvey) and AL092008 (Ike) only",
            "sourceUrl": SOURCE_URL,
            "landingPage": "https://www.nhc.noaa.gov/data/#hurdat",
            "formatDoc": FORMAT_DOC,
            "retrievedAt": retrieved,
            "sourceSha256": hashlib.sha256(blob).hexdigest(),
            "license": "U.S. Government work, public domain",
            "units": "lat/lon in decimal degrees (north and east positive); vmaxKt = maximum 1-minute sustained wind in knots; pressureMb in millibars; r34/r50/r64 and rmwNm in nautical miles",
            "notes": (
                "Extracted unchanged by research/scripts/build_best_tracks.py. r34/r50/r64 are the HURDAT2 "
                "'wind radii maximum extent' in the NE, SE, SW and NW quadrants. A radius of 0 means that wind "
                "speed is not reached in that quadrant; null means missing in the source (-999; -99 for wind). "
                "rmwNm (radius of maximum wind) is routinely best tracked only from 2021, so it is null for almost "
                "every fix here. recordId 'L' marks a landfall fix; other fixes have ''. Fixes are 6-hourly plus "
                "asynoptic landfall records. The file covers each system's whole life, including the wave, low and "
                "extratropical stages (see 'status')."
            ),
        },
        "storms": [storms[s] for s in WANTED],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(out, fh, indent=1)
        fh.write("\n")

    for s in out["storms"]:
        land = [(f["time"], f["vmaxKt"], f["lat"], f["lon"]) for f in s["fixes"] if f["recordId"] == "L"]
        nulls = sum(1 for f in s["fixes"] for k in ("r34", "r50", "r64") for q in f[k].values() if q is None)
        rmw = [(f["time"], f["rmwNm"]) for f in s["fixes"] if f["rmwNm"] is not None]
        print(s["id"], s["name"], len(s["fixes"]), "fixes; landfalls:", land, "; null radii:", nulls, "; rmw:", rmw)
    print("wrote", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    sys.exit(main())
