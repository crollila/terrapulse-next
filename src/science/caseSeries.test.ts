/**
 * The featured investigations chart the team's independent GPCP and GISTEMP regional series. These
 * tests check that what the app recomputes from the shipped series agrees with the published
 * results it displays, so the charts and the headline numbers cannot drift apart.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildCaseSeries } from "../components/CaseStudy";
import type { MonthlyPoint } from "./stats";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../public/data/trends/${p}`, import.meta.url), "utf8"));
const mainPts = (a: any): MonthlyPoint[] => a.series.year.map((year: number, i: number) => ({ year, month: a.series.month[i], value: a.series.value[i] }));
const secondPts = (f: any, region: string): MonthlyPoint[] => f.year.map((year: number, i: number) => ({ year, month: f.month[i], value: f.regions[region][i] }));

describe("Amazon Rainfall Mystery: MERRA-2 against GPCP in the south-western Amazon box", () => {
  const a = read("analysis/rondonia/PRECTOTCORR.json");
  const gpcp = read("crosscheck/gpcp.json");
  const ki = a.crosscheck.known_issue;
  const s = buildCaseSeries(mainPts(a), secondPts(gpcp, "rondonia"), "raw", ki.break_year);

  it("the published headline numbers are the ones the brief quotes", () => {
    expect(a.trend.ols.slope_per_decade).toBeCloseTo(-0.541, 3);
    expect(a.crosscheck.trend.slope_per_decade).toBeCloseTo(-0.282, 3);
    expect(a.crosscheck.code).toBe("direction_only");
    expect(ki.break_year).toBe(2005);
    expect(ki.best_fit_break_year).toBe(2005);
  });
  it("the mean gap before and after 2005, recomputed from the shipped series, matches the published values", () => {
    // MERRA-2 values are published rounded to 4 decimals, so agreement is to about 1e-3
    expect(s.gapBefore!).toBeCloseTo(ki.gap_before, 3);
    expect(s.gapAfter!).toBeCloseTo(ki.gap_after, 3);
    expect(s.gapAfter! - s.gapBefore!).toBeLessThan(-0.8);
  });
  it("the GPCP trend refitted in the browser engine matches the published second-opinion trend", () => {
    expect(s.secondFit!.slope).toBeCloseTo(a.crosscheck.trend.slope_per_decade, 4);
    expect(s.mainFit!.slope).toBeCloseTo(a.trend.ols.slope_per_decade, 3);
  });
  it("both records decline; MERRA-2 declines about twice as fast", () => {
    expect(s.secondFit!.slope).toBeLessThan(0);
    expect(s.mainFit!.slope / s.secondFit!.slope).toBeGreaterThan(1.7);
    expect(s.mainFit!.slope / s.secondFit!.slope).toBeLessThan(2.2);
  });
  it("covers every year of the record in all three series", () => {
    for (const series of [s.main, s.second, s.diff]) {
      expect(series.length).toBe(45);
      expect(series[0].year).toBe(1981);
      expect(series[44].year).toBe(2025);
    }
  });
});

describe("Northern Alaska warming: MERRA-2 against GISTEMP", () => {
  const a = read("analysis/north-slope/T2M.json");
  const gis = read("crosscheck/gistemp.json");
  const s = buildCaseSeries(mainPts(a), secondPts(gis, "north-slope"), "anomaly", null);
  it("published result: supported by a second dataset, with overlapping ranges", () => {
    expect(a.crosscheck.code).toBe("agrees");
    expect(a.trend.ols.slope_per_decade).toBeCloseTo(0.51, 2);
    expect(a.crosscheck.trend.slope_per_decade).toBeCloseTo(0.41, 2);
    expect(a.crosscheck.trend.ci_high).toBeGreaterThan(a.trend.ols.ci_low);
    expect(a.crosscheck.known_issue).toBeUndefined();
  });
  it("the GISTEMP trend refitted in the browser engine matches the published one", () => {
    expect(s.secondFit!.slope).toBeCloseTo(a.crosscheck.trend.slope_per_decade, 4);
  });
  it("no break year means no before and after gap is reported", () => {
    expect(s.gapBefore).toBeNull();
    expect(s.gapAfter).toBeNull();
    expect(s.diff.length).toBe(45);
  });
});

describe("shipped second-opinion files", () => {
  it.each(["gpcp", "gistemp"])("%s: 540 months for all eight regions, values copied from the team's repository", (id) => {
    const f = read(`crosscheck/${id}.json`);
    expect(f.year.length).toBe(540);
    expect(Object.keys(f.regions).length).toBe(8);
    for (const v of Object.values(f.regions) as number[][]) expect(v.length).toBe(540);
    expect(f.meta.retrieved_utc).toMatch(/^2026-11-14/);
  });
});
