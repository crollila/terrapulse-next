/**
 * Tests on the bundled Hurricane Harvey rainfall record, the reconstructed DOE record and the 2017
 * fleet: file integrity, physical plausibility, time handling, and regression values for the
 * hindcast quoted in research/RAINFALL_FLOOD.md and in RAINFALL_CARD.
 *
 * A passing suite shows the files are intact and the arithmetic is reproduced. It does NOT validate
 * the rainfall screen as a predictor: the hindcast is one storm and is reported as such.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DURATIONS, RAINFALL_CARD, accumulate, rainExposure, sampleGrid, total, type AssetRain, type RainGridFile } from "./rainfall";
import { completedDays, exposuresToDate, fmtUtc, hourlyTrack, radiiOutline, recordWindow, seriesToDate, statusLabel, timeAt, trackAt, windClassBy, windOnsets } from "./rainRecord";
import { harveyHindcast, type HindcastSite } from "./harveyHindcast";
import { bearingDeg, nmToKm, type BestTrackFile, type TrackPoint } from "./hindcast";
import { haversineKm } from "./geo";
import { validateAssets, validateGrid, type HwmFile, type RainAssetsFile } from "../data/rainfall";
import { firstShut, peakReport, shutIds, shutIn, validateDoeRecord, type DoeRecord, type FleetFile } from "../data/doeRecord";

const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")) as T;
const grid = validateGrid(read<RainGridFile>("public/data/rainfall/harvey_2017_grid.json"));
const assets = validateAssets(read<RainAssetsFile>("public/data/rainfall/harvey_2017_assets.json"));
const hwms = read<HwmFile>("public/data/rainfall/harvey_2017_hwms.json");
const doe = validateDoeRecord(read<DoeRecord>("public/data/hindcast/doe_harvey_record.json"));
const fleet = read<FleetFile>("public/data/hindcast/refineries_2017.json");
const storm = read<BestTrackFile>("public/data/hindcast/best_tracks.json").storms.find((s) => s.id === "AL092017")!;
const results = read<any>("research/rainfall_hindcast_results.json");
const gauges = read<any>("research/rainfall_gauge_check.json");
const byId = new Map(assets.assets.map((a) => [a.id, a]));
const days = assets.meta.days;

describe("rainfall grid file", () => {
  it("has ten consecutive Stage IV days on a 210 x 140 grid with provenance", () => {
    expect(grid.grid).toMatchObject({ west: -100, south: 26, east: -89.5, north: 33, step: 0.05, nx: 210, ny: 140 });
    expect(grid.days.map((d) => d.date)).toEqual(["2017-08-24", "2017-08-25", "2017-08-26", "2017-08-27", "2017-08-28", "2017-08-29", "2017-08-30", "2017-08-31", "2017-09-01", "2017-09-02"]);
    expect(grid.days.every((d) => d.periodEnd === `${d.date}T12:00:00Z`)).toBe(true);
    const m = grid.meta as any;
    expect(m.provider).toMatch(/NOAA/);
    expect(m.evidence).toBe("OBSERVED");
    expect(m.files).toHaveLength(10);
    expect(m.files.every((f: any) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
    expect(Date.parse(m.retrievedAt)).not.toBeNaN();
  });

  it("holds whole millimetres within physical bounds", () => {
    let max = 0;
    for (const d of grid.days)
      for (const v of d.mm) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(-1);
        if (v > max) max = v;
      }
    // The largest one-day value on the display grid: extreme, but below 1 m in a day.
    expect(max).toBeGreaterThan(400);
    expect(max).toBeLessThan(1000);
  });

  it("accumulates to a storm total consistent with the native-grid maximum in the metadata", () => {
    const tot = accumulate(grid, grid.days.length - 1);
    let max = 0;
    for (const v of tot) if (Number.isFinite(v) && v > max) max = v;
    const native = (grid.meta as any).nativeGridMaximumInDomain;
    expect(native.mm).toBeCloseTo(1378.6, 1);
    expect(native.inches).toBeCloseTo(54.28, 2);
    // Sub-sampling to 0.05 degrees can miss the single wettest native cell, never exceed it.
    expect(max).toBeLessThanOrEqual(native.mm + 5);
    expect(max).toBeGreaterThan(native.mm * 0.9);
  });

  it("agrees with the per-site series, which are read from the native grid", () => {
    // The display grid takes the nearest native cell at each 0.05 degree cell centre, so the value at a
    // site can differ from the site's own cell by a neighbouring cell's worth, not by more.
    const tot = accumulate(grid, grid.days.length - 1);
    let n = 0;
    for (const a of assets.assets) {
      const g = sampleGrid(grid.grid, tot, a.lat!, a.lon!);
      const t = total(a.stage4.dailyMm);
      if (g === null || t === null) continue;
      n++;
      const { min, max } = a.stage4.block3x3TotalMm!;
      expect(g).toBeGreaterThanOrEqual(min - 10 - 0.05 * min);
      expect(g).toBeLessThanOrEqual(max + 10 + 0.05 * max);
    }
    expect(n).toBe(69);
  });
});

describe("per-site rainfall file", () => {
  it("covers every site with all sources and no gaps", () => {
    expect(assets.assets).toHaveLength(69);
    expect(assets.meta.missing).toEqual({ atlas14: [], imerg: [], elevation: [], nfhl: [] });
    expect(assets.assets.filter((a) => a.kind === "port")).toHaveLength(24);
    expect(assets.assets.filter((a) => a.fleets?.includes("2017"))).toHaveLength(42);
    expect(assets.assets.filter((a) => a.fleets?.includes("2026"))).toHaveLength(42);
    for (const a of assets.assets) {
      expect(a.stage4.dailyMm).toHaveLength(10);
      expect(a.stage4.dailyMm.every((v) => v !== null && v >= 0 && v < 700)).toBe(true);
      expect(a.nasa!.imergDailyMm).toHaveLength(10);
      expect(a.elevationM).not.toBeNull();
      expect(a.nfhl).not.toBeNull();
      expect(a.hwm.within2km).toBeLessThanOrEqual(a.hwm.within5km);
    }
    for (const k of ["stage4", "atlas14", "nasa", "elevation", "nfhl", "hwm"] as const) {
      expect(assets.meta.sources[k].provider.length).toBeGreaterThan(5);
      expect(assets.meta.sources[k].sourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("has Atlas 14 tables that increase with recurrence interval and duration, inside their bounds", () => {
    for (const a of assets.assets) {
      const at = a.atlas14!;
      expect(at.ariYears).toEqual([1, 2, 5, 10, 25, 50, 100, 200, 500, 1000]);
      for (const d of DURATIONS) {
        const row = at.mm[d.key];
        for (let i = 1; i < row.length; i++) expect(row[i]).toBeGreaterThanOrEqual(row[i - 1]);
        for (let i = 0; i < row.length; i++) {
          expect(at.lower90[d.key][i]).toBeLessThanOrEqual(row[i]);
          expect(at.upper90[d.key][i]).toBeGreaterThanOrEqual(row[i]);
        }
      }
      for (let i = 0; i < at.ariYears.length; i++) for (let k = 1; k < DURATIONS.length; k++) expect(at.mm[DURATIONS[k].key][i]).toBeGreaterThanOrEqual(at.mm[DURATIONS[k - 1].key][i]);
    }
  });

  it("reproduces the Motiva Port Arthur record (regression values)", () => {
    const a = byId.get("eia-507-texas-port-arthur")!;
    expect(a.stage4.dailyMm).toEqual([8.1, 1, 31.8, 163.9, 321.8, 151, 511.4, 32.8, 0, 0]);
    const e = rainExposure(a);
    expect(Math.round(e.totalMm!)).toBe(1222);
    expect(e.durations.map((d) => Math.round(d.observedMm!))).toEqual([511, 662, 984, 1148, 1214]);
    expect(e.durations.map((d) => d.ari)).toEqual([100, 200, 500, 1000, 1000]);
    expect(e.peakAri).toBe(1000);
    // NASA's two estimates for the same days are about half the radar and gauge analysis.
    expect(Math.round(total(a.nasa!.imergDailyMm)!)).toBe(601);
    expect(Math.round(total(a.nasa!.merra2DailyMm)!)).toBe(646);
  });

  it("separates the Houston to Port Arthur corridor from Corpus Christi, where little rain fell", () => {
    const tot = (id: string) => total(byId.get(id)!.stage4.dailyMm)!;
    expect(tot("eia-163-texas-baytown")).toBeGreaterThan(1000);
    expect(tot("eia-478-texas-corpus-christi")).toBeLessThan(250);
    expect(rainExposure(byId.get("eia-478-texas-corpus-christi")!).peakAri).toBeLessThan(10);
  });
});

describe("Stage IV against rain gauges (research/rainfall_gauge_check.json)", () => {
  it("matches the figures quoted in the model card", () => {
    expect(gauges.all).toMatchObject({ n: 1129, pearsonR: 0.984, meanAbsoluteDifferenceMm: 23.7, meanDifferenceMm: 5.4 });
    expect(gauges.gaugeAtLeast750mm).toMatchObject({ n: 45, meanAbsoluteDifferenceMm: 74.5, medianRatioStage4OverGauge: 0.999 });
    expect(gauges.caveats[0]).toMatch(/Not an independent test/);
  });
});

describe("high-water marks", () => {
  it("has every approved mark inside Texas and Louisiana with plausible heights", () => {
    expect(hwms.marks).toHaveLength(2364);
    expect(hwms.meta.count).toBe(2364);
    for (const m of hwms.marks) {
      expect(m.lat).toBeGreaterThan(25);
      expect(m.lat).toBeLessThan(34);
      expect(m.lon).toBeGreaterThan(-101);
      expect(m.lon).toBeLessThan(-88);
      if (m.hFt !== null) expect(m.hFt).toBeGreaterThan(0);
      expect(["Texas", "Louisiana"]).toContain(m.state);
    }
  });
});

describe("record time handling", () => {
  const w = recordWindow(days);
  it("starts 24 hours before the first 1200 UTC field and spans ten days", () => {
    expect(new Date(w.startMs).toISOString()).toBe("2017-08-23T12:00:00.000Z");
    expect(w).toMatchObject({ nDays: 10, hours: 240 });
    expect(() => recordWindow(["2017-08-24", "2017-08-26"])).toThrow();
    expect(() => recordWindow([])).toThrow();
  });
  it("counts only complete days", () => {
    expect(completedDays(w, 0)).toBe(0);
    expect(completedDays(w, 23.9)).toBe(0);
    expect(completedDays(w, 24)).toBe(1);
    expect(completedDays(w, 167.9)).toBe(6);
    expect(completedDays(w, 168)).toBe(7);
    expect(completedDays(w, 9999)).toBe(10);
    expect(new Date(timeAt(w, 168)).toISOString()).toBe("2017-08-30T12:00:00.000Z");
  });
  it("treats days that have not happened yet as zero rain", () => {
    expect(seriesToDate([5, null, 7, 9], 2)).toEqual([5, null, 0, 0]);
    const part = exposuresToDate(assets.assets, 3);
    const full = exposuresToDate(assets.assets, 10);
    for (let i = 0; i < part.length; i++) expect(part[i].totalMm!).toBeLessThanOrEqual(full[i].totalMm! + 1e-9);
  });
  it("formats times and status codes", () => {
    expect(fmtUtc(Date.parse("2017-08-27T12:00:00Z"))).toBe("27 Aug 2017, 12:00 UTC");
    expect(fmtUtc(Date.parse("2017-09-02T12:00:00Z"), false)).toBe("2 Sep 2017");
    expect(statusLabel("TS")).toBe("Tropical storm");
    expect(statusLabel("??")).toBe("??");
  });
});

describe("best track helpers", () => {
  const track = hourlyTrack(storm);
  it("finds the track point at a time and nothing outside the track", () => {
    const lf = trackAt(track, Date.parse("2017-08-26T03:00:00Z"))!;
    expect(lf.vmaxKt).toBe(115);
    expect(lf.lat).toBeCloseTo(28.0, 5);
    expect(trackAt(track, Date.parse("2017-08-26T03:30:00Z"))!.time).toBe("2017-08-26T03:00:00Z");
    expect(trackAt(track, track[0].timeMs - 1)).toBeNull();
    expect(trackAt(track, track[track.length - 1].timeMs + 1)).toBeNull();
    expect(trackAt([], 0)).toBeNull();
  });
  it("draws each quadrant of the wind radii at its own distance", () => {
    const p: TrackPoint = { timeMs: 0, time: "", lat: 28, lon: -96, vmaxKt: 100, status: "HU", r34: { ne: 100, se: 80, sw: 0, nw: 60 }, r50: { ne: 0, se: 0, sw: 0, nw: 0 }, r64: { ne: 0, se: 0, sw: 0, nw: 0 } };
    const ring = radiiOutline(p, 34)!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    const at = (bearing: number) => ring.filter(([lon, lat]) => Math.abs(bearingDeg(28, -96, lat, lon) - bearing) < 2.6 && haversineKm(28, -96, lat, lon) > 1);
    expect(haversineKm(28, -96, at(45)[0][1], at(45)[0][0])).toBeCloseTo(nmToKm(100), 0);
    expect(haversineKm(28, -96, at(135)[0][1], at(135)[0][0])).toBeCloseTo(nmToKm(80), 0);
    expect(haversineKm(28, -96, at(315)[0][1], at(315)[0][0])).toBeCloseTo(nmToKm(60), 0);
    expect(at(225)).toHaveLength(0); // no radius in the south-west: the outline passes through the centre
    expect(ring.some(([lon, lat]) => lon === -96 && lat === 28)).toBe(true);
    expect(radiiOutline(p, 50)).toBeNull();
  });
  it("records when a site first fell inside the observed radii", () => {
    const sites = [{ id: "cc", lat: 27.809474, lon: -97.428434 }, { id: "far", lat: 45, lon: -70 }];
    const on = windOnsets(storm, sites);
    expect(on.t64.has("cc")).toBe(false);
    expect(on.t50.has("cc")).toBe(true);
    expect(windClassBy(on, "cc", on.t50.get("cc")! - 1)).toBeLessThan(50);
    expect(windClassBy(on, "cc", on.t50.get("cc")!)).toBe(50);
    expect(windClassBy(on, "far", Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("2017 fleet and reconstructed DOE record", () => {
  it("matches the EIA national total for 1 January 2017", () => {
    expect(fleet.meta.dataAsOf).toBe("2017-01-01");
    expect(fleet.meta.totalCapacityBpd).toBe(18_617_027);
    expect(fleet.facilities).toHaveLength(125);
    expect(fleet.meta.unmatchedNoCoordinates.map((u) => u.name)).toContain("TEXAS CITY");
  });

  it("holds 22 reports; the first nine are resolved to exactly one set each", () => {
    expect(doe.reports.map((r) => r.report)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(doe.meta.resolvedReports).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(doe.meta.universeSize).toBe(55);
    for (const r of doe.reports) {
      expect(Date.parse(r.asOfUtc!)).not.toBeNaN();
      if (r.report <= 9) {
        expect(r.shut.setsFittingTotalAndRegionalCounts).toBe(1);
        expect(r.shut.sameResultForEveryTestedRadius).toBe(true);
        expect(r.shut.members).toHaveLength(r.shut.count!);
        // Arithmetic alone is far from unique, which is why the regional counts are needed.
        expect(r.shut.setsFittingTheTotalAlone!).toBeGreaterThan(100);
      } else {
        expect(r.shut.resolved).toBe(false);
        expect(r.shut.members).toBeNull();
      }
    }
  });

  it("has members whose EIA capacities add up to DOE's printed totals", () => {
    const cap = new Map(doe.refineries.map((r) => [r.key, r.capacityBpd2017]));
    for (const r of doe.reports.filter((x) => x.shut.resolved)) expect(r.shut.members!.reduce((s, k) => s + cap.get(k)!, 0)).toBe(r.shut.capacityBpd);
    expect(doe.reports[8].shut.capacityBpd).toBe(3_871_449);
    expect(doe.reports[0].shut.capacityBpd).toBe(924_720);
  });

  it("grows monotonically: no refinery leaves the shut set between Updates #1 and #9", () => {
    for (let i = 1; i < 9; i++) for (const k of doe.reports[i - 1].shut.members!) expect(doe.reports[i].shut.members).toContain(k);
    expect(shutIn(doe, 9)).toHaveLength(15);
    expect(shutIds(doe, 9)).toHaveLength(14); // Marathon's Texas City refinery has no position in the EIA layer
    expect(peakReport(doe)!.report).toBe(9);
    expect(firstShut(doe).get("eia-507-texas-port-arthur")!.report).toBe(9);
    expect(firstShut(doe).get("eia-163-texas-baytown")!.report).toBe(4);
  });
});

describe("hindcast against DOE Update #9 (regression values quoted in the model card)", () => {
  const peak = peakReport(doe)!;
  const run = (ariYears: number, reading: "estimate" | "conservative" | "liberal" = "estimate", rainFactor = 1) =>
    harveyHindcast({ fleet: fleet.facilities as HindcastSite[], rain: assets.assets, days, storm, recordedIds: shutIds(doe, peak.report), asOfUtc: peak.asOfUtc!, ariYears, reading, rainFactor });
  const row = (h: ReturnType<typeof run>, key: string) => {
    const s = h.screens.find((x) => x.key === key)!;
    return [s.ids.length, s.score.hits.length, s.score.misses.length, s.score.falseAlarms.length];
  };
  const h = run(100);

  it("uses 39 refineries of the 2017 fleet, 14 of them in DOE's count, with 7 rainfall days", () => {
    expect(h.universe).toHaveLength(39);
    expect(h.recorded).toHaveLength(14);
    expect(h.recordedOutsideUniverse).toEqual([]);
    expect(h.rainDays).toBe(7);
    expect(h.asOfUtc).toBe("2017-08-30T12:00:00Z");
  });

  it("wind alone: 64 kt finds none, 50 kt finds the Corpus Christi plants, 34 kt finds all with 11 extra", () => {
    expect(row(h, "wind64")).toEqual([0, 0, 14, 0]);
    expect(row(h, "wind50")).toEqual([6, 5, 9, 1]);
    expect(row(h, "wind34")).toEqual([25, 14, 0, 11]);
  });

  it("rainfall at the 100-year depth finds every counted refinery from Houston to Port Arthur and 6 others", () => {
    expect(row(h, "rain")).toEqual([14, 8, 6, 6]);
    const s = h.screens.find((x) => x.key === "rain")!;
    const area = new Map(doe.refineries.map((r) => [r.eiaId, r.area]));
    expect(s.score.misses.every((id) => area.get(id) === "Corpus Christi")).toBe(true);
    expect(s.score.hits.every((id) => area.get(id) !== "Corpus Christi")).toBe(true);
  });

  it("50-kt wind or 100-year rainfall finds 13 of 14, missing Three Rivers, with 7 extra", () => {
    expect(row(h, "wind50orRain")).toEqual([20, 13, 1, 7]);
    expect(h.screens.find((x) => x.key === "wind50orRain")!.score.misses).toEqual(["eia-387-texas-three-rivers"]);
    expect(h.screens.find((x) => x.key === "wind50orRain")!.score.criticalSuccessIndex).toBeCloseTo(13 / 21, 12);
  });

  it("reports the spread across thresholds, Atlas 14 bounds and rainfall error", () => {
    expect([10, 25, 100, 500, 1000].map((a) => row(run(a), "rain"))).toEqual([[18, 8, 6, 10], [17, 8, 6, 9], [14, 8, 6, 6], [11, 6, 8, 5], [8, 4, 10, 4]]);
    expect(row(run(100, "conservative"), "rain")[0]).toBe(11);
    expect(row(run(100, "liberal"), "rain")[0]).toBe(17);
    expect(row(run(100, "estimate", 0.8), "rain")[0]).toBe(11);
    expect(row(run(100, "estimate", 1.2), "rain")[0]).toBe(15);
  });

  it("agrees with the results file written by the research runner", () => {
    expect(results.referenceReport).toMatchObject({ report: 9, asOfUtc: "2017-08-30T12:00:00Z", doeCount: 15, doeCapacityBpd: 3_871_449 });
    const ref = results.byThreshold.find((t: any) => t.ariYears === 100);
    for (const s of h.screens) {
      const r = ref.screens.find((x: any) => x.key === s.key);
      expect([r.count, r.hits, r.misses, r.falseAlarms]).toEqual(row(h, s.key));
      expect(r.capacityBpd).toBe(s.capacityBpd);
    }
    expect(results.sitesAtReferenceReport).toHaveLength(39);
  });

  it("keeps the model card's hindcast lines in step with these numbers", () => {
    const text = RAINFALL_CARD.hindcast.join(" ");
    for (const phrase of ["15 refineries", "3,871,449 b/d", "14 of them", "39 refineries", "contain none of the 14", "contain 5", "all 14 and 11 others", "14 refineries, of which 8", "misses the 6 Corpus Christi", "includes 6 that DOE did not count", "20 refineries, 13 of the 14", "7 not counted"]) expect(text).toContain(phrase);
    expect(RAINFALL_CARD.uncertainty).toContain("11 to 17 refineries");
    expect(RAINFALL_CARD.uncertainty).toContain("11 to 15");
    expect(RAINFALL_CARD.uncertainty).toContain("1,129 rain gauges");
  });
});

describe("harveyHindcast on synthetic input", () => {
  const mkRain = (id: string, mm: number): AssetRain => ({
    id,
    kind: "refinery",
    stage4: { dailyMm: [mm, 0], block3x3TotalMm: null },
    atlas14: { ariYears: [1, 100], mm: Object.fromEntries(DURATIONS.map((d) => [d.key, [10, 100]])), upper90: Object.fromEntries(DURATIONS.map((d) => [d.key, [20, 200]])), lower90: Object.fromEntries(DURATIONS.map((d) => [d.key, [5, 50]])) },
    nasa: null,
    elevationM: null,
    nfhl: null,
    hwm: { within2km: 0, within5km: 0, nearestKm: 9, withHeightWithin5km: 0, maxHeightFtWithin5km: null, medianHeightFtWithin5km: null },
  });
  const site = (id: string, capacityBpd: number | null): HindcastSite => ({ id, name: id, company: "c", lat: 45, lon: -70, capacityBpd });
  it("drops sites without capacity or rainfall data and uses only days completed by the report", () => {
    const base = { fleet: [site("wet", 100), site("dry", 50), site("nocap", null), site("norain", 70)], rain: [mkRain("wet", 150), mkRain("dry", 1), mkRain("nocap", 500)], days: ["2017-08-24", "2017-08-25"], storm, recordedIds: ["wet", "norain"], ariYears: 100 };
    const after = harveyHindcast({ ...base, asOfUtc: "2017-08-24T12:00:00Z" });
    expect(after.universe.map((s) => s.id)).toEqual(["wet", "dry"]);
    expect(after.recorded).toEqual(["wet"]);
    expect(after.recordedOutsideUniverse).toEqual(["norain"]);
    expect(after.rainDays).toBe(1);
    expect(after.screens.find((s) => s.key === "rain")!.ids).toEqual(["wet"]);
    expect(after.screens.find((s) => s.key === "rain")!.capacityBpd).toBe(100);
    const before = harveyHindcast({ ...base, asOfUtc: "2017-08-24T11:00:00Z" });
    expect(before.rainDays).toBe(0);
    expect(before.screens.find((s) => s.key === "rain")!.ids).toEqual([]);
    expect(harveyHindcast({ ...base, asOfUtc: "2017-08-24T12:00:00Z", reading: "conservative" }).screens.find((s) => s.key === "rain")!.ids).toEqual([]);
    expect(() => harveyHindcast({ ...base, asOfUtc: "not a date" })).toThrow();
  });
});
