"""Build public/data/infrastructure/harvey_prices.json from EIA history .xls files.

Every value is read from the downloaded files in research/raw/eia_xls/.
Run: research/venv/Scripts/python -I research/scripts/build_harvey_prices.py
"""
import json
import os
import re
import sys

import xlrd

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "research", "raw", "eia_xls")
OUT = os.path.join(ROOT, "public", "data", "infrastructure", "harvey_prices.json")

START, END = "2017-07-01", "2017-11-30"
FILES = ["RWTCd", "EER_EPMRU_PF4_RGC_DPGd", "EMM_EPMR_PTE_NUS_DPGw", "WGIRIP32w", "W_NA_YUP_R30_PERw"]

retrieved = open(os.path.join(RAW, "retrieved.txt")).read().strip()

series = []
for f in FILES:
    path = os.path.join(RAW, f + ".xls")
    book = xlrd.open_workbook(path)
    contents = book.sheet_by_index(0)
    data = book.sheet_by_index(1)
    meta = {}
    for r in range(contents.nrows):
        vals = [v for v in contents.row_values(r) if v != ""]
        if len(vals) >= 2 and isinstance(vals[0], str):
            meta[vals[0].strip()] = vals[1:]
    desc_row = meta["Data 1"]
    title = desc_row[0]
    frequency = desc_row[2]
    sourcekey = data.row_values(1)[1]
    header = data.row_values(2)[1]
    assert header == title, (header, title)
    assert data.row_values(1)[0] == "Sourcekey"
    m = re.search(r"\(([^()]*)\)\s*$", title)
    units = m.group(1) if m else None
    points = []
    for r in range(3, data.nrows):
        d, v = data.row_values(r)[:2]
        if d == "" or v == "":
            continue
        iso = xlrd.xldate_as_datetime(d, book.datemode).strftime("%Y-%m-%d")
        if START <= iso <= END:
            points.append([iso, v])
    series.append({
        "id": sourcekey,
        "name": title,
        "units": units,
        "frequency": frequency,
        "sourceUrl": "https://www.eia.gov/dnav/pet/hist_xls/%s.xls" % f,
        "webPage": meta["Available from Web Page:"][0],
        "fileReleaseDate": meta["Release Date:"][0],
        "points": points,
    })
    print(sourcekey, "|", title, "|", frequency, "|", len(points), points[0], points[-1])

out = {
    "meta": {
        "provider": "U.S. Energy Information Administration",
        "retrievedAt": retrieved,
        "license": "Public domain. EIA states: \"U.S. government publications are in the public domain and are not subject to copyright protection.\" (https://www.eia.gov/about/copyrights_reuse.php). EIA asks for an acknowledgment such as \"Source: U.S. Energy Information Administration\" with the publication date.",
        "window": [START, END],
        "notes": "Values copied unmodified from the 'Data 1' sheet of each EIA history workbook; only rows dated within the window are kept. 'name' is the exact title in each file, 'units' is the parenthetical in that title. Weekly series are dated as in the file (retail gasoline: Monday of survey week; refinery series: week-ending Friday). Days with no value in the source (e.g. holidays) are simply absent. Hurricane Harvey made landfall in Texas on 2017-08-25 (see research/HARVEY_FACTS.md).",
    },
    "series": series,
}
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1)
print("wrote", OUT)
