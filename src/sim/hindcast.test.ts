/**
 * Hindcast helpers: unit conversion, interpolation and quadrant logic on synthetic tracks with
 * hand-computed answers, then parsing sanity and regression values on the real NHC best tracks.
 * These tests prove the arithmetic. They do NOT validate the wind model: see research/HINDCAST.md.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  KM_PER_NM,
  bearingDeg,
  hollandTrackExposure,
  interpolateTrack,
  nmToKm,
  observedRadiiExposure,
  quadrantOf,
  type BestTrackFile,
  type BestTrackFix,
  type BestTrackStorm,
  type QuadrantRadii,
} from "./hindcast";
import { destination, haversineKm } from "./geo";
import { validateRefineries } from "../data/infrastructure";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../public/data/${p}`, import.meta.url), "utf8"));

const radii = (ne: number | null, se: number | null, sw: number | null, nw: number | null): QuadrantRadii => ({ ne, se, sw, nw });
const NONE = radii(0, 0, 0, 0);
const fix = (time: string, lat: number, lon: number, vmaxKt: number | null, r34 = NONE, r50 = NONE, r64 = NONE): BestTrackFix => ({
  time,
  recordId: "",
  status: "HU",
  lat,
  lon,
  vmaxKt,
  pressureMb: null,
  r34,
  r50,
  r64,
});
const storm = (fixes: BestTrackFix[]): BestTrackStorm => ({ id: "SYNTH", name: "SYNTHETIC", year: 2000, fixes });
/** Asset at a given bearing and distance from (lat0, lon0). */
const assetAt = (id: string, bearing: number, km: number, lat0 = 0, lon0 = 0, capacityBpd: number | null = 100) => ({ id, capacityBpd, ...destination(lat0, lon0, bearing, km) });

describe("units", () => {
  it("1 nautical mile is exactly 1.852 km", () => {
    expect(KM_PER_NM).toBe(1.852);
    expect(nmToKm(1)).toBe(1.852);
    expect(nmToKm(0)).toBe(0);
    expect(nmToKm(100)).toBeCloseTo(185.2, 10);
    expect(nmToKm(64)).toBeCloseTo(118.528, 10);
  });
});

describe("bearing and quadrant", () => {
  it("cardinal bearings from the equator", () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 9);
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 9);
    expect(bearingDeg(0, 0, -1, 0)).toBeCloseTo(180, 9);
    expect(bearingDeg(0, 0, 0, -1)).toBeCloseTo(270, 9);
  });
  it("bearing inverts destination()", () => {
    for (const b of [10, 45, 135, 200, 225, 315, 359]) {
      const p = destination(29, -95, b, 150);
      expect(bearingDeg(29, -95, p.lat, p.lon)).toBeCloseTo(b, 6);
    }
  });
  it("quadrants: NE [0,90), SE [90,180), SW [180,270), NW [270,360)", () => {
    expect(quadrantOf(0)).toBe("ne");
    expect(quadrantOf(89.999)).toBe("ne");
    expect(quadrantOf(90)).toBe("se");
    expect(quadrantOf(179.999)).toBe("se");
    expect(quadrantOf(180)).toBe("sw");
    expect(quadrantOf(269.999)).toBe("sw");
    expect(quadrantOf(270)).toBe("nw");
    expect(quadrantOf(359.999)).toBe("nw");
    expect(quadrantOf(360)).toBe("ne");
    expect(quadrantOf(-45)).toBe("nw");
  });
});

describe("interpolateTrack", () => {
  const s = storm([
    fix("2000-09-01T00:00:00Z", 10, -90, 100, radii(100, 60, 0, null)),
    fix("2000-09-01T06:00:00Z", 13, -93, 40, radii(40, 0, 30, 20)),
  ]);

  it("hourly steps between two fixes 6 h apart: 7 points, linear in time", () => {
    const t = interpolateTrack(s, 1);
    expect(t).toHaveLength(7);
    expect(t.map((p) => p.time)).toEqual([0, 1, 2, 3, 4, 5, 6].map((h) => `2000-09-01T0${h}:00:00Z`));
    // hand calculation at 2 h (one third of the way)
    expect(t[2].lat).toBeCloseTo(11, 12);
    expect(t[2].lon).toBeCloseTo(-91, 12);
    expect(t[2].vmaxKt).toBeCloseTo(80, 12);
    expect(t[2].r34.ne).toBeCloseTo(80, 12); // 100 -> 40
    expect(t[2].r34.se).toBeCloseTo(40, 12); // 60 -> 0: zero is a value and interpolates
    expect(t[2].r34.sw).toBeCloseTo(10, 12); // 0 -> 30
    // end points are the fixes themselves
    expect(t[0]).toMatchObject({ lat: 10, lon: -90, vmaxKt: 100 });
    expect(t[6]).toMatchObject({ lat: 13, lon: -93, vmaxKt: 40 });
  });

  it("a missing radius at either end is null inside the interval, but a fix keeps its own value", () => {
    const t = interpolateTrack(s, 1);
    expect(t[0].r34.nw).toBeNull();
    expect(t[3].r34.nw).toBeNull();
    expect(t[6].r34.nw).toBe(20);
    const rev = interpolateTrack(storm([fix("2000-09-01T00:00:00Z", 0, 0, 50, radii(20, 0, 0, 0)), fix("2000-09-01T06:00:00Z", 0, 0, 50, radii(null, 0, 0, 0))]), 1);
    expect(rev[0].r34.ne).toBe(20);
    expect(rev[1].r34.ne).toBeNull();
    expect(rev[6].r34.ne).toBeNull();
  });

  it("step larger than the gap, uneven steps and asynoptic fixes: every fix is kept exactly", () => {
    expect(interpolateTrack(s, 6).map((p) => p.time)).toEqual(["2000-09-01T00:00:00Z", "2000-09-01T06:00:00Z"]);
    expect(interpolateTrack(s, 12)).toHaveLength(2);
    // 6 h at a 4 h step: ceil(6/4) = 2 equal parts of 3 h
    const t4 = interpolateTrack(s, 4);
    expect(t4.map((p) => p.time)).toEqual(["2000-09-01T00:00:00Z", "2000-09-01T03:00:00Z", "2000-09-01T06:00:00Z"]);
    expect(t4[1].vmaxKt).toBeCloseTo(70, 12);
    const asyn = storm([fix("2000-09-01T00:00:00Z", 0, 0, 90), fix("2000-09-01T01:30:00Z", 0, 1, 90), fix("2000-09-01T06:00:00Z", 0, 2, 90)]);
    const ta = interpolateTrack(asyn, 1).map((p) => p.time);
    // 1.5 h -> 2 parts of 45 min; 4.5 h -> 5 parts of 54 min
    expect(ta).toHaveLength(2 + 5 + 1);
    expect(ta).toContain("2000-09-01T01:30:00Z");
    expect(ta[1]).toBe("2000-09-01T00:45:00Z");
    expect(ta[3]).toBe("2000-09-01T02:24:00Z");
  });

  it("rejects bad input and does not mutate the storm", () => {
    expect(() => interpolateTrack(s, 0)).toThrow();
    expect(() => interpolateTrack(storm([fix("2000-09-01T06:00:00Z", 0, 0, 50), fix("2000-09-01T00:00:00Z", 0, 0, 50)]))).toThrow();
    const before = JSON.stringify(s);
    const t = interpolateTrack(s, 1);
    t[0].r34.ne = -1;
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("observedRadiiExposure on a synthetic stationary storm", () => {
  // centre fixed at (0, 0); 34-kt radii NE 100 nm (185.2 km), SE 50 nm (92.6 km), SW 0, NW missing
  const s = storm([fix("2000-09-01T00:00:00Z", 0, 0, 80, radii(100, 50, 0, null)), fix("2000-09-01T06:00:00Z", 0, 0, 80, radii(100, 50, 0, null))]);
  const assets = [
    assetAt("ne-in", 45, 180), // 180 < 185.2
    assetAt("ne-out", 45, 190), // 190 > 185.2
    assetAt("se-in", 135, 90), // 90 < 92.6
    assetAt("se-out", 135, 95), // 95 > 92.6, although it would be inside the NE radius
    assetAt("sw-zero", 225, 10), // radius 0: not reached
    assetAt("nw-missing", 315, 10), // radius missing: not reached
    assetAt("north-edge", 0, 180), // bearing 0 belongs to NE
    assetAt("east-edge", 90, 95), // bearing 90 belongs to SE: 95 > 92.6
    assetAt("south-edge", 180, 90), // bearing 180 belongs to SW (radius 0)
    assetAt("west-edge", 270, 10), // bearing 270 belongs to NW (missing)
  ];

  it("uses the radius of the quadrant the asset lies in", () => {
    const res = observedRadiiExposure(s, assets, 34);
    expect(res.exposed.map((a) => a.id)).toEqual(["ne-in", "se-in", "north-edge"]);
    expect(res.count).toBe(3);
    expect(res.thresholdKt).toBe(34);
    expect(res.exposed[0].firstExposedAt).toBe("2000-09-01T00:00:00Z");
    expect(res.exposed[0].closestApproachKm).toBeCloseTo(180, 6);
    expect(res.exposed[0].peakWindKt).toBeNull();
  });

  it("other thresholds use their own radii (all zero here)", () => {
    expect(observedRadiiExposure(s, assets, 50).count).toBe(0);
    expect(observedRadiiExposure(s, assets, 64).count).toBe(0);
    // @ts-expect-error only 34, 50 and 64 kt have best-track radii
    expect(() => observedRadiiExposure(s, assets, 96)).toThrow();
  });

  it("capacity sum excludes and counts unknown capacities", () => {
    const mixed = [assetAt("a", 45, 50, 0, 0, 1000), assetAt("b", 45, 60, 0, 0, null), assetAt("c", 45, 70, 0, 0, 250), assetAt("far", 45, 500, 0, 0, 9999)];
    const res = observedRadiiExposure(s, mixed, 34);
    expect(res.count).toBe(3);
    expect(res.capacityBpd).toBe(1250);
    expect(res.capacityUnknown).toBe(1);
  });
});

describe("exposure needs the interpolated positions", () => {
  // centre moves along the equator from lon 0 to lon 6 in 6 h; all 34-kt radii 30 nm = 55.56 km.
  // Asset at (0.3 N, 3 E): 0.3 deg of latitude = 33.36 km from the centre when it is at lon 3 (t = 3 h).
  // At the two fixes it is about 335 km away; at t = 2 h and 4 h about 116 km (sqrt(111.19^2 + 33.36^2)).
  const r = radii(30, 30, 30, 30);
  const s = storm([fix("2000-09-01T00:00:00Z", 0, 0, 60, r), fix("2000-09-01T06:00:00Z", 0, 6, 60, r)]);
  const asset = [{ id: "mid", lat: 0.3, lon: 3, capacityBpd: 5 }];

  it("hand-computed distances", () => {
    expect(haversineKm(0, 3, 0.3, 3)).toBeCloseTo(33.36, 2);
    expect(haversineKm(0, 2, 0.3, 3)).toBeCloseTo(116.09, 1);
    expect(nmToKm(30)).toBeCloseTo(55.56, 10);
  });
  it("missed at 6-hourly fixes, caught hourly at t = 3 h", () => {
    expect(observedRadiiExposure(s, asset, 34, 6).count).toBe(0);
    const res = observedRadiiExposure(s, asset, 34, 1);
    expect(res.count).toBe(1);
    expect(res.exposed[0].firstExposedAt).toBe("2000-09-01T03:00:00Z");
    expect(res.exposed[0].closestApproachKm).toBeCloseTo(33.36, 2);
    expect(res.capacityBpd).toBe(5);
  });
});

describe("hollandTrackExposure", () => {
  const s = storm([fix("2000-09-01T00:00:00Z", 0, 0, 100), fix("2000-09-01T06:00:00Z", 0, 0, 40)]);

  it("stationary storm: wind at 2 Rmax with B = 1.5 is 82.15 kt (hand calculation), from the first, strongest fix", () => {
    const x = Math.pow(0.5, 1.5); // 0.353553
    const expected = 100 * Math.sqrt(x * Math.exp(1 - x)); // 100 * sqrt(0.353553 * 1.908757) = 82.149
    expect(expected).toBeCloseTo(82.149, 2);
    const a = [assetAt("two-rmax", 0, 70)];
    const res64 = hollandTrackExposure(s, a, 64, 35, 1.5);
    expect(res64.count).toBe(1);
    expect(res64.exposed[0].peakWindKt).toBeCloseTo(expected, 6);
    expect(res64.exposed[0].firstExposedAt).toBe("2000-09-01T00:00:00Z");
    expect(hollandTrackExposure(s, a, 96, 35, 1.5).count).toBe(0);
  });

  it("uses the observed Vmax at each time: an asset reached only after weakening sees the weaker wind", () => {
    // centre moves 0 -> 6 deg E while Vmax falls 100 -> 40 kt; asset sits at the 6 h position, at Rmax (35 km) to the north
    const moving = storm([fix("2000-09-01T00:00:00Z", 0, 0, 100), fix("2000-09-01T06:00:00Z", 0, 6, 40)]);
    const a = [assetAt("end", 0, 35, 0, 6)];
    const res = hollandTrackExposure(moving, a, 34, 35, 1.5);
    expect(res.count).toBe(1);
    expect(res.exposed[0].peakWindKt).toBeCloseTo(40, 6); // V(Rmax) = Vmax = 40 at the last fix
    expect(hollandTrackExposure(moving, a, 50, 35, 1.5).count).toBe(0);
  });

  it("a storm below the threshold exposes nothing; missing Vmax is skipped", () => {
    const weak = storm([fix("2000-09-01T00:00:00Z", 0, 0, 30), fix("2000-09-01T06:00:00Z", 0, 0, 30)]);
    expect(hollandTrackExposure(weak, [assetAt("at-rmax", 0, 35)], 34, 35, 1.5).count).toBe(0);
    const missing = storm([fix("2000-09-01T00:00:00Z", 0, 0, null), fix("2000-09-01T06:00:00Z", 0, 0, null)]);
    expect(hollandTrackExposure(missing, [assetAt("at-rmax", 0, 35)], 34, 35, 1.5).count).toBe(0);
  });

  it("larger Rmax never removes an asset outside Rmax; lower threshold never removes an asset", () => {
    const assets = [50, 100, 150, 200, 300, 400].map((km, i) => assetAt(`a${i}`, 30, km));
    const n = (thr: number, rmax: number) => hollandTrackExposure(s, assets, thr, rmax, 1.5).count;
    expect(n(64, 20)).toBeLessThanOrEqual(n(64, 35));
    expect(n(64, 35)).toBeLessThanOrEqual(n(64, 50));
    expect(n(64, 35)).toBeLessThanOrEqual(n(34, 35));
  });
});

describe("real best tracks (NHC HURDAT2)", () => {
  const file = read("hindcast/best_tracks.json") as BestTrackFile;
  const refineries = validateRefineries(read("infrastructure/refineries.json"));
  const harvey = file.storms.find((s) => s.id === "AL092017")!;
  const ike = file.storms.find((s) => s.id === "AL092008")!;

  it("provenance is present", () => {
    expect(file.meta.provider).toMatch(/National Hurricane Center/);
    expect(file.meta.sourceUrl).toMatch(/^https:\/\/www\.nhc\.noaa\.gov\/data\/hurdat\/hurdat2-.*\.txt$/);
    expect(file.meta.formatDoc).toMatch(/^https:\/\/www\.nhc\.noaa\.gov\/data\/hurdat\/.*\.pdf$/);
    expect(Number.isFinite(Date.parse(file.meta.retrievedAt))).toBe(true);
    expect(file.meta.license).toBe("U.S. Government work, public domain");
    expect(file.storms.map((s) => s.id)).toEqual(["AL092017", "AL092008"]);
  });

  it("Harvey: Texas landfall fix matches the NHC report (115 kt, 937 mb, 0300 UTC 26 Aug 2017)", () => {
    expect(harvey.name).toBe("HARVEY");
    const f = harvey.fixes.find((x) => x.time === "2017-08-26T03:00:00Z")!;
    expect(f).toBeDefined();
    expect(f.recordId).toBe("L");
    expect(f.status).toBe("HU");
    expect(f.vmaxKt).toBe(115);
    expect(f.pressureMb).toBe(937);
    // second landfall 3 h later: 105 kt, 948 mb (same report)
    const g = harvey.fixes.find((x) => x.time === "2017-08-26T06:00:00Z")!;
    expect([g.recordId, g.vmaxKt, g.pressureMb]).toEqual(["L", 105, 948]);
    expect(Math.max(...harvey.fixes.map((x) => x.vmaxKt ?? 0))).toBe(115);
  });

  it("Ike: Galveston landfall fix matches the NHC report (95 kt, 0700 UTC 13 Sep 2008)", () => {
    expect(ike.name).toBe("IKE");
    const f = ike.fixes.find((x) => x.time === "2008-09-13T07:00:00Z")!;
    expect(f).toBeDefined();
    expect(f.recordId).toBe("L");
    expect(f.status).toBe("HU");
    expect(f.vmaxKt).toBe(95);
  });

  it("columns are parsed in the right order: fields are plausible and ordered", () => {
    for (const s of file.storms) {
      let prev = -Infinity;
      for (const f of s.fixes) {
        const t = Date.parse(f.time);
        expect(t).toBeGreaterThan(prev);
        prev = t;
        expect(f.lat).toBeGreaterThan(0);
        expect(f.lat).toBeLessThan(60);
        expect(f.lon).toBeLessThan(0); // western hemisphere
        expect(f.vmaxKt).not.toBeNull();
        expect(f.pressureMb!).toBeGreaterThan(850);
        expect(f.pressureMb!).toBeLessThan(1030);
        for (const q of ["ne", "se", "sw", "nw"] as const) {
          for (const r of [f.r34[q], f.r50[q], f.r64[q]]) if (r !== null) expect(r).toBeGreaterThanOrEqual(0);
          // a stronger wind never reaches further than a weaker one in the same quadrant
          if (f.r34[q] !== null && f.r50[q] !== null) expect(f.r50[q]!).toBeLessThanOrEqual(f.r34[q]!);
          if (f.r50[q] !== null && f.r64[q] !== null) expect(f.r64[q]!).toBeLessThanOrEqual(f.r50[q]!);
          // 64-kt radii only when the storm is a hurricane; 34-kt radii only at 34 kt or more
          if ((f.r64[q] ?? 0) > 0) expect(f.vmaxKt!).toBeGreaterThanOrEqual(64);
          if ((f.r34[q] ?? 0) > 0) expect(f.vmaxKt!).toBeGreaterThanOrEqual(34);
        }
      }
    }
  });

  it("interpolated track keeps every fix and never steps more than one hour", () => {
    for (const s of file.storms) {
      const t = interpolateTrack(s, 1);
      const times = new Set(t.map((p) => p.time));
      for (const f of s.fixes) expect(times.has(f.time)).toBe(true);
      for (let i = 1; i < t.length; i++) expect(t[i].timeMs - t[i - 1].timeMs).toBeLessThanOrEqual(3_600_000 + 1);
    }
  });

  it("is deterministic and does not mutate its inputs", () => {
    const before = JSON.stringify([harvey, refineries]);
    const a = observedRadiiExposure(harvey, refineries, 34);
    const b = observedRadiiExposure(harvey, refineries, 34);
    const c = hollandTrackExposure(ike, refineries, 64, 35, 1.5);
    const d = hollandTrackExposure(ike, refineries, 64, 35, 1.5);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(c)).toBe(JSON.stringify(d));
    expect(JSON.stringify([harvey, refineries])).toBe(before);
  });

  it("footprints nest: 64-kt inside 50-kt inside 34-kt, and capacity equals the sum of members", () => {
    for (const s of file.storms) {
      const ids = (thr: 34 | 50 | 64) => new Set(observedRadiiExposure(s, refineries, thr).exposed.map((r) => r.id));
      const [i64, i50, i34] = [ids(64), ids(50), ids(34)];
      for (const id of i64) expect(i50.has(id)).toBe(true);
      for (const id of i50) expect(i34.has(id)).toBe(true);
      const res = observedRadiiExposure(s, refineries, 34);
      expect(res.capacityBpd).toBe(res.exposed.reduce((sum, r) => sum + (r.capacityBpd ?? 0), 0));
      expect(res.capacityUnknown).toBe(res.exposed.filter((r) => r.capacityBpd === null).length);
    }
  });

  // Regression values for research/HINDCAST.md with the committed data files (EIA capacity as of
  // 1 January 2026, not the 2017 or 2008 fleet). They record what the code gives; they are not a
  // statement that the footprint matches the documented shutdowns. It does not for Harvey.
  it("regression: headline hindcast numbers", () => {
    const obs = (s: BestTrackStorm, thr: 34 | 50 | 64) => {
      const r = observedRadiiExposure(s, refineries, thr);
      return [r.count, r.capacityBpd, r.capacityUnknown];
    };
    const hol = (s: BestTrackStorm, thr: number, rmax: number) => {
      const r = hollandTrackExposure(s, refineries, thr, rmax, 1.5);
      return [r.count, r.capacityBpd, r.capacityUnknown];
    };
    expect(obs(harvey, 64)).toEqual([0, 0, 0]);
    expect(obs(harvey, 50)).toEqual([7, 956500, 0]);
    expect(obs(harvey, 34)).toEqual([29, 6336050, 3]);
    expect(obs(ike, 64)).toEqual([19, 4993550, 3]);
    expect(obs(ike, 50)).toEqual([31, 6487150, 3]);
    expect(obs(ike, 34)).toEqual([44, 9402123, 3]);
    expect(hol(harvey, 64, 35)).toEqual([7, 1031500, 0]);
    expect(hol(harvey, 34, 35)).toEqual([28, 6336050, 2]);
    expect(hol(ike, 64, 35)).toEqual([13, 3885150, 1]);
    expect(hol(ike, 34, 35)).toEqual([26, 6412150, 3]);
  });
});
