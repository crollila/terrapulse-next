"""Build public/data/infrastructure/ports.json from the USACE / BTS NTAD "Principal Ports" layer.

Reads research/raw/ports_query.json (saved response of the query URL below). Nothing typed by hand.
Run: python -I research/scripts/build_ports.py
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "research", "raw")
OUT = os.path.join(ROOT, "public", "data", "infrastructure", "ports.json")

QUERY = ("https://services7.arcgis.com/n1YM8pTrFmm7L4hs/ArcGIS/rest/services/Principal_Ports/FeatureServer/0/query"
         "?where=1%3D1&outFields=*&returnGeometry=false&returnCentroid=true&outSR=4326&f=json")
retrieved = open(os.path.join(RAW, "ports_query.retrieved.txt")).read().strip()
d = json.load(open(os.path.join(RAW, "ports_query.json"), encoding="utf-8"))
layer = json.load(open(os.path.join(RAW, "ports_layer.json"), encoding="utf-8"))
assert d["spatialReference"]["wkid"] == 4326 and not d.get("exceededTransferLimit")
desc = layer["description"]
m = re.search(r"for CY (\d{4})", desc)
year = int(m.group(1))

ports = []
for f in d["features"]:
    a, c = f["attributes"], f["centroid"]
    name = a["PORTNAME"]
    # state codes are parsed from the source port name (e.g. "Galveston, TX"; "Duluth-Superior, MN and WI"; "Coos Bay OR, Port of")
    states = re.findall(r"\b[A-Z]{2}\b", name)
    ports.append({
        "id": "usace-%d" % int(a["PORT"]),
        "name": name,
        "state": states[0] if len(states) == 1 else None,
        "states": states,
        "type": a["TYPE"],
        "lat": round(c["y"], 6),
        "lon": round(c["x"], 6),
        "totalTons": a["TOTAL"],
        "domesticTons": a["DOMESTIC"],
        "foreignTons": a["FOREIGN_"],
        "importTons": a["IMPORTS"],
        "exportTons": a["EXPORTS"],
        "rank": int(a["RANK"]) if a["RANK"] is not None else None,
        "year": year,
    })
ports.sort(key=lambda p: (p["rank"] is None, p["rank"]))
assert len({p["id"] for p in ports}) == len(ports)

out = {
    "meta": {
        "provider": "U.S. Army Corps of Engineers (USACE), Waterborne Commerce Statistics Center; distributed in the USDOT Bureau of Transportation Statistics (BTS) National Transportation Atlas Database (NTAD)",
        "dataset": "Principal Ports",
        "sourceUrl": QUERY,
        "landingPage": "https://www.arcgis.com/home/item.html?id=e3b6065cce144be8a13a59e03c4195fe",
        "dataDictionary": "https://doi.org/10.21949/1529073",
        "retrievedAt": retrieved,
        "dataAsOf": "CY %d" % year,
        "layerDescription": desc,
        "tonnageField": "TOTAL",
        "tonnageUnits": "short tons",
        "license": "\"This data set is publicly available without any use restrictions; however, this data set was developed for use at a national scale and may not be appropriate for use in local scale mapping.\" Requested credit: \"Acknowledgment of the U.S. Army Corps of Engineers (USACE)/Navigation and Civil Works Decision Support/Waterborne Commerce Statistics Center, and the Bureau of Transportation Statistics (BTS) [distributor].\"",
        "notes": "The source layer geometry is a POLYGON (port statistical area) per port. lat/lon are the polygon centroids computed by the ArcGIS server (returnCentroid=true, WGS84) and rounded to 6 decimals; they are representative points, not berth locations, and for large port areas can fall away from the docks. 'state'/'states' are parsed from the 2-letter codes in the source PORTNAME (state is null when the name lists several states or none). 'rank' is the source RANK: \"Numerical rank denoting the top 150 ports in total tonnage\". Tonnage units ('short tons') are from the NTAD data dictionary (ATTRUNIT). id = 'usace-' + source PORT code.",
    },
    "ports": ports,
}
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1)
print(len(ports), year, ports[0], [p["name"] for p in ports if p["state"] is None])
