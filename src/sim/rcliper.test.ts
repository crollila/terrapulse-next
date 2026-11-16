/**
 * R-CLIPER: the equations and constants of Tuleya et al. (2007) on hand-computed cases, then the
 * hindcast on Hurricane Harvey as regression values. The hindcast shows the model FAILS for Harvey;
 * these tests pin that failure so the app cannot quietly start presenting it as reliable.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  MM_PER_H_PER_IN_PER_DAY,
  RCLIPER_CARD,
  RCLIPER_MAX_RADIUS_KM,
  RCLIPER_NHC,
  RCLIPER_STEP_H,
  kraftMaxRainfallInches,
  normalisedWind,
  outsideFitRange,
  rcliperParams,
  rcliperRateMmH,
  rcliperTotalMm,
  scenarioRainfallMm,
  scenarioTrack,
  type StormSample,
} from "./rcliper";
import { SCENARIO_001, T_END_H, T_START_H } from "./hurricane";
import { interpolateTrack, type BestTrackFile } from "./hindcast";
import { recordWindow } from "./rainRecord";
import { total } from "./rainfall";
import type { RainAssetsFile } from "../data/rainfall";
import { destination } from "./geo";

const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")) as T;

describe("constants and parameters (Tuleya et al. 2007, Table 2, NHC rows)", () => {
  it("holds the eight printed constants", () => {
    expect(RCLIPER_NHC).toEqual({ a1: -1.1, b1: 3.96, a2: -1.6, b2: 4.8, a3: 64.5, b3: -13.0, a4: 150, b4: -16.0 });
    expect(MM_PER_H_PER_IN_PER_DAY).toBeCloseTo(1.058333, 6);
  });

  it("normalises wind so that 35 kt gives U = 1 and 68 kt gives U = 2", () => {
    expect(normalisedWind(35)).toBe(1);
    expect(normalisedWind(68)).toBe(2);
    expect(normalisedWind(101)).toBe(3);
  });

  it("gives the parameters by hand at U = 1 and U = 2", () => {
    const p1 = rcliperParams(35);
    expect(p1.t0).toBeCloseTo(2.86, 12);
    expect(p1.tm).toBeCloseTo(3.2, 12);
    expect(p1.rm).toBeCloseTo(51.5, 12);
    expect(p1.re).toBeCloseTo(134, 12);
    const p2 = rcliperParams(68);
    expect(p2.t0).toBeCloseTo(6.82, 12);
    expect(p2.tm).toBeCloseTo(8.0, 12);
    expect(p2.rm).toBeCloseTo(38.5, 12);
    expect(p2.re).toBeCloseTo(118, 12);
  });

  it("agrees with the same constants as reprinted in mm per hour (T0 = -1.16 + 4.19 U, Tm = -1.69 + 5.08 U)", () => {
    const c = RCLIPER_NHC;
    expect((c.a1 * MM_PER_H_PER_IN_PER_DAY).toFixed(2)).toBe("-1.16");
    expect((c.b1 * MM_PER_H_PER_IN_PER_DAY).toFixed(2)).toBe("4.19");
    expect((c.a2 * MM_PER_H_PER_IN_PER_DAY).toFixed(2)).toBe("-1.69");
    expect((c.b2 * MM_PER_H_PER_IN_PER_DAY).toFixed(2)).toBe("5.08");
  });
});

describe("rain-rate profile", () => {
  it("is T0 at the centre, Tm at rm, and Tm / e one e-folding radius farther out", () => {
    const k = MM_PER_H_PER_IN_PER_DAY;
    expect(rcliperRateMmH(0, 35)).toBeCloseTo(2.86 * k, 12);
    expect(rcliperRateMmH(51.5, 35)).toBeCloseTo(3.2 * k, 12);
    expect(rcliperRateMmH(51.5 + 134, 35)).toBeCloseTo((3.2 / Math.E) * k, 12);
    // half way to rm: the linear ramp
    expect(rcliperRateMmH(25.75, 35)).toBeCloseTo(((2.86 + 3.2) / 2) * k, 12);
  });

  it("is continuous at rm and decreases beyond it", () => {
    for (const v of [45, 80, 115, 140]) {
      const { rm } = rcliperParams(v);
      expect(rcliperRateMmH(rm - 1e-9, v)).toBeCloseTo(rcliperRateMmH(rm + 1e-9, v), 6);
      let prev = Infinity;
      for (let r = rm; r <= 500; r += 10) {
        const x = rcliperRateMmH(r, v);
        expect(x).toBeLessThanOrEqual(prev);
        expect(x).toBeGreaterThanOrEqual(0);
        prev = x;
      }
    }
  });

  it("rains harder in stronger storms at every radius inside 300 km", () => {
    for (const r of [0, 20, 50, 100, 200, 300]) expect(rcliperRateMmH(r, 115)).toBeGreaterThan(rcliperRateMmH(r, 45));
  });

  it("is zero beyond 500 km, for bad input, and where the fit breaks down", () => {
    expect(rcliperRateMmH(RCLIPER_MAX_RADIUS_KM, 100)).toBeGreaterThan(0);
    expect(rcliperRateMmH(RCLIPER_MAX_RADIUS_KM + 0.001, 100)).toBe(0);
    expect(rcliperRateMmH(-1, 100)).toBe(0);
    expect(rcliperRateMmH(10, Number.NaN)).toBe(0);
    // T0 turns negative below about 11 kt: never a negative rain rate
    expect(rcliperRateMmH(0, 5)).toBe(0);
    // rm = 64.5 - 13 U is not positive above about 165.7 kt: no extrapolation
    expect(rcliperParams(170).rm).toBeLessThan(0);
    expect(rcliperRateMmH(10, 170)).toBe(0);
    expect(outsideFitRange(44)).toBe(true);
    expect(outsideFitRange(45)).toBe(false);
    expect(outsideFitRange(115)).toBe(false);
    expect(outsideFitRange(116)).toBe(true);
  });
});

describe("storm-total integration", () => {
  const still = (hours: number, vmaxKt: number | null = 80): StormSample[] => Array.from({ length: hours * 2 + 1 }, (_, i) => ({ tH: i * 0.5, lat: 28, lon: -95, vmaxKt }));

  it("is rate times duration for a stationary storm", () => {
    expect(rcliperTotalMm(still(10), 28, -95)).toBeCloseTo(rcliperRateMmH(0, 80) * 10, 9);
    expect(rcliperTotalMm(still(24), 28, -95)).toBeCloseTo(2.4 * rcliperTotalMm(still(10), 28, -95), 9);
  });

  it("uses the trapezoid rule between samples", () => {
    const tr: StormSample[] = [{ tH: 0, lat: 28, lon: -95, vmaxKt: 45 }, { tH: 2, lat: 28, lon: -95, vmaxKt: 115 }];
    expect(rcliperTotalMm(tr, 28, -95)).toBeCloseTo(rcliperRateMmH(0, 45) + rcliperRateMmH(0, 115), 12);
  });

  it("attributes no rain to samples with unknown wind and rejects unordered tracks", () => {
    expect(rcliperTotalMm(still(10, null), 28, -95)).toBe(0);
    expect(rcliperTotalMm([], 28, -95)).toBe(0);
    expect(() => rcliperTotalMm([{ tH: 1, lat: 0, lon: 0, vmaxKt: 50 }, { tH: 1, lat: 0, lon: 0, vmaxKt: 50 }], 0, 0)).toThrow();
  });

  it("covers the scenario window at half-hour steps and is deterministic", () => {
    const tr = scenarioTrack(SCENARIO_001);
    expect(tr).toHaveLength((T_END_H - T_START_H) / RCLIPER_STEP_H + 1);
    expect(tr[0].tH).toBe(T_START_H);
    expect(tr[tr.length - 1].tH).toBe(T_END_H);
    expect(scenarioRainfallMm(SCENARIO_001, 29.76, -95.37)).toBe(scenarioRainfallMm(SCENARIO_001, 29.76, -95.37));
  });

  it("gives more rain near the track than far from it, and more for a slower storm", () => {
    const p = SCENARIO_001;
    const far = destination(p.landfallLat, p.landfallLon, p.headingDeg + 90, 400);
    const near = scenarioRainfallMm(p, p.landfallLat, p.landfallLon);
    expect(near).toBeGreaterThan(scenarioRainfallMm(p, far.lat, far.lon));
    expect(scenarioRainfallMm({ ...p, forwardSpeedKmh: 8 }, p.landfallLat, p.landfallLon)).toBeGreaterThan(near);
  });
});

describe("Kraft rule of thumb (Pfost 2000)", () => {
  it("is 100 divided by the forward speed in knots", () => {
    expect(kraftMaxRainfallInches(18.52)).toBeCloseTo(10, 12);
    expect(kraftMaxRainfallInches(9.26)).toBeCloseTo(20, 12);
    expect(kraftMaxRainfallInches(0)).toBeNull();
  });
});

describe("hindcast on Hurricane Harvey: the model fails (regression values)", () => {
  const storm = read<BestTrackFile>("public/data/hindcast/best_tracks.json").storms.find((s) => s.id === "AL092017")!;
  const rain = read<RainAssetsFile>("public/data/rainfall/harvey_2017_assets.json");
  const results = read<any>("research/rcliper_hindcast_results.json");
  const w = recordWindow(rain.meta.days);
  const track: StormSample[] = interpolateTrack(storm, RCLIPER_STEP_H)
    .filter((p) => p.timeMs >= w.startMs && p.timeMs <= w.startMs + w.hours * 3_600_000)
    .map((p) => ({ tH: (p.timeMs - w.startMs) / 3_600_000, lat: p.lat, lon: p.lon, vmaxKt: p.vmaxKt }));
  const rows = rain.assets.map((a) => ({ id: a.id, obs: total(a.stage4.dailyMm)!, mod: rcliperTotalMm(track, a.lat!, a.lon!) }));
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;

  it("produces a third of the observed rainfall over all sites", () => {
    expect(track).toHaveLength(481);
    expect(rows).toHaveLength(69);
    expect(mean(rows.map((r) => r.mod)) / mean(rows.map((r) => r.obs))).toBeCloseTo(0.332, 3);
    expect(results.allSites).toMatchObject({ n: 69, modelOverObservedVolume: 0.332, pearsonR: 0.224 });
  });

  it("produces about one sixth of it where more than 750 mm fell, and never more than 205 mm there", () => {
    const wet = rows.filter((r) => r.obs >= 750);
    expect(wet).toHaveLength(20);
    expect(mean(wet.map((r) => r.mod)) / mean(wet.map((r) => r.obs))).toBeCloseTo(0.162, 3);
    expect(Math.max(...wet.map((r) => r.mod))).toBeLessThan(205);
    expect(Math.min(...wet.map((r) => r.obs))).toBeGreaterThan(750);
    expect(results.sitesWithAtLeast750mmObserved).toMatchObject({ n: 20, modelOverObservedVolume: 0.162, pearsonR: -0.211 });
  });

  it("puts its rain in the wrong place: too much at Corpus Christi, far too little at Port Arthur", () => {
    const r = (id: string) => rows.find((x) => x.id === id)!;
    expect(r("eia-478-texas-corpus-christi").mod / r("eia-478-texas-corpus-christi").obs).toBeGreaterThan(1.5);
    expect(r("eia-507-texas-port-arthur").mod / r("eia-507-texas-port-arthur").obs).toBeLessThan(0.15);
  });

  it("is described as context only in its card", () => {
    expect(RCLIPER_CARD.status).toMatch(/context only/);
    expect(RCLIPER_CARD.status).toMatch(/no exposure is counted/);
  });
});
