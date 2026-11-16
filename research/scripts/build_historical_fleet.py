"""Build public/data/hindcast/refineries_<year>.json: the U.S. refinery fleet as EIA reported it on
1 January of a past year, for hindcasts against storms of that year.

Capacity and names: EIA Refinery Capacity Report workbook for that year (Form EIA-820),
  https://www.eia.gov/petroleum/refinerycapacity/archive/<year>/refcap<yy>.xls
Coordinates: EIA shapefile Petroleum_Refineries_US_EIA.zip (as of 1 January 2021), joined by
  state + site (+ company or corporation), exactly as build_refineries.py does for the current fleet.

A refinery that had closed or merged before 2021 has no point in the 2021 layer. It is listed under
`unmatchedNoCoordinates` with its capacity and is NOT given a guessed position.

Ids follow build_refineries.py ("eia-<shapefile site id>-<state>-<site>"), so a site present in both
the historical and the current file has the same id in both.

Run: research/venv/Scripts/python.exe -I research/scripts/build_historical_fleet.py 2017
     (needs research/raw/eia_refcap/refcap17.xls and research/raw/eia_refineries_zip/)
"""
import collections
import hashlib
import json
import os
import re
import sys

import shapefile
import xlrd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "research", "raw")
year = int(sys.argv[1])
yy = "%02d" % (year % 100)
SRC = os.path.join(RAW, "eia_refcap", "refcap%s.xls" % yy)
OUT = os.path.join(ROOT, "public", "data", "hindcast", "refineries_%d.json" % year)

CAP_PRODUCT = "TOTAL OPERABLE CAPACITY"
CAP_SUPPLY = "Atmospheric Crude Distillation Capacity (barrels per calendar day)"


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


def nsite(s):
    return norm(s).replace(" ", "")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


wb = xlrd.open_workbook(SRC)
sh = wb.sheet_by_index(0)
hdr = [str(h).strip() for h in sh.row_values(0)]
rows = [dict(zip(hdr, sh.row_values(i))) for i in range(1, sh.nrows)]
for r in rows:
    for k, v in r.items():
        if isinstance(v, str):
            r[k] = v.strip()
assert {str(r["PERIOD"]).split(".")[0].zfill(2) for r in rows} == {yy}, {r["PERIOD"] for r in rows}
assert {str(r["SURVEY"]).split(".")[0] for r in rows} == {"820"}
supplies = {r["SUPPLY"] for r in rows}
assert CAP_SUPPLY in supplies, sorted(supplies)

sites = collections.OrderedDict()
for r in rows:
    key = (r["STATE_NAME"], r["SITE"], r["COMPANY_NAME"])
    s = sites.setdefault(key, {"row": r, "cap": None})
    if r["PRODUCT"] == CAP_PRODUCT and r["SUPPLY"] == CAP_SUPPLY:
        assert s["cap"] is None, key
        s["cap"] = int(round(float(r["QUANTITY"])))

sf = shapefile.Reader(os.path.join(RAW, "eia_refineries_zip", "Petroleum_Refineries_US_2021.shp"))
old = [rec.as_dict() for rec in sf.records()]
assert {o["Period_"] for o in old} == {"As of Jan. 1 2021"}
for o, shp in zip(old, sf.shapes()):
    assert abs(shp.points[0][0] - o["Longitude"]) < 1e-3 and abs(shp.points[0][1] - o["Latitude"]) < 1e-3, o
    o["_used"] = False

matches = {}
idx = collections.defaultdict(list)
for o in old:
    idx[(norm(o["State"]), nsite(o["Site"]), norm(o["Company"]))].append(o)
for key in sites:
    k = (norm(key[0]), nsite(key[1]), norm(key[2]))
    if len(idx[k]) == 1 and not idx[k][0]["_used"]:
        matches[key] = (idx[k][0], "state+site+company")
        idx[k][0]["_used"] = True
for label, fo, fn in (
    ("state+site+corporation", lambda o: (norm(o["State"]), nsite(o["Site"]), norm(o["Corp"])), lambda key: (norm(key[0]), nsite(key[1]), norm(sites[key]["row"]["CORPORATION"]))),
    ("state+site", lambda o: (norm(o["State"]), nsite(o["Site"])), lambda key: (norm(key[0]), nsite(key[1]))),
):
    io = collections.defaultdict(list)
    for o in old:
        if not o["_used"]:
            io[fo(o)].append(o)
    inew = collections.defaultdict(list)
    for key in sites:
        if key not in matches:
            inew[fn(key)].append(key)
    for k, keys in inew.items():
        if len(keys) == 1 and len(io.get(k, [])) == 1:
            matches[keys[0]] = (io[k][0], label)
            io[k][0]["_used"] = True

# A report entry that the 2021 layer splits into several plants of the same owner in the same city
# (site name + a suffix such as "East" / "West"): keep every plant's point; the first is the largest.
multi = {}
for key in sites:
    if key in matches:
        continue
    corp = norm(sites[key]["row"]["CORPORATION"])
    cands = [o for o in old if not o["_used"] and norm(o["State"]) == norm(key[0]) and norm(o["Corp"]) == corp and nsite(o["Site"]).startswith(nsite(key[1])) and nsite(o["Site"]) != nsite(key[1])]
    if len(cands) >= 2:
        cands.sort(key=lambda o: -float(o.get("AD_Mbpd") or 0))
        multi[key] = cands
        matches[key] = (cands[0], "state+site-prefix+corporation (%d plants)" % len(cands))
        for o in cands:
            o["_used"] = True

facilities, unmatched, seen = [], [], set()
for key, s in sites.items():
    r = s["row"]
    base = {
        "name": r["SITE"],
        "company": r["COMPANY_NAME"],
        "corporation": r["CORPORATION"],
        "state": r["STATE_NAME"],
        "padd": int(float(r["PADD"])),
        "refiningDistrict": r["RDIST_LABEL"],
        "capacityBpd": s["cap"],
    }
    if key not in matches:
        unmatched.append(base)
        continue
    o, how = matches[key]
    fid = "eia-%d-%s-%s" % (o["site_id"], slug(r["STATE_NAME"]), slug(r["SITE"]))
    assert fid not in seen, fid
    seen.add(fid)
    fac = {"id": fid}
    fac.update(base)
    fac.update({"lat": o["Latitude"], "lon": o["Longitude"], "eiaSiteId": o["site_id"], "coordMatch": how, "coordSourceCompany": o["Company"], "coordSourceSite": o["Site"]})
    if key in multi:
        fac["plants"] = [{"lat": m["Latitude"], "lon": m["Longitude"], "eiaSiteId": m["site_id"], "site": m["Site"]} for m in multi[key]]
    facilities.append(fac)

retrieved = open(os.path.join(RAW, "eia_refcap", "retrieved.txt"), encoding="utf-8").read().strip()
out = {
    "meta": {
        "provider": "U.S. Energy Information Administration (EIA)",
        "dataset": "Refinery Capacity Report (Form EIA-820), refinery capacity by individual refinery as of January 1, %d; coordinates from the EIA map layer \"U.S. Petroleum Refineries\" (as of January 1, 2021)" % year,
        "sourceUrl": "https://www.eia.gov/petroleum/refinerycapacity/archive/%d/refcap%s.xls" % (year, yy),
        "coordinatesSourceUrl": "https://www.eia.gov/maps/map_data/Petroleum_Refineries_US_EIA.zip",
        "landingPage": "https://www.eia.gov/petroleum/refinerycapacity/archive/%d/refcap%d.php" % (year, year),
        "retrievedAt": retrieved,
        "sourceSha256": hashlib.sha256(open(SRC, "rb").read()).hexdigest(),
        "dataAsOf": "%d-01-01" % year,
        "coordinatesDataAsOf": "2021-01-01",
        "capacityField": "QUANTITY where PRODUCT = 'TOTAL OPERABLE CAPACITY' and SUPPLY = '%s'" % CAP_SUPPLY,
        "capacityUnits": "barrels per calendar day",
        "license": "U.S. Government work, public domain (https://www.eia.gov/about/copyrights_reuse.php)",
        "notes": "Built by research/scripts/build_historical_fleet.py. Names, owners and capacities are those of January 1, %d. Positions come from the 2021 EIA layer, joined by state + site (+ company or corporation); 'coordMatch' records which key matched. A refinery that closed or merged before 2021 has no position and is listed in 'unmatchedNoCoordinates'; it is not placed by guesswork. capacityBpd is null where the workbook has no total operable capacity row." % year,
        "counts": {"sitesInReport": len(sites), "facilitiesWithCoordinates": len(facilities), "unmatchedNoCoordinates": len(unmatched)},
        "totalCapacityBpd": sum(s["cap"] or 0 for s in sites.values()),
        "unmatchedNoCoordinates": unmatched,
    },
    "facilities": facilities,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1)

print("year", year, "sites", len(sites), "matched", len(facilities), "unmatched", len(unmatched), "total b/cd", out["meta"]["totalCapacityBpd"])
print(collections.Counter(f["coordMatch"] for f in facilities))
print("UNMATCHED:")
for u in unmatched:
    print("  ", u["company"], "|", u["name"], "|", u["state"], "|", u["refiningDistrict"], "|", u["capacityBpd"])
print("NON-COMPANY MATCHES (PADD 3):")
for f in facilities:
    if f["coordMatch"] != "state+site+company" and f["padd"] == 3:
        print("  ", f["company"], "|", f["name"], f["state"], f["capacityBpd"], "<-", f["coordSourceCompany"], "|", f["coordSourceSite"], "|", f["coordMatch"])
