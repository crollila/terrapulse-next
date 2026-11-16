/**
 * Rainfall screen: arithmetic on synthetic inputs with hand-computed answers. These tests prove the
 * calculations. They do not validate the screen as a predictor of flooding or shutdowns: see
 * research/RAINFALL_FLOOD.md. Tests on the bundled Harvey data are in rainfall.data.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  DURATIONS,
  MM_PER_INCH,
  RAIN_STOPS,
  accumulate,
  ariColor,
  ariLabel,
  ariReached,
  contingency,
  cumulative,
  fmtMm,
  inRainScreen,
  maxRunningTotal,
  rainColor,
  rainExposure,
  sampleGrid,
  screenSummary,
  total,
  type AssetRain,
  type Atlas14,
  type RainGridFile,
} from "./rainfall";

const ARI = [1, 2, 5, 10, 25, 50, 100, 200, 500, 1000];
/** A synthetic Atlas 14 table: every duration has depth = base * (index + 1). */
const atlas = (base: Record<string, number>, upperFactor = 1.3, lowerFactor = 0.8): Atlas14 => {
  const mk = (f: number) => Object.fromEntries(Object.entries(base).map(([k, b]) => [k, ARI.map((_, i) => b * (i + 1) * f)]));
  return { ariYears: ARI, mm: mk(1), upper90: mk(upperFactor), lower90: mk(lowerFactor) };
};
const BASE = { "24-hr": 100, "2-day": 110, "3-day": 120, "4-day": 130, "7-day": 150 };
const asset = (dailyMm: (number | null)[], a: Atlas14 | null = atlas(BASE), kind: "refinery" | "port" = "refinery", id = "x"): AssetRain => ({
  id,
  kind,
  stage4: { dailyMm, block3x3TotalMm: null },
  atlas14: a,
  nasa: null,
  elevationM: null,
  nfhl: null,
  hwm: { within2km: 0, within5km: 0, nearestKm: 99, withHeightWithin5km: 0, maxHeightFtWithin5km: null, medianHeightFtWithin5km: null },
});

describe("totals and running maxima", () => {
  it("sums a complete series and refuses a series with a gap", () => {
    expect(total([1, 2, 3.5])).toBe(6.5);
    expect(total([1, null, 3])).toBeNull();
    expect(total([])).toBe(0);
  });

  it("accumulates day by day and stays unknown after a gap", () => {
    expect(cumulative([10, 0, 5])).toEqual([10, 10, 15]);
    expect(cumulative([10, null, 5])).toEqual([10, null, null]);
  });

  it("finds the largest k-day total and where it starts", () => {
    const d = [0, 10, 300, 280, 240, 80, 0];
    expect(maxRunningTotal(d, 1)).toEqual({ mm: 300, startIndex: 2 });
    expect(maxRunningTotal(d, 2)).toEqual({ mm: 580, startIndex: 2 });
    expect(maxRunningTotal(d, 3)).toEqual({ mm: 820, startIndex: 2 });
    expect(maxRunningTotal(d, 4)).toEqual({ mm: 900, startIndex: 2 });
    expect(maxRunningTotal(d, 7)).toEqual({ mm: 910, startIndex: 0 });
  });

  it("skips windows with a missing day and returns null when no window is complete", () => {
    expect(maxRunningTotal([5, null, 7, 9], 2)).toEqual({ mm: 16, startIndex: 2 });
    expect(maxRunningTotal([5, null, 7], 2)).toBeNull();
    expect(maxRunningTotal([1, 2], 3)).toBeNull();
    expect(() => maxRunningTotal([1], 0)).toThrow();
    expect(() => maxRunningTotal([1], 1.5)).toThrow();
  });

  it("keeps the first of two equal maxima", () => {
    expect(maxRunningTotal([4, 4, 4], 1)).toEqual({ mm: 4, startIndex: 0 });
  });
});

describe("ariReached", () => {
  const depths = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  it("returns the largest tabulated interval whose depth is reached", () => {
    expect(ariReached(99.9, ARI, depths)).toBe(0);
    expect(ariReached(100, ARI, depths)).toBe(1);
    expect(ariReached(699.9, ARI, depths)).toBe(50);
    expect(ariReached(700, ARI, depths)).toBe(100);
    expect(ariReached(999, ARI, depths)).toBe(500);
  });
  it("never extrapolates beyond the table", () => {
    expect(ariReached(1000, ARI, depths)).toBe(1000);
    expect(ariReached(5000, ARI, depths)).toBe(1000);
  });
  it("rejects mismatched tables", () => {
    expect(() => ariReached(1, [1, 2], [1])).toThrow();
  });
});

describe("rainExposure", () => {
  // 1-day max 300 (base 100 -> index 2 -> ARI 5); 2-day 580 (base 110: 550 = index 4 = ARI 25, 660 > 580);
  // 3-day 820 (base 120: 720 = ARI 50 (index 5), 840 > 820); 4-day 900 (base 130: 780 = ARI 50, 910 > 900);
  // 7-day 910 (base 150: 900 = ARI 50, 1050 > 910).
  const e = rainExposure(asset([0, 10, 300, 280, 240, 80, 0]));

  it("classifies each duration against its own Atlas 14 row", () => {
    expect(e.durations.map((d) => d.key)).toEqual(DURATIONS.map((d) => d.key));
    expect(e.durations.map((d) => d.observedMm)).toEqual([300, 580, 820, 900, 910]);
    expect(e.durations.map((d) => d.ari)).toEqual([5, 25, 50, 50, 50]);
    expect(e.totalMm).toBe(910);
  });

  it("reports the peak interval and the duration that gives the largest ratio to the 100-year depth", () => {
    expect(e.peakAri).toBe(50);
    // ratios to the 100-year depth (index 6 -> base * 7): 3-day 820/840, 4-day 900/910, 7-day 910/1050
    expect(e.peakDuration).toBe("4-day");
    expect(e.peakRatioTo100yr).toBeCloseTo(900 / 910, 12);
    expect(e.durations[3].atlas100Mm).toBe(910);
  });

  it("uses the 90% bounds for a conservative and a liberal reading", () => {
    // upper bound = 1.3 x: 3-day depths 156 * (i + 1): 780 = index 4 (ARI 25), 936 > 820
    expect(e.durations[2].ariConservative).toBe(25);
    // lower bound = 0.8 x: 3-day depths 96 * (i + 1): 768 = index 7 (ARI 200), 864 > 820
    expect(e.durations[2].ariLiberal).toBe(200);
    expect(e.peakAriConservative).toBeLessThanOrEqual(e.peakAri!);
    expect(e.peakAriLiberal).toBeGreaterThanOrEqual(e.peakAri!);
  });

  it("scales rainfall for sensitivity without touching the input", () => {
    const a = asset([0, 10, 300, 280, 240, 80, 0]);
    const up = rainExposure(a, 1.2);
    expect(up.totalMm).toBeCloseTo(1092, 9);
    expect(up.peakAri).toBeGreaterThanOrEqual(e.peakAri!);
    expect(a.stage4.dailyMm[2]).toBe(300);
    expect(rainExposure(a, 0.5).peakAri).toBeLessThan(e.peakAri!);
  });

  it("leaves a site without Atlas 14 values or with gaps unclassified", () => {
    const noAtlas = rainExposure(asset([10, 20], null));
    expect(noAtlas.peakAri).toBeNull();
    expect(noAtlas.totalMm).toBe(30);
    expect(inRainScreen(noAtlas, 100)).toBeNull();
    const gaps = rainExposure(asset([null, null, null]));
    expect(gaps.peakAri).toBeNull();
    expect(gaps.totalMm).toBeNull();
  });
});

describe("screenSummary", () => {
  const heavy = [0, 10, 300, 280, 240, 80, 0]; // peak ARI 50
  const light = [0, 5, 20, 10, 0, 0, 0]; // below the 1-year depth
  const ex = [rainExposure(asset(heavy, atlas(BASE), "refinery", "a")), rainExposure(asset(heavy, atlas(BASE), "refinery", "b")), rainExposure(asset(light, atlas(BASE), "refinery", "c")), rainExposure(asset(heavy, atlas(BASE), "port", "p")), rainExposure(asset(heavy, null, "refinery", "u"))];
  const caps = [{ id: "a", capacityBpd: 100_000 }, { id: "b", capacityBpd: null }, { id: "c", capacityBpd: 50_000 }, { id: "u", capacityBpd: 70_000 }];

  it("sums capacity over refineries inside, counts unknown capacity and unclassified sites", () => {
    const s = screenSummary(ex, caps, 25);
    expect(s.inside).toEqual(["a", "b", "p"]);
    expect(s.unclassified).toEqual(["u"]);
    expect(s.capacityBpd).toBe(100_000);
    expect(s.capacityUnknown).toBe(1);
  });

  it("is monotonic in the threshold and ordered by reading", () => {
    const n = (ari: number, r: "estimate" | "conservative" | "liberal" = "estimate") => screenSummary(ex, caps, ari, r).inside.length;
    expect(n(10)).toBeGreaterThanOrEqual(n(25));
    expect(n(25)).toBeGreaterThanOrEqual(n(100));
    expect(n(100)).toBe(0);
    expect(n(100, "liberal")).toBe(3);
    expect(n(50, "conservative")).toBe(0);
    expect(n(25, "conservative")).toBe(3);
  });
});

describe("contingency", () => {
  it("scores a screen against a record over a stated universe", () => {
    const c = contingency(["a", "b", "c", "d", "e"], ["a", "b", "c", "zz"], ["b", "c", "d", "yy"]);
    expect(c.hits).toEqual(["b", "c"]);
    expect(c.misses).toEqual(["d"]);
    expect(c.falseAlarms).toEqual(["a"]);
    expect(c.correctNegatives).toEqual(["e"]);
    expect(c.hitRate).toBeCloseTo(2 / 3, 12);
    expect(c.falseAlarmRatio).toBeCloseTo(1 / 3, 12);
    expect(c.criticalSuccessIndex).toBeCloseTo(2 / 4, 12);
  });
  it("returns null scores when a denominator is empty", () => {
    const c = contingency(["a"], [], []);
    expect(c.hitRate).toBeNull();
    expect(c.falseAlarmRatio).toBeNull();
    expect(c.criticalSuccessIndex).toBeNull();
    expect(c.correctNegatives).toEqual(["a"]);
  });
});

describe("gridded field", () => {
  const g: RainGridFile = {
    meta: {},
    grid: { west: -96, south: 29, east: -95, north: 30, step: 0.5, nx: 2, ny: 2 },
    days: [
      { date: "d1", periodEnd: "", mm: [1, 2, 3, -1] },
      { date: "d2", periodEnd: "", mm: [10, 20, -1, 40] },
    ],
  };
  it("accumulates through a day and marks a cell unknown once any day is missing", () => {
    expect(Array.from(accumulate(g, -1))).toEqual([0, 0, 0, 0]);
    const d0 = accumulate(g, 0);
    expect([d0[0], d0[1], d0[2]]).toEqual([1, 2, 3]);
    expect(Number.isNaN(d0[3])).toBe(true);
    const d1 = accumulate(g, 1);
    expect([d1[0], d1[1]]).toEqual([11, 22]);
    expect(Number.isNaN(d1[2]) && Number.isNaN(d1[3])).toBe(true);
    expect(Array.from(accumulate(g, 9)).slice(0, 2)).toEqual([11, 22]);
  });
  it("samples the cell containing a point, row 0 being the southernmost", () => {
    const f = accumulate(g, 1);
    expect(sampleGrid(g.grid, f, 29.1, -95.9)).toBe(11);
    expect(sampleGrid(g.grid, f, 29.1, -95.1)).toBe(22);
    expect(sampleGrid(g.grid, f, 29.9, -95.9)).toBeNull();
    expect(sampleGrid(g.grid, f, 30.1, -95.9)).toBeNull();
    expect(sampleGrid(g.grid, f, 29.5, -96.1)).toBeNull();
  });
});

describe("presentation helpers", () => {
  it("picks the highest colour stop reached and nothing below the first", () => {
    expect(rainColor(24.9)).toBeNull();
    expect(rainColor(25)).toEqual(RAIN_STOPS[0].rgb);
    expect(rainColor(999)).toEqual(RAIN_STOPS[6].rgb);
    expect(rainColor(5000)).toEqual(RAIN_STOPS[RAIN_STOPS.length - 1].rgb);
    expect(RAIN_STOPS.map((s) => s.mm)).toEqual([...RAIN_STOPS.map((s) => s.mm)].sort((a, b) => a - b));
  });
  it("labels intervals without implying more than the table holds", () => {
    expect(ariLabel(null)).toBe("not classified");
    expect(ariLabel(0)).toBe("below the 1-year depth");
    expect(ariLabel(100)).toBe("at or above the 100-year depth");
    expect(ariLabel(1000)).toBe("at or above the 1,000-year depth");
    expect(ariColor(null)).not.toBe(ariColor(1000));
  });
  it("formats millimetres with inches", () => {
    expect(MM_PER_INCH).toBe(25.4);
    expect(fmtMm(254)).toBe("254 mm (10.0 in)");
    expect(fmtMm(null)).toBe("n/a");
  });
});
