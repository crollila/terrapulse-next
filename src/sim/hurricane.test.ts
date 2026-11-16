import { describe, expect, it } from "vitest";
import {
  SCENARIO_001,
  assetExposure,
  hollandWindKt,
  posForHour,
  runScenario,
  saffirSimpsonCategory,
  stormCenter,
  swathPolygon,
  timelineState,
  validateParams,
  windRadiusKm,
  vmaxAtKt,
  DECAY_DEFAULTS,
  PHYSICAL_FRACTION,
  T_END_H,
  T_START_H,
} from "./hurricane";
import { destination, greatCircle, haversineKm } from "./geo";
import type { Port, Refinery } from "../data/types";

const P = SCENARIO_001;

describe("geo", () => {
  it("haversine: one degree of latitude is 111.195 km on the mean sphere", () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo((Math.PI / 180) * 6371.0088, 6);
  });
  it("haversine: quarter circumference from equator to pole", () => {
    expect(haversineKm(0, 0, 90, 0)).toBeCloseTo((Math.PI / 2) * 6371.0088, 6);
  });
  it("destination inverts haversine", () => {
    const d = destination(29.2, -94.95, 335, 250);
    expect(haversineKm(29.2, -94.95, d.lat, d.lon)).toBeCloseTo(250, 6);
  });
  it("great circle starts and ends at the endpoints", () => {
    const g = greatCircle(29.7, -95.3, 40.7, -74.0, 32);
    expect(g[0][0]).toBeCloseTo(-95.3, 9);
    expect(g.at(-1)![1]).toBeCloseTo(40.7, 9);
  });
});

describe("Holland (1980) wind profile", () => {
  it("equals Vmax exactly at Rmax", () => {
    expect(hollandWindKt(P.rmaxKm, P)).toBeCloseTo(P.vmaxKt, 10);
  });
  it("hand calculation: r = 2 Rmax, B = 1.5 gives Vmax * sqrt(2^-1.5 * e^(1 - 2^-1.5))", () => {
    const x = Math.pow(0.5, 1.5);
    expect(hollandWindKt(70, { vmaxKt: 140, rmaxKm: 35, hollandB: 1.5 })).toBeCloseTo(140 * Math.sqrt(x * Math.exp(1 - x)), 10);
    // worked by hand: x = 0.353553; e^(1-x) = e^0.646447 = 1.908740; product = 0.674841; sqrt = 0.821487; V = 115.008 kt
    expect(hollandWindKt(70, { vmaxKt: 140, rmaxKm: 35, hollandB: 1.5 })).toBeCloseTo(115.008, 2);
  });
  it("never exceeds Vmax and decreases monotonically outside Rmax", () => {
    let prev = Infinity;
    for (let r = P.rmaxKm; r < 1500; r += 5) {
      const v = hollandWindKt(r, P);
      expect(v).toBeLessThanOrEqual(P.vmaxKt + 1e-9);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
  it("wind radius solves V(r) = threshold", () => {
    const r64 = windRadiusKm(64, P)!;
    expect(hollandWindKt(r64, P)).toBeCloseTo(64, 6);
    expect(r64).toBeGreaterThan(P.rmaxKm);
    expect(windRadiusKm(64, { ...P, vmaxKt: 50 })).toBeNull();
  });
  it("a stronger storm has a larger hurricane-force radius", () => {
    expect(windRadiusKm(64, { ...P, vmaxKt: 150 })!).toBeGreaterThan(windRadiusKm(64, { ...P, vmaxKt: 100 })!);
  });
});

describe("Saffir-Simpson categories (NHC thresholds in kt)", () => {
  it.each([
    [63, 0],
    [64, 1],
    [82, 1],
    [83, 2],
    [95, 2],
    [96, 3],
    [112, 3],
    [113, 4],
    [136, 4],
    [137, 5],
    [175, 5],
  ])("%i kt is category %i", (kt, cat) => {
    expect(saffirSimpsonCategory(kt)).toBe(cat);
  });
});

describe("track and exposure", () => {
  it("centre is at the landfall point at t = 0 and moves speed * t", () => {
    const c0 = stormCenter(P, 0);
    expect(c0.lat).toBeCloseTo(P.landfallLat, 9);
    const c6 = stormCenter(P, 6);
    expect(haversineKm(P.landfallLat, P.landfallLon, c6.lat, c6.lon)).toBeCloseTo(P.forwardSpeedKmh * 6, 6);
  });
  it("an asset on the track at the landfall point peaks at Vmax-level wind near t = 0", () => {
    const e = assetExposure(P, P.landfallLat, P.landfallLon);
    // sampled every 0.25 h, the eyewall (Rmax = 35 km at 20 km/h) passes within one step of Rmax
    expect(e.peakWindKt).toBeGreaterThan(0.99 * P.vmaxKt);
    expect(Math.abs(e.tPeakH)).toBeLessThan(3);
    expect(e.exposureClass).toBe("major-hurricane-force");
    expect(e.tOnset34H!).toBeLessThan(e.tOnsetThresholdH!);
  });
  it("an asset 2000 km away is not exposed", () => {
    const e = assetExposure(P, 45, -70);
    expect(e.inFootprint).toBe(false);
    expect(e.exposureClass).toBe("none");
    expect(e.tOnset34H).toBeNull();
  });
  it("peak wind equals the profile evaluated at the closest approach (to sampling tolerance)", () => {
    const noDecay = { ...P, inlandDecay: false };
    const e = assetExposure(noDecay, 30.0, -93.9);
    expect(e.closestApproachKm).toBeGreaterThan(P.rmaxKm);
    expect(e.peakWindKt).toBeCloseTo(hollandWindKt(e.closestApproachKm, noDecay), 6);
  });
});

const R = (id: string, lat: number, lon: number, cap: number | null): Refinery => ({ id, name: id, company: "TestCo", lat, lon, capacityBpd: cap });
const refineries: Refinery[] = [R("near-a", 29.7, -95.2, 500_000), R("near-b", 29.4, -94.9, 250_000), R("near-null", 29.6, -95.0, null), R("far", 41.0, -74.0, 300_000)];
const ports: Port[] = [
  { id: "p-near", name: "Near", lat: 29.7, lon: -95.0, totalTons: 1_000_000 },
  { id: "p-far", name: "Far", lat: 47.6, lon: -122.3, totalTons: 2_000_000 },
];

describe("runScenario", () => {
  it("sums only capacities inside the footprint and reports unknowns", () => {
    const s = runScenario(P, refineries, ports);
    expect(s.category).toBe(5);
    expect(s.refineriesInFootprint.map((r) => r.id)).toEqual(["near-a", "near-b", "near-null"]);
    expect(s.capacityInFootprintBpd).toBe(750_000);
    expect(s.datasetCapacityBpd).toBe(1_050_000);
    expect(s.capacityShare).toBeCloseTo(750_000 / 1_050_000, 12);
    expect(s.footprintCapacityUnknown).toBe(1);
    expect(s.tonsInFootprint).toBe(1_000_000);
  });
  it("is deterministic", () => {
    expect(JSON.stringify(runScenario(P, refineries, ports))).toBe(JSON.stringify(runScenario({ ...P }, refineries, ports)));
  });
  it("parameters change outputs: a tropical storm puts nothing in a 64-kt footprint", () => {
    const s = runScenario({ ...P, vmaxKt: 50 }, refineries, ports);
    expect(s.capacityInFootprintBpd).toBe(0);
    expect(s.category).toBe(0);
    expect(s.firstThresholdH).toBeNull();
  });
  it("moving the landfall away removes the exposure", () => {
    const s = runScenario({ ...P, landfallLat: 25.8, landfallLon: -80.2, headingDeg: 300 }, refineries, ports);
    expect(s.refineriesInFootprint.length).toBe(0);
  });
  it("a lower threshold never reduces exposed capacity", () => {
    const a = runScenario({ ...P, exposureThresholdKt: 64 }, refineries, ports).capacityInFootprintBpd;
    const b = runScenario({ ...P, exposureThresholdKt: 34 }, refineries, ports).capacityInFootprintBpd;
    expect(b).toBeGreaterThanOrEqual(a);
  });
  it("rejects out-of-range inputs", () => {
    expect(validateParams({ ...P, vmaxKt: 400 }).length).toBe(1);
    expect(() => runScenario({ ...P, hollandB: 9 }, refineries, ports)).toThrow();
    expect(validateParams(P)).toEqual([]);
  });
});

describe("timeline", () => {
  const s = runScenario(P, refineries, ports);
  it("starts at the pre-event baseline and ends in recovery", () => {
    expect(timelineState(0, s).stage.key).toBe("baseline");
    expect(timelineState(0, s).tH).toBe(T_START_H);
    expect(timelineState(1, s).stage.key).toBe("recovery");
    expect(timelineState(1, s).tH).toBeNull();
  });
  it("the end of the physical part maps to the end of the modelled window", () => {
    expect(timelineState(PHYSICAL_FRACTION, s).tH).toBeCloseTo(T_END_H, 9);
  });
  it("stages never go backwards as the position advances", () => {
    let prev = -1;
    for (let x = 0; x <= 1.0001; x += 0.01) {
      const st = timelineState(x, s);
      expect(st.stageIndex).toBeGreaterThanOrEqual(prev);
      prev = st.stageIndex;
    }
    expect(prev).toBe(6);
  });
  it("landfall position round-trips", () => {
    expect(timelineState(posForHour(0), s).tH).toBeCloseTo(0, 9);
  });
  it("onset precedes exposure at the modelled hours", () => {
    expect(timelineState(posForHour(s.firstOnset34H! + 0.01), s).stage.key).toBe("onset");
    expect(timelineState(posForHour(s.firstThresholdH! + 0.01), s).stage.key).toBe("exposure");
  });
});

describe("inland decay (Kaplan and DeMaria 1995 form, R = 0.9)", () => {
  it("is constant before landfall and drops by the reduction factor just after it", () => {
    expect(vmaxAtKt(P, -10)).toBe(P.vmaxKt);
    expect(vmaxAtKt(P, 0)).toBe(P.vmaxKt);
    expect(vmaxAtKt(P, 1e-9)).toBeCloseTo(DECAY_DEFAULTS.reductionFactor * P.vmaxKt, 6);
  });
  it("hand calculation at 12 h: 26.7 + (0.9 * 140 - 26.7) * exp(-0.095 * 12) = 58.46 kt", () => {
    // exp(-1.14) = 0.319819; 99.3 * 0.319819 = 31.758; + 26.7 = 58.458
    expect(vmaxAtKt({ vmaxKt: 140, inlandDecay: true, decayRatePerH: 0.095 }, 12)).toBeCloseTo(58.458, 2);
  });
  it("tends to the background wind and never increases with time", () => {
    expect(vmaxAtKt(P, 500)).toBeCloseTo(DECAY_DEFAULTS.backgroundWindKt, 6);
    let prev = Infinity;
    for (let h = 0.01; h < 60; h += 0.5) {
      const v = vmaxAtKt(P, h);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
  });
  it("a weak storm below the background wind is only reduced, never raised", () => {
    expect(vmaxAtKt({ vmaxKt: 28, inlandDecay: true, decayRatePerH: 0.095 }, 20)).toBeCloseTo(25.2, 6);
  });
  it("switching decay off gives an upper bound on every asset's peak wind", () => {
    for (const [lat, lon] of [[30.5, -95.6], [32.3, -96.5], [29.7, -95.0], [35.0, -97.5]]) {
      const on = assetExposure(P, lat, lon).peakWindKt;
      const off = assetExposure({ ...P, inlandDecay: false }, lat, lon).peakWindKt;
      expect(on).toBeLessThanOrEqual(off + 1e-9);
    }
  });
  it("a point 600 km inland along the track is not at hurricane force with decay on", () => {
    const c = stormCenter(P, 30);
    expect(assetExposure(P, c.lat, c.lon).peakWindKt).toBeLessThan(64);
    expect(assetExposure({ ...P, inlandDecay: false }, c.lat, c.lon).peakWindKt).toBeGreaterThan(130);
  });
});

describe("swath polygon", () => {
  it("ends where the weakened wind field no longer reaches the threshold", () => {
    expect(swathPolygon(P, 96, 20, 30)).toBeNull();
    expect(swathPolygon({ ...P, inlandDecay: false }, 96, 20, 30)).not.toBeNull();
  });
  it("is closed and contains points near the track", () => {
    const ring = swathPolygon(P, 64, -10, 0)!;
    expect(ring[0]).toEqual(ring.at(-1));
    expect(ring.length).toBeGreaterThan(20);
    for (const [lon, lat] of ring) {
      const dA = haversineKm(lat, lon, stormCenter(P, -10).lat, stormCenter(P, -10).lon);
      const dB = haversineKm(lat, lon, P.landfallLat, P.landfallLon);
      expect(Math.min(dA, dB)).toBeLessThan(windRadiusKm(64, P)! + 200 + 1);
    }
  });
});
