"""Build public/data/hindcast/doe_harvey_record.json: which refineries the U.S. Department of Energy
counted as shut during Hurricane Harvey (2017), report by report.

The DOE event reports (Updates #1 to #22) do NOT name refineries. Each gives a count and a combined
capacity "according to public reports". This script reconstructs the membership by arithmetic:

  for each report, find every set of N refineries in the EIA Refinery Capacity Report as of
  1 January 2017 (PADD 3) whose crude distillation capacities add up exactly to DOE's printed total.

Arithmetic alone is NOT enough: across the PADD 3 refineries, hundreds of different sets fit most of
the printed totals. Updates #1 to #9 also print how many of the refineries were in each of three
named areas ("all six refineries in the Corpus Christi area, seven refineries in the
Houston/Galveston area, and two refineries in the Beaumont/Port Arthur area"). Those regional counts
are applied as a second constraint, with each Texas refinery assigned to the nearest named city
within AREA_RADIUS_KM. A report is "resolved" only when exactly one set satisfies the total and the
regional counts. Updates #10 to #22 print no regional counts and stay unresolved. Nothing is chosen
by hand.

Inputs
  research/doe_harvey_aggregates.json        transcription of the printed counts and capacities (committed)
  public/data/hindcast/refineries_2017.json  EIA fleet and capacities as of 1 January 2017
  research/raw/doe_harvey/harvey_update_NN.pdf   optional; when present each transcribed figure is
                                                 checked against the text of its PDF
  research/notes/doe_harvey_refineries.json  optional; when present the aggregates file is regenerated from it

Run: research/venv/Scripts/python.exe -I research/scripts/build_doe_harvey_record.py
"""
from __future__ import annotations

import itertools
import json
import math
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AGG = ROOT / "research" / "doe_harvey_aggregates.json"
NOTES = ROOT / "research" / "notes" / "doe_harvey_refineries.json"
PDFS = ROOT / "research" / "raw" / "doe_harvey"
FLEET = ROOT / "public" / "data" / "hindcast" / "refineries_2017.json"
OUT = ROOT / "public" / "data" / "hindcast" / "doe_harvey_record.json"
INDEX = "https://www.energy.gov/ceser/articles/hurricanes-maria-irma-and-harvey-situation-reports-archived-august-26-2017-september"
MAX_SOLUTIONS = 200

MONTHS = {"August": 8, "September": 9}

# DOE's three named areas, with the reference cities used to assign refineries to them. City
# coordinates are those of the app's place list (src/sim/command.ts); Beaumont is 30.08 N, 94.10 W.
AREAS = {
    "Corpus Christi": [(27.80, -97.40)],
    "Houston/Galveston": [(29.76, -95.37), (29.30, -94.80)],
    "Beaumont/Port Arthur": [(30.08, -94.10), (29.90, -93.93)],
}
# A Texas refinery belongs to the area of its nearest reference city if that city is within this
# distance. Any value from 108 to 166 km gives the same assignment (Three Rivers is 107 km from
# Corpus Christi; the next refinery, Nixon, is 167 km away), so the result does not hinge on it.
AREA_RADIUS_KM = 125.0
AREA_RADIUS_TESTED = [108.0, 125.0, 150.0, 166.0]


def haversine_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def area_of(lat, lon, state, radius=AREA_RADIUS_KM):
    if state != "Texas" or lat is None:
        return None
    best = min((haversine_km(lat, lon, *c), name) for name, cities in AREAS.items() for c in cities)
    return best[1] if best[0] <= radius else None


def as_of_utc(section_as_of: str):
    """'03:00 PM EDT, August 30' -> '2017-08-30T19:00:00Z' (EDT = UTC-4)."""
    m = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM) EDT, (August|September) (\d{1,2})$", section_as_of.strip())
    if not m:
        return None
    hh, mm, ap, mon, dd = int(m.group(1)), int(m.group(2)), m.group(3), MONTHS[m.group(4)], int(m.group(5))
    hh = hh % 12 + (12 if ap == "PM" else 0)
    t = datetime(2017, mon, dd, hh, mm, tzinfo=timezone.utc) + timedelta(hours=4)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def regenerate_aggregates() -> None:
    d = json.loads(NOTES.read_text(encoding="utf-8"))
    src = {s["report"]: s for s in d["meta"]["sources"] if isinstance(s.get("report"), int)}
    rep = {r["report"]: r for r in d["reports"]}
    out = []
    for a in d["timeline"]["aggregateByReport"]:
        n = a["report"]
        out.append({
            "report": n,
            "title": rep[n]["title"],
            "asOfPrinted": a["asOf"],
            "sectionAsOf": a["sectionAsOf"],
            "asOfUtc": as_of_utc(a["sectionAsOf"]),
            "url": src[n]["url"],
            "pdfSha256": src[n]["sha256"],
            "refinerySectionPage": rep[n].get("refinerySectionPage"),
            "summaryQuote": rep[n]["summaryQuote"],
            "shut": a["shut"],
            "restarting": a["restarting"],
            "reducedRates": a["reducedRates"],
        })
    AGG.write_text(json.dumps({
        "what": "Transcription of the PETROLEUM REFINERIES section of the U.S. DOE Hurricane Harvey event reports, Updates #1 to #22: counts and combined capacities exactly as printed. The reports do not name refineries.",
        "indexPage": INDEX,
        "retrievedAt": d["meta"]["retrievedAt"],
        "notes": [
            "Counts for Updates #1 to #9 are the sum of the regional counts in the sentence; the report does not print the total.",
            "asOfUtc converts the section's 'As of' time from EDT (UTC-4).",
            "Update #4's sentence about reduced rates is cut off in the PDF itself.",
        ],
        "reports": out,
    }, indent=1), encoding="utf-8")


def verify_against_pdfs(reports):
    """Check that every transcribed capacity appears in the text of its PDF. Returns a summary."""
    try:
        from pypdf import PdfReader
    except ImportError:
        return {"checked": 0, "note": "pypdf not installed; figures not re-checked in this run"}
    checked, missing = 0, []
    for r in reports:
        p = PDFS / f"harvey_update_{r['report']:02d}.pdf"
        if not p.exists():
            continue
        text = " ".join((pg.extract_text() or "") for pg in PdfReader(str(p)).pages)
        squeezed = re.sub(r"(?<=[\d,])\s+(?=[\d,])", "", text)  # undo spaces that extraction puts inside numbers
        for part in ("shut", "restarting", "reducedRates"):
            v = (r.get(part) or {}).get("capacityBpd")
            if v is None:
                continue
            checked += 1
            if f"{v:,}" not in squeezed:
                missing.append(f"#{r['report']} {part} {v:,}")
    if missing:
        raise SystemExit("transcribed figures not found in the PDF text: " + "; ".join(missing))
    if not checked:
        return {"checked": 0, "note": "PDFs not present; figures not re-checked in this run"}
    return {"checked": checked, "note": "every transcribed capacity figure was found in the text of its PDF"}


def solve(items, count, target):
    """All subsets of `count` items whose values sum to `target` (at most MAX_SOLUTIONS). Exact search."""
    items = sorted(items, key=lambda kv: -kv[1])
    vals = [v for _, v in items]
    n = len(vals)
    # suf[i]: bit s set when some subset of items i.. sums to s (any size); a Python int used as a bitset.
    mask = (1 << (target + 1)) - 1
    suf = [1] * (n + 1)
    for i in range(n - 1, -1, -1):
        suf[i] = (suf[i + 1] | (suf[i + 1] << vals[i])) & mask
    pre = [0]
    for v in vals:
        pre.append(pre[-1] + v)
    sols = []
    state = {"capped": False}

    def rec(i, r, t, chosen):
        if state["capped"]:
            return
        if r == 0:
            if t == 0:
                sols.append([items[j][0] for j in chosen])
                state["capped"] = len(sols) >= MAX_SOLUTIONS
            return
        if n - i < r or t <= 0 or not (suf[i] >> t) & 1:
            return
        if pre[i + r] - pre[i] < t or pre[n] - pre[n - r] > t:  # largest and smallest sum of any r items from i..
            return
        chosen.append(i)
        rec(i + 1, r - 1, t - vals[i], chosen)
        chosen.pop()
        rec(i + 1, r, t, chosen)

    sys.setrecursionlimit(10000)
    rec(0, count, target, [])
    return sols, state["capped"]


def solve_regional(universe, region_counts, target, radius=AREA_RADIUS_KM):
    """Every choice of region_counts[area] refineries from each area whose capacities sum to target."""
    groups = []
    for area, n in region_counts.items():
        members = [u for u in universe if area_of(u["lat"], u["lon"], u["state"], radius) == area]
        groups.append(list(itertools.combinations(members, n)))
    sols = []
    for combo in itertools.product(*groups):
        flat = [u for part in combo for u in part]
        if sum(u["capacityBpd"] for u in flat) == target:
            sols.append(sorted(u["key"] for u in flat))
    return sols


def main() -> None:
    if NOTES.exists():
        regenerate_aggregates()
    agg = json.loads(AGG.read_text(encoding="utf-8"))
    reports = agg["reports"]
    verification = verify_against_pdfs(reports)

    fleet = json.loads(FLEET.read_text(encoding="utf-8"))
    universe = []
    for f in fleet["facilities"] + fleet["meta"]["unmatchedNoCoordinates"]:
        if f["padd"] == 3 and f["capacityBpd"]:
            key = f"{f['company']} | {f['name']} | {f['state']}"
            universe.append({"key": key, "eiaId": f.get("id"), "company": f["company"], "site": f["name"], "state": f["state"], "district": f["refiningDistrict"], "capacityBpd": f["capacityBpd"], "hasCoordinates": "id" in f, "lat": f.get("lat"), "lon": f.get("lon")})
    assert len({u["key"] for u in universe}) == len(universe)
    # A refinery with no position in the 2021 layer takes, for area assignment only, the position of
    # another refinery with the same EIA site name in the same state (Marathon's Texas City refinery,
    # merged into Galveston Bay in 2018, takes the position of Valero's Texas City refinery).
    borrowed = []
    for u in universe:
        if u["lat"] is None:
            twins = [v for v in universe if v["hasCoordinates"] and v["site"] == u["site"] and v["state"] == u["state"]]
            if twins:
                u["lat"], u["lon"] = twins[0]["lat"], twins[0]["lon"]
                borrowed.append({"key": u["key"], "from": twins[0]["key"]})
    for u in universe:
        u["area"] = area_of(u["lat"], u["lon"], u["state"])
    items = [(u["key"], u["capacityBpd"]) for u in universe]
    by_key = {u["key"]: u for u in universe}

    out_reports = []
    for r in reports:
        row = {k: r[k] for k in ("report", "title", "asOfPrinted", "sectionAsOf", "asOfUtc", "url", "summaryQuote")}
        for part in ("shut", "restarting", "reducedRates"):
            a = r.get(part) or {}
            cnt, cap = a.get("count"), a.get("capacityBpd")
            res = {"count": cnt, "capacityBpd": cap, "countBasis": a.get("countBasis"), "regionCountsAsPrinted": a.get("regionCountsAsPrinted")}
            if cnt and cap:
                sols, capped = solve(items, cnt, cap)
                res.update({"setsFittingTheTotalAlone": len(sols), "setsFittingTheTotalAloneCapped": capped, "setsFittingTotalAndRegionalCounts": None, "resolved": False, "members": None})
                rc = a.get("regionCountsAsPrinted")
                if part == "shut" and rc:
                    reg = solve_regional(universe, rc, cap)
                    stable = all(solve_regional(universe, rc, cap, rad) == reg for rad in AREA_RADIUS_TESTED)
                    res.update({"setsFittingTotalAndRegionalCounts": len(reg), "resolved": len(reg) == 1, "members": reg[0] if len(reg) == 1 else None, "sameResultForEveryTestedRadius": stable})
            row[part] = res
        out_reports.append(row)

    shut_in = {}
    for row in out_reports:
        if row["shut"].get("resolved"):
            for k in row["shut"]["members"]:
                shut_in.setdefault(k, []).append(row["report"])
    resolved_reports = [row["report"] for row in out_reports if row["shut"].get("resolved")]
    refineries = []
    for k in sorted(shut_in, key=lambda k: (shut_in[k][0], -by_key[k]["capacityBpd"])):
        u = by_key[k]
        refineries.append({
            "key": k,
            "doeName": f"{u['company'].title()} ({u['site'].title()})",
            "company": u["company"],
            "site": u["site"],
            "state": u["state"],
            "area": u["area"],
            "capacityBpd2017": u["capacityBpd"],
            "eiaId": u["eiaId"],
            "shutInReports": shut_in[k],
            "status": {str(n): ("shut" if n in shut_in[k] else "not in the shut set") for n in resolved_reports},
        })

    out = {
        "meta": {
            "provider": "U.S. Department of Energy (DOE), Office of Cybersecurity, Energy Security, and Emergency Response",
            "dataset": "Hurricane Harvey event reports, Updates #1 to #22 (26 August to 7 September 2017), PETROLEUM REFINERIES sections",
            "landingPage": INDEX,
            "retrievedAt": agg["retrievedAt"],
            "license": "U.S. Government work, public domain",
            "builtBy": "research/scripts/build_doe_harvey_record.py",
            "evidence": "Counts and capacities: HISTORICAL (as printed). Refinery membership: RECONSTRUCTED by arithmetic, not stated by DOE.",
            "method": [
                "DOE printed, for each report, how many refineries were shut (or shutting down) and their combined capacity, 'according to public reports'. It did not name them.",
                f"For each report, every set of that many PADD 3 refineries in the EIA Refinery Capacity Report as of 1 January 2017 ({len(universe)} refineries with a crude distillation capacity) was tested; a set fits when its capacities add up exactly to DOE's figure.",
                "That arithmetic alone does not identify the refineries: for most reports hundreds of different sets fit (setsFittingTheTotalAlone).",
                f"Updates #1 to #9 also print the number of refineries in each of three named areas. Each Texas refinery is assigned to the area of its nearest reference city (Corpus Christi; Houston or Galveston; Beaumont or Port Arthur) if within {AREA_RADIUS_KM:.0f} km; the same assignment results for any radius from 108 to 166 km. A report is 'resolved' only when exactly one set fits both the total and the regional counts.",
                "Updates #10 to #22 print no regional counts. Their membership is left unknown.",
            ],
            "areas": {
                "referenceCities": AREAS,
                "radiusKm": AREA_RADIUS_KM,
                "radiiTestedKm": AREA_RADIUS_TESTED,
                "members": {name: sorted(u["key"] for u in universe if u["area"] == name) for name in AREAS},
                "positionBorrowedForAreaAssignment": borrowed,
            },
            "assumptions": [
                "DOE's combined capacities were built from the EIA capacities as of 1 January 2017 (barrels per calendar day). The exact agreement of the resolved reports with that table supports this; DOE does not state it.",
                "DOE's area names mean what the nearest-city rule says they mean. DOE does not define them. The rule puts exactly six refineries in the Corpus Christi area, matching DOE's 'all six', and their capacities add up to DOE's 924,720 b/d.",
            ],
            "caveats": [
                "'Shut down or in the process of shutting down, according to public reports' covers precautionary shutdowns, flooding, power loss, port closures and crude supply problems. DOE does not attribute causes to named refineries.",
                "Capacities are nameplate crude distillation capacity, not lost output.",
                "Reports the method cannot resolve say nothing here about which refineries were shut at that time.",
            ],
            "figuresCheckedAgainstPdfText": verification,
            "universeSize": len(universe),
            "resolvedReports": resolved_reports,
            "unresolvedReports": [row["report"] for row in out_reports if not row["shut"].get("resolved")],
        },
        "reports": out_reports,
        "refineries": refineries,
    }
    OUT.write_text(json.dumps(out, indent=1), encoding="utf-8")
    for row in out_reports:
        s = row["shut"]
        print(f"#{row['report']:>2} {row['asOfUtc']} shut {s['count']:>2} {s['capacityBpd']:>9,} total-only={s.get('setsFittingTheTotalAlone')}{'+' if s.get('setsFittingTheTotalAloneCapped') else ''} with-regions={s.get('setsFittingTotalAndRegionalCounts')} resolved={s.get('resolved')} radius-stable={s.get('sameResultForEveryTestedRadius')}")
    print("verification:", verification)
    print("areas:", {k: len(v) for k, v in out["meta"]["areas"]["members"].items()}, "borrowed:", borrowed)
    for f in refineries:
        print(f"  {f['doeName']:<58} {f['capacityBpd2017']:>8,} {str(f['eiaId']):<34} {f['area']:<22} shut in {f['shutInReports']}")


if __name__ == "__main__":
    main()
