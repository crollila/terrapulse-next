import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { averageRanks, coOccurringResponse, droughtClass, episodes, gringorten, hypotheticalDeficit, monthlyZ, standardisedIndex, trailingMean, type MonthlyValue } from "./drought";

const series = (values: (number | null)[], startYear = 2000, startMonth = 1): MonthlyValue[] =>
  values.map((value, i) => ({ year: startYear + Math.floor((startMonth - 1 + i) / 12), month: ((startMonth - 1 + i) % 12) + 1, value }));

/** One value per year for a single calendar month (January), k = 1. */
const januaries = (vals: number[]): MonthlyValue[] => vals.map((value, i) => ({ year: 2000 + i, month: 1, value }));

describe("building blocks", () => {
  it("trailing mean: hand calculation and missing handling", () => {
    expect(trailingMean(series([1, 2, 3, 6]), 3)).toEqual([null, null, 2, 11 / 3]);
    expect(trailingMean(series([1, null, 3, 6, 9]), 2)).toEqual([null, null, null, 4.5, 7.5]);
  });
  it("Gringorten plotting position: rank 3 of 5 is exactly one half", () => {
    expect(gringorten(3, 5)).toBeCloseTo(0.5, 15);
    expect(gringorten(1, 5)).toBeCloseTo(0.56 / 5.12, 15);
    expect(gringorten(1, 5) + gringorten(5, 5)).toBeCloseTo(1, 15);
  });
  it("average ranks with ties", () => {
    expect(averageRanks([10, 20, 20, 5])).toEqual([2, 3.5, 3.5, 1]);
  });
  it("drought classes follow McKee et al. (1993)", () => {
    expect(droughtClass(-0.99)).toBe("none");
    expect(droughtClass(-1.0)).toBe("moderate");
    expect(droughtClass(-1.5)).toBe("severe");
    expect(droughtClass(-2.0)).toBe("extreme");
    expect(droughtClass(null)).toBe("none");
  });
});

describe("standardised index", () => {
  it("five years, one calendar month: the median year is 0 and the tails are symmetric", () => {
    const s = januaries([3, 1, 5, 2, 4]);
    const { index, nByMonth } = standardisedIndex(s, 1);
    expect(nByMonth[0]).toBe(5);
    expect(index[0]).toBeCloseTo(0, 12); // value 3 is the median
    expect(index[1]!).toBeCloseTo(-index[2]!, 12); // driest and wettest mirror each other
    // rank 1 of 5: p = 0.109375; the standard normal quantile is -1.2299 (tables: Phi(-1.23) = 0.1093)
    expect(index[1]!).toBeCloseTo(-1.2299, 3);
  });
  it("is monotone in the accumulated value within a calendar month", () => {
    const s = januaries([7, 2, 9, 4, 11, 1, 6]);
    const { index } = standardisedIndex(s, 1);
    const order = s.map((x, i) => [x.value as number, index[i] as number]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < order.length; i++) expect(order[i][1]).toBeGreaterThan(order[i - 1][1]);
  });
  it("compares each month only with the same calendar month", () => {
    // wet Januaries, dry Julys: a normal July must not look like a drought
    const vals: number[] = [];
    for (let y = 0; y < 6; y++) for (let m = 1; m <= 12; m++) vals.push(m === 1 ? 100 + y : m === 7 ? 1 + y : 50);
    const s = series(vals);
    const { index } = standardisedIndex(s, 1);
    const julyMedianYear = s.findIndex((x) => x.month === 7 && x.year === 2002);
    expect(Math.abs(index[julyMedianYear]!)).toBeLessThan(0.5);
  });
});

describe("episodes", () => {
  it("finds runs at or below the threshold that last long enough", () => {
    const s = series(new Array(10).fill(1));
    const idx = [0, -1.2, -1.6, -1.1, 0.2, -1.3, -1.4, 0, -2.1, -1.0];
    const ep = episodes(s, idx, -1, 3);
    expect(ep.length).toBe(1);
    expect(ep[0]).toMatchObject({ start: "2000-02", end: "2000-04", months: 3, peak: -1.6, peakMonth: "2000-03" });
    expect(ep[0].mean).toBeCloseTo(-1.3, 12);
    expect(episodes(s, idx, -1, 2).length).toBe(3);
  });
});

describe("hypothetical deficit", () => {
  const s = januaries([10, 20, 30, 40, 50]); // normal = 30
  it("places the what-if by counting years, with a hand-checked case", () => {
    const h = hypotheticalDeficit(s, 1, 1, 0.5)!; // value 15: one year (10) at or below
    expect(h.normal).toBe(30);
    expect(h.value).toBe(15);
    expect(h.yearsAtOrBelow).toBe(1);
    expect(h.nYears).toBe(5);
    expect(h.beyondRecord).toBe(false);
    // rank 1.5 of 5: p = 1.06 / 5.12 = 0.20703; quantile about -0.817
    expect(h.index!).toBeCloseTo(-0.817, 2);
  });
  it("normal rainfall sits near the middle; drier is never ranked higher", () => {
    expect(Math.abs(hypotheticalDeficit(s, 1, 1, 1)!.index!)).toBeLessThan(0.3);
    let prev = Infinity;
    for (const f of [1.2, 1, 0.8, 0.6, 0.4]) {
      const h = hypotheticalDeficit(s, 1, 1, f)!;
      const z = h.index ?? -Infinity;
      expect(z).toBeLessThanOrEqual(prev);
      prev = z;
    }
  });
  it("a what-if drier than every year is reported as beyond the record, with no index", () => {
    const h = hypotheticalDeficit(s, 1, 1, 0.2)!; // value 6 < 10
    expect(h.beyondRecord).toBe(true);
    expect(h.index).toBeNull();
    expect(h.yearsAtOrBelow).toBe(0);
    expect(h.recordFloor).toBeCloseTo(-1.2299, 3);
  });
  it("needs at least two years", () => {
    expect(hypotheticalDeficit(januaries([5]), 1, 1, 0.5)).toBeNull();
  });
});

describe("co-occurring response", () => {
  it("monthly z-scores: hand calculation", () => {
    const z = monthlyZ(januaries([1, 2, 3]));
    expect(z[0]).toBeCloseTo(-1, 12);
    expect(z[1]).toBeCloseTo(0, 12);
    expect(z[2]).toBeCloseTo(1, 12);
  });
  it("takes the other variable only in months at or below the level", () => {
    const s = januaries([1, 2, 3, 4, 5]);
    const idx = [-2, -1.5, 0, 1, 2];
    const other = januaries([10, 20, 30, 40, 50]);
    const r = coOccurringResponse(s, idx, other, [-1.3, -0.6, 0, 0.6, 1.3], -1);
    expect(r.n).toBe(2);
    expect(r.median).toBeCloseTo(-0.95, 12);
  });
});

describe("on the committed NASA regional series", () => {
  const load = (region: string, v: string): MonthlyValue[] => {
    const a = JSON.parse(readFileSync(new URL(`../../public/data/trends/analysis/${region}/${v}.json`, import.meta.url), "utf8"));
    return a.series.year.map((year: number, i: number) => ({ year, month: a.series.month[i], value: a.series.value[i] }));
  };
  it("the 12-month index has zero median and stays inside what 45 years can express", () => {
    const p = load("murray-darling", "PRECTOTCORR");
    const { index, nByMonth } = standardisedIndex(p, 12);
    const vals = index.filter((z): z is number => z !== null).sort((a, b) => a - b);
    expect(vals.length).toBe(540 - 11);
    expect(Math.abs(vals[Math.floor(vals.length / 2)])).toBeLessThan(0.1);
    expect(vals[0]).toBeGreaterThan(-2.4);
    expect(nByMonth.every((n) => n === 44 || n === 45)).toBe(true);
  });
  it("is deterministic and finds multi-month dry episodes in every region", () => {
    for (const region of ["murray-darling", "upper-colorado", "central-sahel"]) {
      const p = load(region, "PRECTOTCORR");
      const a = standardisedIndex(p, 12);
      const b = standardisedIndex(p, 12);
      expect(a.index).toEqual(b.index);
      expect(episodes(p, a.index, -1, 3).length).toBeGreaterThan(0);
    }
  });
  it("soil wetness is lower than usual in dry months (association check on real data)", () => {
    const p = load("murray-darling", "PRECTOTCORR");
    const soil = load("murray-darling", "GWETROOT");
    const { index } = standardisedIndex(p, 12);
    const r = coOccurringResponse(p, index, soil, monthlyZ(soil), -1);
    expect(r.n).toBeGreaterThan(20);
    expect(r.median!).toBeLessThan(0);
  });
});
