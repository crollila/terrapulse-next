"""Build public/data/infrastructure/refineries.json.

Attributes + capacity: EIA Refinery Capacity Report workbook refcap26.xlsx (Form EIA-820, as of January 1, 2026).
Coordinates: EIA shapefile Petroleum_Refineries_US_EIA.zip (as of January 1, 2021), joined by state + site (+ company).
No value is typed by hand; everything is read from research/raw/.
Run: research/venv/Scripts/python -I research/scripts/build_refineries.py <retrievedAtISO>
"""
import collections
import json
import os
import re
import sys

import openpyxl
import shapefile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "research", "raw")
OUT = os.path.join(ROOT, "public", "data", "infrastructure", "refineries.json")
retrieved = sys.argv[1]

CAP_PRODUCT = "TOTAL OPERABLE CAPACITY"
CAP_SUPPLY = "Atmospheric Crude Distillation Capacity (barrels per calendar day)"


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


def nsite(s):
    # site names compared ignoring spaces/punctuation (e.g. "New Castle" vs "NEWCASTLE")
    return norm(s).replace(" ", "")


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", str(s).lower()).strip("-")


# ---- capacity workbook (2026) ----
wb = openpyxl.load_workbook(os.path.join(RAW, "facts", "refcap26.xlsx"), read_only=True)
rows = list(wb["refcap26"].iter_rows(values_only=True))
hdr = rows[0]
rows = [dict(zip(hdr, r)) for r in rows[1:]]
assert {r["PERIOD"] for r in rows} == {"26"} and {r["SURVEY"] for r in rows} == {"820"}
sites = collections.OrderedDict()
for r in rows:
    key = (r["STATE_NAME"], r["SITE"], r["COMPANY_NAME"])
    s = sites.setdefault(key, {"row": r, "cap": None})
    if r["PRODUCT"] == CAP_PRODUCT and r["SUPPLY"] == CAP_SUPPLY:
        assert s["cap"] is None, key
        s["cap"] = r["QUANTITY"]

# ---- coordinates shapefile (2021) ----
sf = shapefile.Reader(os.path.join(RAW, "eia_refineries_zip", "Petroleum_Refineries_US_2021.shp"))
old = [rec.as_dict() for rec in sf.records()]
assert {o["Period_"] for o in old} == {"As of Jan. 1 2021"}, {o["Period_"] for o in old}
for o, shp in zip(old, sf.shapes()):
    # attribute lat/lon must agree with point geometry
    assert abs(shp.points[0][0] - o["Longitude"]) < 1e-3 and abs(shp.points[0][1] - o["Latitude"]) < 1e-3, o
    o["_used"] = False

matches = {}
# pass 1: state + site + company
idx = collections.defaultdict(list)
for o in old:
    idx[(norm(o["State"]), nsite(o["Site"]), norm(o["Company"]))].append(o)
for key in sites:
    k = (norm(key[0]), nsite(key[1]), norm(key[2]))
    if len(idx[k]) == 1 and not idx[k][0]["_used"]:
        matches[key] = (idx[k][0], "state+site+company")
        idx[k][0]["_used"] = True
# pass 2: state + site + corporation, unique among the remaining on both sides
# pass 3: state + site, unique among the remaining on both sides
for label, fo, fn in (
    ("state+site+corporation", lambda o: (norm(o["State"]), nsite(o["Site"]), norm(o["Corp"])),
     lambda key: (norm(key[0]), nsite(key[1]), norm(sites[key]["row"]["CORPORATION"]))),
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

facilities, unmatched = [], []
seen_ids = set()
for key, s in sites.items():
    r = s["row"]
    base = {
        "name": r["SITE"],
        "company": r["COMPANY_NAME"],
        "corporation": r["CORPORATION"],
        "city": r["SITE"],
        "state": r["STATE_NAME"],
        "padd": int(r["PADD"]),
        "refiningDistrict": r["RDIST_LABEL"],
        "capacityBpd": s["cap"],
    }
    if key not in matches:
        unmatched.append(base)
        continue
    o, how = matches[key]
    fid = "eia-%d-%s-%s" % (o["site_id"], slug(r["STATE_NAME"]), slug(r["SITE"]))
    assert fid not in seen_ids
    seen_ids.add(fid)
    fac = {"id": fid}
    fac.update(base)
    fac.update({
        "lat": o["Latitude"],
        "lon": o["Longitude"],
        "eiaSiteId": o["site_id"],
        "coordMatch": how,
        "coordSourceCompany": o["Company"],
        "coordSourceSite": o["Site"],
    })
    facilities.append(fac)

not_in_2026 = [
    {"company": o["Company"], "corporation": o["Corp"], "site": o["Site"], "state": o["State"]}
    for o in old if not o["_used"]
]

out = {
    "meta": {
        "provider": "U.S. Energy Information Administration (EIA)",
        "dataset": "Refinery Capacity Report (Form EIA-820, \"Annual Refinery Report\"), refinery capacity data by individual refinery as of January 1, 2026; coordinates from EIA map layer \"U.S. Petroleum Refineries\" (Petroleum_Refineries_US_2021 shapefile)",
        "sourceUrl": "https://www.eia.gov/petroleum/refinerycapacity/refcap26.xlsx",
        "coordinatesSourceUrl": "https://www.eia.gov/maps/map_data/Petroleum_Refineries_US_EIA.zip",
        "landingPage": "https://www.eia.gov/petroleum/refinerycapacity/",
        "retrievedAt": retrieved,
        "dataAsOf": "2026-01-01",
        "reportReleaseDate": "2026-06-26",
        "coordinatesDataAsOf": "2021-01-01",
        "capacityField": "QUANTITY where PRODUCT = 'TOTAL OPERABLE CAPACITY' and SUPPLY = 'Atmospheric Crude Distillation Capacity (barrels per calendar day)'",
        "capacityUnits": "barrels per calendar day",
        "license": "Public domain. EIA: \"U.S. government publications are in the public domain and are not subject to copyright protection.\" (https://www.eia.gov/about/copyrights_reuse.php). Shapefile metadata use constraint: \"None (public use)\"; \"The U.S. Energy Information Administration gives no warranty, expressed or implied, as to the accuracy, reliability, or completeness of these data.\"",
        "notes": (
            "The EIA U.S. Energy Atlas ArcGIS layer Petroleum_Refineries_US_EIA "
            "(https://services7.arcgis.com/FGr1D95XCGALKXqM/arcgis/rest/services/Petroleum_Refineries_US_EIA/FeatureServer) "
            "returned 'Token Required' at retrieval time, so it could not be used. Instead: name/company/corporation/state/PADD/capacity "
            "come from the EIA Refinery Capacity Report workbook (as of January 1, 2026); lat/lon come from the EIA shapefile published on "
            "eia.gov (as of January 1, 2021; its own capacity fields are in barrels per STREAM day and are NOT used). The two EIA files were "
            "joined by state + site (+ company or corporation), comparing names case-insensitively and ignoring spaces/punctuation; 'coordMatch' records which key matched and 'coordSourceCompany' the 2021 "
            "company name, so ownership/name changes are visible. 'name' and 'city' are both the EIA SITE field (EIA names sites by city). "
            "capacityBpd is null where the workbook has no TOTAL OPERABLE CAPACITY row for the site (sites with downstream units only). "
            "Refineries in the 2026 report with no unambiguous 2021 coordinate match are listed in 'unmatchedNoCoordinates' and are NOT in "
            "'facilities'. 2021 shapefile sites absent from the 2026 report are listed in 'inCoordinateFileButNotIn2026Report'."
        ),
        "counts": {
            "sitesIn2026Report": len(sites),
            "facilitiesWithCoordinates": len(facilities),
            "unmatchedNoCoordinates": len(unmatched),
            "sitesIn2021Shapefile": len(old),
        },
        "unmatchedNoCoordinates": unmatched,
        "inCoordinateFileButNotIn2026Report": not_in_2026,
    },
    "facilities": facilities,
}
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1)

print("sites2026", len(sites), "matched", len(facilities), "unmatched", len(unmatched), "old-unused", len(not_in_2026))
print(collections.Counter(f["coordMatch"] for f in facilities))
print("cap nulls:", [(f["company"], f["name"]) for f in facilities if f["capacityBpd"] is None])
print("UNMATCHED:")
for u in unmatched:
    print("  ", u["company"], "|", u["corporation"], "|", u["name"], "|", u["state"], "|", u["capacityBpd"])
print("OLD NOT IN 2026:")
for o in not_in_2026:
    print("  ", o)
print("NON-COMPANY MATCHES:")
for f in facilities:
    if f["coordMatch"] != "state+site+company":
        print("  ", f["company"], "|", f["name"], f["state"], "<-", f["coordSourceCompany"], "|", f["coordSourceSite"], "|", f["coordMatch"])
