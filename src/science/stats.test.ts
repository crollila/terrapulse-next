/**
 * Proof that src/science/stats.ts reproduces the published TerraPulse numbers.
 *
 * Three kinds of evidence:
 *  1. Distribution functions against textbook values and scipy 1.18.1.
 *  2. Fixed synthetic series: expected values were produced by running the
 *     ORIGINAL Python (backend/terrapulse/stats.py, numpy 2.5.2, scipy 1.18.1)
 *     on the same inputs. Nothing here was typed in by hand to fit.
 *  3. All 48 published analysis files (8 regions x 6 variables): the full-record
 *     trend, every date window, anomalies and climatology are recomputed from
 *     `series.value` and compared with the published blocks.
 *
 * About tolerances. The original pipeline computes from region means stored
 * with 5 decimals, but the published JSON stores `series.value` rounded to
 * (variable.decimals + 1) decimals:
 *   - GWETROOT and NDVI (decimals 4 -> 5 stored): the JSON inputs are EXACT, so
 *     the port must agree to 1e-9 relative. This is the strict proof.
 *   - T2M (3 stored), PRECTOTCORR / QV2M / WS10M (4 stored): the JSON inputs
 *     are rounded, so recomputing from them cannot reproduce the published
 *     numbers to more than a few digits no matter how exact the port is. For
 *     these, tolerances are looser and the reason is stated at each constant.
 *   - If the original repository is present beside this app
 *     (../_reference/terrapulse-original), the unrounded CSVs are read from it
 *     and all 40 MERRA-2 files must ALSO agree to 1e-9. That block is skipped
 *     (visibly) when the folder is absent, e.g. in a deployed checkout.
 */
import { afterAll, describe, expect, it } from "vitest";
import {
  ALPHA,
  MIN_VALID_POINTS,
  MIN_WINDOW_YEARS,
  TREND_METHOD,
  allWindows,
  analyzeTrend,
  deseasonalize,
  erfc,
  lag1Autocorrelation,
  lag1AutocorrelationAt,
  levelShift,
  levelShiftTest,
  logGamma,
  mannKendall,
  normalCdf,
  normalQuantile,
  normalSf,
  olsTrend,
  regularizedIncompleteBeta,
  studentTCdf,
  studentTQuantile,
  studentTTwoSidedP,
  summarizeWindows,
  theilSen,
  windowTrend,
  yearsToDetect,
  type MonthlyPoint,
  type TrendResult,
} from "./stats";

// ---------------------------------------------------------------------------
// File access. @types/node is not installed in this project, so node:fs is
// loaded through a non-literal specifier and typed with the three calls used.
// ---------------------------------------------------------------------------

interface NodeFs {
  readFileSync(path: URL, encoding: "utf8"): string;
  readdirSync(path: URL): string[];
  existsSync(path: URL): boolean;
}
const fsSpecifier: string = "node:fs";
const fs = (await import(/* @vite-ignore */ fsSpecifier)) as NodeFs;

const REPO_ROOT = new URL("../../", import.meta.url);
const ANALYSIS_DIR = new URL("public/data/trends/analysis/", REPO_ROOT);
const REFERENCE_DATA = new URL("../_reference/terrapulse-original/backend/data/", REPO_ROOT);

interface PublishedWindow {
  start: number;
  end: number;
  slope_per_decade: number;
  intercept: number;
  ci_low: number;
  ci_high: number;
  p_value: number;
  significant: boolean;
}
interface PublishedTrend {
  start: number;
  end: number;
  n_months: number;
  ols: {
    slope_per_decade: number;
    intercept: number;
    r_squared: number;
    ci_low: number;
    ci_high: number;
    p_value: number;
    naive_ci_low: number;
    naive_ci_high: number;
    naive_p_value: number;
  };
  theil_sen: { slope_per_decade: number; ci_low: number | null; ci_high: number | null };
  mann_kendall: { tau: number; p_value: number; classic_p_value: number; variance_factor: number };
  noise: { residual_std: number; lag1_autocorrelation: number; n_effective: number };
  detectability: {
    years_needed: number | null;
    low: number | null;
    high: number | null;
    record_years: number;
    more_years: number | null;
  };
}
interface PublishedSubTrend {
  slope_per_decade: number;
  ci_low: number;
  ci_high: number;
  p_value: number;
  significant: boolean;
}
interface PublishedKnownIssue {
  break_year?: number;
  gap_before?: number;
  gap_after?: number;
  step?: { value: number; ci_low: number; ci_high: number; p_value: number };
  drift_per_decade?: { value: number; ci_low: number; ci_high: number };
  best_fit_break_year?: number;
  periods?: {
    start: number;
    end: number;
    main: PublishedSubTrend;
    independent: PublishedSubTrend;
    ranges_overlap: boolean;
  }[];
}
interface PublishedAnalysis {
  variable: { id: string; decimals: number };
  period: [number, number];
  series: {
    t: number[];
    year: number[];
    month: number[];
    value: (number | null)[];
    anomaly: (number | null)[];
    climatology: (number | null)[];
  };
  trend: PublishedTrend;
  windows: PublishedWindow[];
  windows_summary: {
    n_windows: number;
    min_years: number;
    share_same_direction: number;
    share_significant_same_direction: number;
    share_significant_opposite_direction: number;
    slope_min: number;
    slope_max: number;
  };
  verdict: { code: string };
  crosscheck: { code: string; known_issue?: PublishedKnownIssue };
  quality: { months_used: number; calendar_months_excluded: number[] };
}

interface Case {
  region: string;
  variable: string;
  data: PublishedAnalysis;
  points: MonthlyPoint[];
  /** True when the JSON stores the inputs at the original 5 decimals. */
  exactInputs: boolean;
}

/** The original region means have 5 decimals (backend/data/processed, backend/data/ndvi). */
const SOURCE_DECIMALS = 5;

function pointsOf(data: PublishedAnalysis): MonthlyPoint[] {
  return data.series.year.map((year, i) => ({
    year,
    month: data.series.month[i],
    value: data.series.value[i],
  }));
}

const CASES: Case[] = [];
for (const region of fs.readdirSync(ANALYSIS_DIR).sort()) {
  const dir = new URL(`${region}/`, ANALYSIS_DIR);
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith(".json")) continue;
    const data = JSON.parse(fs.readFileSync(new URL(file, dir), "utf8")) as PublishedAnalysis;
    CASES.push({
      region,
      variable: file.replace(/\.json$/, ""),
      data,
      points: pointsOf(data),
      exactInputs: data.variable.decimals + 1 >= SOURCE_DECIMALS,
    });
  }
}

// ---------------------------------------------------------------------------
// Error bookkeeping: the largest error seen for each quantity is printed at the
// end, so the report always shows how close the port actually is.
// ---------------------------------------------------------------------------

const maxima = new Map<string, Map<string, number>>();
function record(group: string, quantity: string, err: number): void {
  let g = maxima.get(group);
  if (!g) {
    g = new Map();
    maxima.set(group, g);
  }
  g.set(quantity, Math.max(g.get(quantity) ?? 0, err));
}

function relErr(actual: number, expected: number): number {
  if (actual === expected) return 0;
  return Math.abs(actual - expected) / Math.abs(expected);
}

/** |actual - expected| relative to max(|expected|, scale). */
function scaledErr(actual: number, expected: number, scale: number): number {
  if (actual === expected) return 0;
  return Math.abs(actual - expected) / Math.max(Math.abs(expected), scale);
}

function logErr(actual: number, expected: number): number {
  if (actual === expected) return 0;
  return Math.abs(Math.log(actual) - Math.log(expected));
}

afterAll(() => {
  const lines: string[] = ["", "Largest observed error per quantity (port vs published):"];
  for (const [group, g] of maxima) {
    lines.push(`  ${group}`);
    for (const [q, e] of g) lines.push(`    ${q.padEnd(34)} ${e.toExponential(2)}`);
  }
  console.log(lines.join("\n"));
});

// ---------------------------------------------------------------------------
// 1. Distribution functions
// ---------------------------------------------------------------------------

describe("distribution functions", () => {
  it("log-gamma matches known values", () => {
    expect(logGamma(1)).toBeCloseTo(0, 14);
    expect(logGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 14);
    expect(logGamma(5)).toBeCloseTo(Math.log(24), 13);
    expect(logGamma(10.5)).toBeCloseTo(13.940625219403763, 12); // ln Gamma(10.5)
    expect(relErr(logGamma(171), 706.5730622457874)).toBeLessThan(1e-14); // ln 170!
  });

  it("regularized incomplete beta matches closed forms", () => {
    // I_x(1, 1) = x ; I_x(2, 1) = x^2 ; I_x(1, 3) = 1 - (1 - x)^3 ; I_x(1/2, 1/2) = (2/pi) asin(sqrt x)
    for (const x of [0.01, 0.2, 0.5, 0.77, 0.999]) {
      expect(relErr(regularizedIncompleteBeta(x, 1, 1), x)).toBeLessThan(1e-13);
      expect(relErr(regularizedIncompleteBeta(x, 2, 1), x * x)).toBeLessThan(1e-13);
      expect(relErr(regularizedIncompleteBeta(x, 1, 3), 1 - (1 - x) ** 3)).toBeLessThan(1e-13);
      expect(
        relErr(regularizedIncompleteBeta(x, 0.5, 0.5), (2 / Math.PI) * Math.asin(Math.sqrt(x))),
      ).toBeLessThan(1e-13);
    }
    expect(regularizedIncompleteBeta(0, 2, 3)).toBe(0);
    expect(regularizedIncompleteBeta(1, 2, 3)).toBe(1);
  });

  it("erfc and the normal distribution match textbook values", () => {
    expect(erfc(0)).toBe(1);
    expect(relErr(erfc(1), 0.15729920705028513)).toBeLessThan(1e-14);
    expect(relErr(erfc(-1), 1.8427007929497148)).toBeLessThan(1e-14);
    // Textbook: P(Z > 1.96) = 0.0249979, P(Z <= 1) = 0.8413447, P(Z > 3) = 0.0013499
    expect(normalSf(1.96)).toBeCloseTo(0.0249979, 7);
    expect(normalCdf(1)).toBeCloseTo(0.8413447, 7);
    expect(normalSf(3)).toBeCloseTo(0.0013499, 7);
    // scipy.stats.norm.sf, including the far tail used by Mann-Kendall p-values.
    const sf: [number, number][] = [
      [0.0, 0.5],
      [0.5, 0.3085375387259869],
      [1.0, 0.15865525393145707],
      [1.959963984540054, 0.025],
      [3.0, 0.0013498980316300933],
      [6.0, 9.865876450376946e-10],
      [13.2, 4.386752713074249e-40],
      [30.0, 4.906713927147908e-198],
      [-1.5, 0.9331927987311419],
    ];
    // 1e-12 rather than 1e-13: at z = 30 (p ~ 5e-198) exp(-z^2 / 2) alone carries ~2e-13.
    for (const [z, expected] of sf) expect(relErr(normalSf(z), expected)).toBeLessThan(1e-12);
  });

  it("normal quantile matches textbook values", () => {
    // Textbook: z(0.975) = 1.959964, z(0.9) = 1.281552, z(0.999) = 3.090232
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 6);
    expect(normalQuantile(0.9)).toBeCloseTo(1.281552, 6);
    expect(normalQuantile(0.999)).toBeCloseTo(3.090232, 6);
    const ppf: [number, number][] = [
      [0.975, 1.959963984540054],
      [0.025, -1.9599639845400545],
      [0.9, 1.2815515655446004],
      [0.999, 3.090232306167813],
      [1e-10, -6.361340902404056],
      [0.3, -0.5244005127080409],
    ];
    for (const [p, expected] of ppf) expect(relErr(normalQuantile(p), expected)).toBeLessThan(1e-13);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 15);
    expect(normalQuantile(0)).toBe(-Infinity);
    expect(normalQuantile(1)).toBe(Infinity);
    for (const p of [1e-12, 0.001, 0.2, 0.5, 0.8, 0.99999]) {
      expect(relErr(normalCdf(normalQuantile(p)), p)).toBeLessThan(1e-12);
    }
  });

  it("Student t critical values match the textbook table (two-sided 5%)", () => {
    // Standard t table, 0.975 quantile.
    const table: [number, number][] = [
      [1, 12.706],
      [2, 4.303],
      [5, 2.571],
      [10, 2.228],
      [20, 2.086],
      [30, 2.042],
      [60, 2.0],
      [120, 1.98],
    ];
    for (const [df, expected] of table) expect(studentTQuantile(0.975, df)).toBeCloseTo(expected, 3);
    // scipy.stats.t.ppf, including fractional degrees of freedom (n_eff - 2 is never an integer).
    const ppf: [number, number, number][] = [
      [0.975, 1, 12.706204736174694],
      [0.975, 2, 4.302652729749462],
      [0.975, 2.5, 3.5746548420036817],
      [0.975, 10, 2.2281388519862744],
      [0.975, 30, 2.0422724563012378],
      [0.975, 55.04873202567056, 2.0040049077651747],
      [0.975, 288.9932536931077, 1.9682066287115596],
      [0.975, 538, 1.9643831785004149],
      [0.9, 5, 1.4758840488244815],
      [0.995, 12.3, 3.0410295709435236],
      [0.6, 3, 0.27667066233268983],
      [0.025, 7, -2.364624251592784],
      [0.99999, 4.5, 18.567279910716753],
    ];
    for (const [p, df, expected] of ppf) {
      expect(relErr(studentTQuantile(p, df), expected)).toBeLessThan(1e-12);
    }
    expect(studentTQuantile(0.5, 7)).toBe(0);
  });

  it("Student t tail probabilities match closed forms and scipy", () => {
    // df = 1 is the Cauchy distribution: P(T <= 1) = 3/4. df = 2: P(T <= t) = 1/2 + t / (2 sqrt(2 + t^2)).
    expect(studentTCdf(1, 1)).toBeCloseTo(0.75, 14);
    expect(studentTCdf(1.5, 2)).toBeCloseTo(0.5 + 1.5 / (2 * Math.sqrt(2 + 2.25)), 14);
    expect(studentTCdf(-1.5, 2)).toBeCloseTo(0.5 - 1.5 / (2 * Math.sqrt(2 + 2.25)), 14);
    expect(studentTTwoSidedP(0, 9)).toBe(1);
    // 2 * scipy.stats.t.sf(x, df), down to 1e-163.
    const twoSided: [number, number, number][] = [
      [0.5, 3, 0.651447964848151],
      [2.228138851986274, 10, 0.050000000000000044],
      [1.0, 1, 0.5000000000000001],
      [10.6, 288.9932536931077, 2.1525522953468072e-22],
      [15.0, 538, 9.570778558842895e-43],
      [40.0, 538, 2.5549451541257273e-163],
      [3.3, 53.05, 0.0017323355400552462],
      [0.001, 20, 0.9992120229664732],
      [7.5, 2.2, 0.013192860821244544],
    ];
    for (const [x, df, expected] of twoSided) {
      expect(relErr(studentTTwoSidedP(x, df), expected)).toBeLessThan(1e-11);
      expect(relErr(studentTTwoSidedP(-x, df), expected)).toBeLessThan(1e-11);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Synthetic series with answers from the original Python
// ---------------------------------------------------------------------------

/**
 * 300 months from January 1990: three sinusoids, a drift and a 0.8 step in 2003.
 * Expected values below are the output of the original stats.py on this series.
 */
function syntheticSeries(): { t: number[]; year: number[]; y: number[]; yGap: number[] } {
  const t: number[] = [];
  const year: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 300; i++) {
    const yr = 1990 + Math.floor(i / 12);
    const month = (i % 12) + 1;
    year.push(yr);
    t.push(yr + (month - 0.5) / 12.0);
    y.push(
      0.3 * Math.sin(i * 1.7) +
        0.2 * Math.cos(i * 0.37) +
        0.15 * Math.sin(i * 0.05) +
        0.004 * i +
        (yr >= 2003 ? 0.8 : 0.0),
    );
  }
  const yGap = y.slice();
  for (const i of [5, 6, 7, 40, 41, 120, 200, 201, 202, 203, 250]) yGap[i] = NaN;
  return { t, year, y, yGap };
}

describe("synthetic series against the original Python output", () => {
  const { t, year, y, yGap } = syntheticSeries();
  const TOL = 1e-9;

  it("builds the same inputs as the Python fixture", () => {
    const first5 = [0.2, 0.4954617876475492, 0.09400639363489244, -0.15439638147893844, 0.21216872985370355];
    first5.forEach((v, i) => expect(relErr(y[i], v)).toBeLessThan(1e-12));
  });

  it("least squares with gaps (gap-aware lag-1, AR(1) adjustment)", () => {
    const fit = olsTrend(t, yGap);
    expect(fit).not.toBeNull();
    if (!fit) return;
    expect(fit.n).toBe(289);
    expect(relErr(fit.slope, 0.09476621224468552)).toBeLessThan(TOL);
    expect(relErr(fit.intercept, -188.77323806230845)).toBeLessThan(TOL);
    expect(relErr(fit.rSquared, 0.7939763200850217)).toBeLessThan(TOL);
    expect(relErr(fit.residualStd, 0.34754662223758626)).toBeLessThan(TOL);
    expect(relErr(fit.lag1, 0.5498726540582126)).toBeLessThan(TOL);
    expect(relErr(fit.nEffective, 83.93386555763473)).toBeLessThan(TOL);
    expect(relErr(fit.naive.se, 0.0028494915217105884)).toBeLessThan(TOL);
    expect(relErr(fit.naive.ciLow, 0.08915766034271257)).toBeLessThan(TOL);
    expect(relErr(fit.naive.ciHigh, 0.10037476414665848)).toBeLessThan(TOL);
    expect(logErr(fit.naive.pValue, 1.8596771904712373e-100)).toBeLessThan(1e-7);
    expect(relErr(fit.adjusted.se, 0.00533306153814806)).toBeLessThan(TOL);
    expect(relErr(fit.adjusted.ciLow, 0.08415692574963582)).toBeLessThan(TOL);
    expect(relErr(fit.adjusted.ciHigh, 0.10537549873973523)).toBeLessThan(TOL);
    expect(logErr(fit.adjusted.pValue, 7.69017761376589e-30)).toBeLessThan(1e-7);
  });

  it("Mann-Kendall, classic and Hamed-Rao (24 lags, and all lags unclamped)", () => {
    const mk = mannKendall(yGap);
    expect(mk).not.toBeNull();
    if (!mk) return;
    expect(mk.n).toBe(289);
    expect(mk.s).toBe(27742);
    expect(relErr(mk.tau, 0.6666186082276048)).toBeLessThan(TOL);
    expect(relErr(mk.classicZ, 16.895806311626906)).toBeLessThan(TOL);
    expect(logErr(mk.classicPValue, 4.830649058691397e-64)).toBeLessThan(1e-7);
    expect(relErr(mk.hamedRaoZ, 4.6036066722926385)).toBeLessThan(TOL);
    expect(logErr(mk.hamedRaoPValue, 4.152363559528503e-6)).toBeLessThan(1e-7);
    expect(relErr(mk.varianceFactor, 13.469808544384044)).toBeLessThan(TOL);

    const all = mannKendall(yGap, ALPHA, null, false);
    expect(all).not.toBeNull();
    if (!all) return;
    expect(relErr(all.hamedRaoZ, 6.313593371268725)).toBeLessThan(TOL);
    expect(logErr(all.hamedRaoPValue, 2.726297085480466e-10)).toBeLessThan(1e-7);
    expect(relErr(all.varianceFactor, 7.161510439225673)).toBeLessThan(TOL);
  });

  it("Mann-Kendall and Theil-Sen with tied values", () => {
    const tied = y.map((v) => {
      // numpy.round(y, 1): round half to even on the scaled value.
      const s = v * 10;
      const f = Math.floor(s);
      const d = s - f;
      const r = d < 0.5 ? f : d > 0.5 ? f + 1 : f % 2 === 0 ? f : f + 1;
      return r / 10;
    });
    const mk = mannKendall(tied);
    expect(mk).not.toBeNull();
    if (!mk) return;
    expect(mk.n).toBe(300);
    expect(mk.s).toBe(30056);
    expect(relErr(mk.tau, 0.6701449275362319)).toBeLessThan(TOL);
    expect(relErr(mk.classicZ, 17.330612597390527)).toBeLessThan(TOL);
    expect(relErr(mk.hamedRaoZ, 4.806576315030663)).toBeLessThan(TOL);
    expect(relErr(mk.varianceFactor, 13.00038291973803)).toBeLessThan(TOL);
    const sen = theilSen(t, tied);
    expect(relErr(sen.slope, 0.09333333333333332)).toBeLessThan(TOL);
    expect(relErr(sen.intercept, -185.99999999999997)).toBeLessThan(TOL);
    expect(relErr(sen.ciLow, 0.08744939271255092)).toBeLessThan(TOL);
    expect(relErr(sen.ciHigh, 0.09896907216494798)).toBeLessThan(TOL);
  });

  it("Theil-Sen slope and rank-based interval with gaps", () => {
    const sen = theilSen(t, yGap);
    expect(relErr(sen.slope, 0.09385361400709369)).toBeLessThan(TOL);
    expect(relErr(sen.intercept, -187.0120679122036)).toBeLessThan(TOL);
    expect(relErr(sen.ciLow, 0.08785163750926629)).toBeLessThan(TOL);
    expect(relErr(sen.ciHigh, 0.09965974560130315)).toBeLessThan(TOL);
  });

  it("level shift at a known date, with drift and gaps", () => {
    const fit = levelShift(
      t,
      yGap,
      year.map((yr) => yr >= 2003),
    );
    expect(fit).not.toBeNull();
    if (!fit) return;
    expect(fit.n).toBe(289);
    expect(relErr(fit.step.value, 0.8233542001588167)).toBeLessThan(TOL);
    expect(relErr(fit.step.se, 0.09262664724442046)).toBeLessThan(TOL);
    expect(relErr(fit.step.ciLow, 0.6402542505242599)).toBeLessThan(TOL);
    expect(relErr(fit.step.ciHigh, 1.0064541497933734)).toBeLessThan(TOL);
    expect(logErr(fit.step.pValue, 2.4692293210039993e-15)).toBeLessThan(1e-7);
    expect(relErr(fit.driftPerYear.value, 0.045203840646038995)).toBeLessThan(TOL);
    expect(relErr(fit.driftPerYear.se, 0.006450514410805411)).toBeLessThan(TOL);
    expect(relErr(fit.driftPerYear.ciLow, 0.03245277063679175)).toBeLessThan(TOL);
    expect(relErr(fit.driftPerYear.ciHigh, 0.05795491065528624)).toBeLessThan(TOL);
    expect(logErr(fit.driftPerYear.pValue, 8.888117077367442e-11)).toBeLessThan(1e-7);
    expect(relErr(fit.lag1, 0.3302914787603929)).toBeLessThan(TOL);
    expect(relErr(fit.nEffective, 145.49124438397396)).toBeLessThan(TOL);
    expect(relErr(fit.sse, 22.300423364683425)).toBeLessThan(TOL);
  });

  it("level shift refuses fewer than 12 valid points on a side", () => {
    expect(
      levelShift(
        t,
        y,
        year.map(() => false),
      ),
    ).toBeNull();
    expect(
      levelShift(
        t.slice(0, 20),
        y.slice(0, 20),
        year.slice(0, 20).map((yr) => yr >= 1991),
      ),
    ).toBeNull();
  });

  it("years needed to detect (Weatherhead et al. 1998)", () => {
    const d = yearsToDetect(0.02, 0.5, 0.3, 45);
    expect(relErr(d.yearsNeeded ?? NaN, 23.294375386192723)).toBeLessThan(1e-12);
    expect(relErr(d.low ?? NaN, 21.542323547367598)).toBeLessThan(1e-12);
    expect(relErr(d.high ?? NaN, 25.188922793760973)).toBeLessThan(1e-12);
    expect(d.moreYears).toBe(0);
    // Hand calculation of the formula.
    const ar = Math.sqrt(1.3 / 0.7);
    expect(d.yearsNeeded).toBeCloseTo(((3.3 * 0.5) / 0.02 * ar) ** (2 / 3), 12);
    expect(yearsToDetect(0, 0.5, 0.3, 45).yearsNeeded).toBeNull();
    expect(yearsToDetect(0.02, 0, 0.3, 45).yearsNeeded).toBeNull();
  });

  it("gap-aware lag-1 equals the standard estimator on a complete series", () => {
    expect(lag1AutocorrelationAt(t, y)).toBe(lag1Autocorrelation(y));
    expect(lag1Autocorrelation([1, 1, 1, 1])).toBe(0);
    expect(lag1Autocorrelation([1, 2])).toBe(0);
  });

  it("recovers an exact straight line", () => {
    const line = t.map((v) => 3 + 0.25 * (v - 2000));
    const fit = olsTrend(t, line);
    expect(fit).not.toBeNull();
    if (!fit) return;
    expect(fit.slope).toBeCloseTo(0.25, 12);
    expect(fit.rSquared).toBeCloseTo(1, 12);
    const sen = theilSen(t, line);
    expect(sen.slope).toBeCloseTo(0.25, 10);
    const mk = mannKendall(line);
    expect(mk?.tau).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. The published analysis files
// ---------------------------------------------------------------------------

interface Tolerance {
  /** Slopes, interval ends, intercept: relative to max(|published|, published CI half-width). */
  slope: number;
  /** r^2, residual std, lag-1, n_eff, variance factor, tau, years needed: relative. */
  shape: number;
  /** p-values: absolute difference of natural logs. */
  logP: number;
  /** r^2 and tau errors are taken relative to max(|published|, floor). 0 = plain relative error. */
  r2Floor: number;
  tauFloor: number;
}

/** Inputs identical to the original pipeline's: the port must simply be right. Plain relative errors. */
const EXACT: Tolerance = { slope: 1e-9, shape: 1e-9, logP: 1e-7, r2Floor: 0, tauFloor: 0 };

/**
 * Inputs rounded in the published JSON (see the header). Rounding 5-decimal
 * values to 3 or 4 decimals perturbs every month by up to half a unit in the
 * last stored digit; these bounds (0.2% of the value or of the CI half-width,
 * p-values within 5%) cover the resulting scatter and are far tighter than any
 * real methodological difference would produce.
 *
 * Two quantities need a floor because they are ~0 for a flat series, where a
 * relative error is meaningless:
 *  - r^2 (rondonia/WS10M: r^2 = 0.00001): error relative to max(r^2, 0.01).
 *  - Kendall's tau counts ordered pairs. Rounding makes close values equal or
 *    swaps them, changing the score S by a handful of the 145,530 pairs
 *    (rondonia/WS10M: S moves by 15, tau = -0.0255). Error relative to
 *    max(|tau|, 0.25), i.e. at most 0.0005 in tau.
 *
 * The strict 1e-9 check for these same 32 files runs against the unrounded
 * CSVs further down, where S, tau and r^2 agree exactly.
 */
const ROUNDED: Tolerance = { slope: 2e-3, shape: 2e-3, logP: 5e-2, r2Floor: 0.01, tauFloor: 0.25 };

function compareTrend(
  group: string,
  got: TrendResult,
  want: PublishedTrend,
  tol: Tolerance,
): void {
  const halfWidth = (want.ols.ci_high - want.ols.ci_low) / 2;
  const slopeLike: [string, number, number][] = [
    ["ols.slope_per_decade", got.slopePerDecade, want.ols.slope_per_decade],
    ["ols.ci_low", got.ciLow, want.ols.ci_low],
    ["ols.ci_high", got.ciHigh, want.ols.ci_high],
    ["ols.naive_ci_low", got.naiveCiLow, want.ols.naive_ci_low],
    ["ols.naive_ci_high", got.naiveCiHigh, want.ols.naive_ci_high],
    ["theil_sen.slope_per_decade", got.senSlopePerDecade, want.theil_sen.slope_per_decade],
  ];
  if (want.theil_sen.ci_low !== null && want.theil_sen.ci_high !== null) {
    expect(got.senCiLow).not.toBeNull();
    expect(got.senCiHigh).not.toBeNull();
    slopeLike.push(["theil_sen.ci_low", got.senCiLow ?? NaN, want.theil_sen.ci_low]);
    slopeLike.push(["theil_sen.ci_high", got.senCiHigh ?? NaN, want.theil_sen.ci_high]);
  } else {
    expect(got.senCiLow).toBeNull();
    expect(got.senCiHigh).toBeNull();
  }
  for (const [name, a, b] of slopeLike) {
    const e = scaledErr(a, b, halfWidth);
    record(group, name, e);
    expect(e, name).toBeLessThan(tol.slope);
  }
  // The intercept is -slope * (mean time ~ 2000), so its error scales the same way.
  const eInt = scaledErr(got.intercept, want.ols.intercept, halfWidth * 200);
  record(group, "ols.intercept", eInt);
  expect(eInt, "ols.intercept").toBeLessThan(tol.slope);

  const shape: [string, number, number][] = [
    ["ols.r_squared", got.rSquared, want.ols.r_squared],
    ["noise.residual_std", got.residualStd, want.noise.residual_std],
    ["noise.lag1_autocorrelation", got.lag1, want.noise.lag1_autocorrelation],
    ["noise.n_effective", got.nEffective, want.noise.n_effective],
    ["mann_kendall.tau", got.mkTau, want.mann_kendall.tau],
    ["mann_kendall.variance_factor", got.mkVarianceFactor, want.mann_kendall.variance_factor],
  ];
  const det = want.detectability;
  if (det.years_needed !== null && det.low !== null && det.high !== null) {
    shape.push(["detectability.years_needed", got.yearsNeeded ?? NaN, det.years_needed]);
    shape.push(["detectability.low", got.yearsNeededLow ?? NaN, det.low]);
    shape.push(["detectability.high", got.yearsNeededHigh ?? NaN, det.high]);
  } else {
    expect(got.yearsNeeded).toBeNull();
  }
  for (const [name, a, b] of shape) {
    const floor = name === "ols.r_squared" ? tol.r2Floor : name === "mann_kendall.tau" ? tol.tauFloor : 0;
    const e = scaledErr(a, b, floor);
    record(group, name, e);
    expect(e, name).toBeLessThan(tol.shape);
  }
  expect(got.recordYears).toBe(det.record_years);
  if (det.more_years !== null) {
    const e = Math.abs((got.moreYears ?? NaN) - det.more_years) / Math.max(1, det.more_years);
    record(group, "detectability.more_years", e);
    expect(e, "detectability.more_years").toBeLessThan(tol.shape);
  }

  const ps: [string, number, number][] = [
    ["ols.p_value", got.pValue, want.ols.p_value],
    ["ols.naive_p_value", got.naivePValue, want.ols.naive_p_value],
    ["mann_kendall.p_value", got.mkPValue, want.mann_kendall.p_value],
    ["mann_kendall.classic_p_value", got.mkClassicPValue, want.mann_kendall.classic_p_value],
  ];
  for (const [name, a, b] of ps) {
    const e = logErr(a, b);
    record(group, `${name} (log)`, e);
    expect(e, name).toBeLessThan(tol.logP);
  }

  expect(got.startYear).toBe(want.start);
  expect(got.endYear).toBe(want.end);
  expect(got.nMonths).toBe(want.n_months);
}

describe("published analysis files: inventory", () => {
  it("finds all 48 region x variable files", () => {
    expect(CASES.length).toBe(48);
    expect(new Set(CASES.map((c) => c.region)).size).toBe(8);
    expect(new Set(CASES.map((c) => c.variable)).size).toBe(6);
    // 16 files store their inputs at full precision (GWETROOT, NDVI).
    expect(CASES.filter((c) => c.exactInputs).length).toBe(16);
  });
});

describe("published analysis files: full-record trend", () => {
  for (const c of CASES) {
    const kind = c.exactInputs ? "exact inputs, 1e-9" : "rounded inputs";
    it(`${c.region}/${c.variable} (${kind})`, () => {
      const got = analyzeTrend(c.points, c.data.period[0], c.data.period[1]);
      expect(got).not.toBeNull();
      if (!got) return;
      compareTrend(
        c.exactInputs ? "full record, exact JSON inputs (16 files)" : "full record, rounded JSON inputs (32 files)",
        got,
        c.data.trend,
        c.exactInputs ? EXACT : ROUNDED,
      );
      // The significance rule: both corrected tests at p < 0.05.
      const published =
        c.data.trend.ols.p_value < ALPHA && c.data.trend.mann_kendall.p_value < ALPHA;
      expect(got.significant).toBe(published);
      expect(got.olsSignificant).toBe(c.data.trend.ols.p_value < ALPHA);
      expect(got.mkSignificant).toBe(c.data.trend.mann_kendall.p_value < ALPHA);
    });
  }
});

describe("published analysis files: anomalies and climatology", () => {
  for (const c of CASES) {
    it(`${c.region}/${c.variable}`, () => {
      const s = c.data.series;
      const d = deseasonalize(c.points, c.data.period[0], c.data.period[1]);
      expect(d.year).toEqual(s.year);
      expect(d.month).toEqual(s.month);
      expect(d.value).toEqual(s.value);
      // Published anomalies and climatology are rounded to (decimals + 1) places.
      // With exact inputs the only difference is that rounding (half a unit);
      // with rounded inputs add half a unit for the value and for the climatology.
      const unit = 10 ** -(c.data.variable.decimals + 1);
      const bound = (c.exactInputs ? 0.5 : 1.5) * unit * (1 + 1e-6);
      let used = 0;
      for (let i = 0; i < s.anomaly.length; i++) {
        const want = s.anomaly[i];
        const got = d.anomaly[i];
        if (want === null) {
          expect(got, `anomaly ${i}`).toBeNull();
        } else {
          expect(got, `anomaly ${i}`).not.toBeNull();
          expect(Math.abs((got ?? NaN) - want), `anomaly ${i}`).toBeLessThanOrEqual(bound);
          used++;
        }
        expect(Math.abs(d.t[i] - s.t[i])).toBeLessThanOrEqual(0.5e-4 * (1 + 1e-6));
      }
      expect(used).toBe(c.data.quality.months_used);
      expect(d.climatology.length).toBe(12);
      for (let m = 0; m < 12; m++) {
        const want = s.climatology[m];
        if (want === null) expect(Number.isNaN(d.climatology[m])).toBe(true);
        else expect(Math.abs(d.climatology[m] - want)).toBeLessThanOrEqual(bound);
      }
    });
  }

  it("leaves out calendar months present in fewer than 80% of years (NDVI, snow)", () => {
    const alaska = CASES.find((c) => c.region === "north-slope" && c.variable === "NDVI");
    const colorado = CASES.find((c) => c.region === "upper-colorado" && c.variable === "NDVI");
    expect(alaska).toBeDefined();
    expect(colorado).toBeDefined();
    if (!alaska || !colorado) return;
    const a = deseasonalize(alaska.points, 2000, 2026);
    const usedMonths = new Set(a.month.filter((_, i) => a.anomaly[i] !== null));
    expect([...usedMonths].sort((p, q) => p - q)).toEqual([6, 7, 8, 9]); // growing season only
    const col = deseasonalize(colorado.points, 2000, 2026);
    expect(col.month.some((m, i) => m === 1 && col.anomaly[i] !== null)).toBe(false);
    expect(Number.isNaN(col.climatology[0])).toBe(true);
  });

  it("uses the full-record climatology whatever window is returned", () => {
    const c = CASES[0];
    const full = deseasonalize(c.points, c.data.period[0], c.data.period[1]);
    const part = deseasonalize(c.points, 1995, 2010);
    expect(part.climatology).toEqual(full.climatology);
    expect(part.year[0]).toBe(1995);
    expect(part.year[part.year.length - 1]).toBe(2010);
    const offset = full.year.indexOf(1995);
    expect(part.anomaly).toEqual(full.anomaly.slice(offset, offset + part.anomaly.length));
  });
});

describe("published analysis files: date windows (windows[])", () => {
  for (const c of CASES) {
    it(`${c.region}/${c.variable}: all ${c.data.windows.length} windows`, () => {
      const tol = c.exactInputs ? EXACT : ROUNDED;
      const group = c.exactInputs
        ? "windows, exact JSON inputs (16 files)"
        : "windows, rounded JSON inputs (32 files)";
      const got = allWindows(c.points);
      expect(got.length).toBe(c.data.windows.length);
      let flips = 0;
      for (let i = 0; i < got.length; i++) {
        const g = got[i];
        const w = c.data.windows[i];
        expect(g.start).toBe(w.start);
        expect(g.end).toBe(w.end);
        const halfWidth = (w.ci_high - w.ci_low) / 2;
        const pairs: [string, number, number, number][] = [
          ["slope_per_decade", g.slopePerDecade, w.slope_per_decade, halfWidth],
          ["ci_low", g.ciLow, w.ci_low, halfWidth],
          ["ci_high", g.ciHigh, w.ci_high, halfWidth],
          ["intercept", g.intercept, w.intercept, halfWidth * 200],
        ];
        for (const [name, a, b, scale] of pairs) {
          const e = scaledErr(a, b, scale);
          record(group, name, e);
          expect(e, `${w.start}-${w.end} ${name}`).toBeLessThan(tol.slope);
        }
        const e = logErr(g.pValue, w.p_value);
        record(group, "p_value (log)", e);
        expect(e, `${w.start}-${w.end} p_value`).toBeLessThan(tol.logP);
        if (g.significant !== w.significant) {
          flips++;
          // A flag may only differ when the published p sits on the 0.05 line
          // and the inputs are rounded; never with exact inputs.
          expect(c.exactInputs, `${w.start}-${w.end} significant`).toBe(false);
          expect(Math.abs(Math.log(w.p_value / ALPHA))).toBeLessThan(tol.logP);
        }
      }
      record(group, "significant flags differing (count)", flips);

      const sum = summarizeWindows(got, analyzeTrend(c.points, c.data.period[0], c.data.period[1])?.slopePerDecade ?? NaN);
      const ws = c.data.windows_summary;
      expect(sum.nWindows).toBe(ws.n_windows);
      expect(sum.minYears).toBe(ws.min_years);
      const slack = (flips + 0.5) / ws.n_windows;
      expect(Math.abs(sum.shareSameDirection - ws.share_same_direction)).toBeLessThan(c.exactInputs ? 1e-12 : 2 / ws.n_windows);
      expect(Math.abs(sum.shareSignificantSameDirection - ws.share_significant_same_direction)).toBeLessThan(c.exactInputs ? 1e-12 : slack);
      expect(Math.abs(sum.shareSignificantOppositeDirection - ws.share_significant_opposite_direction)).toBeLessThan(c.exactInputs ? 1e-12 : slack);
    });
  }

  it("a single window equals the matching entry of windows[]", () => {
    const c = CASES.find((k) => k.region === "rondonia" && k.variable === "GWETROOT");
    expect(c).toBeDefined();
    if (!c) return;
    for (const [start, end] of [
      [1981, 1995],
      [1990, 2010],
      [2005, 2025],
      [2011, 2025],
    ]) {
      const w = c.data.windows.find((k) => k.start === start && k.end === end);
      const g = windowTrend(c.points, start, end);
      const full = analyzeTrend(c.points, start, end);
      expect(w).toBeDefined();
      expect(g).not.toBeNull();
      expect(full).not.toBeNull();
      if (!w || !g || !full) continue;
      expect(relErr(g.slopePerDecade, w.slope_per_decade)).toBeLessThan(1e-9);
      expect(logErr(g.pValue, w.p_value)).toBeLessThan(1e-7);
      expect(g.significant).toBe(w.significant);
      // analyzeTrend on a sub-period gives the same least-squares numbers.
      expect(full.slopePerDecade).toBe(g.slopePerDecade);
      expect(full.ciLow).toBe(g.ciLow);
      expect(full.pValue).toBe(g.pValue);
      expect(full.olsSignificant).toBe(w.significant);
      expect(full.recordYears).toBe(end - start + 1);
    }
  });
});

describe("minimum window rule", () => {
  const c = CASES.find((k) => k.region === "rondonia" && k.variable === "PRECTOTCORR");
  const ndvi = CASES.find((k) => k.region === "north-slope" && k.variable === "NDVI");

  it("needs at least 15 calendar years: end - start + 1 >= 15", () => {
    expect(MIN_WINDOW_YEARS).toBe(15);
    expect(MIN_VALID_POINTS).toBe(8);
    expect(c).toBeDefined();
    if (!c) return;
    expect(analyzeTrend(c.points, 2000, 2014)).not.toBeNull(); // 15 years
    expect(analyzeTrend(c.points, 2000, 2013)).toBeNull(); // 14 years
    expect(analyzeTrend(c.points, 2010, 2010)).toBeNull();
    expect(analyzeTrend(c.points, 2020, 2000)).toBeNull();
    expect(windowTrend(c.points, 2000, 2013)).toBeNull();
  });

  it("must lie inside the record", () => {
    expect(c).toBeDefined();
    if (!c) return;
    expect(analyzeTrend(c.points, 1980, 2025)).toBeNull();
    expect(analyzeTrend(c.points, 1981, 2026)).toBeNull();
    expect(analyzeTrend(c.points, 1981, 2025)).not.toBeNull();
  });

  it("needs at least 8 valid months", () => {
    const sparse: MonthlyPoint[] = [];
    for (let year = 2000; year <= 2019; year++) {
      for (let month = 1; month <= 12; month++) {
        // Seven valid values in total, all in June (June is present in 35% of years: excluded).
        sparse.push({ year, month, value: month === 6 && year < 2007 ? year * 0.1 : null });
      }
    }
    expect(analyzeTrend(sparse, 2000, 2019)).toBeNull();
    expect(analyzeTrend([], 2000, 2019)).toBeNull();
    // Northern Alaska NDVI: 108 valid months (June-September) out of 321 are plenty.
    expect(ndvi).toBeDefined();
    if (!ndvi) return;
    const got = analyzeTrend(ndvi.points, 2000, 2026);
    expect(got?.nMonths).toBe(108);
    expect(got?.recordYears).toBe(26.75); // 321 calendar months, not 27 years
  });

  it("accepts points in any order", () => {
    expect(c).toBeDefined();
    if (!c) return;
    const reversed = [...c.points].reverse();
    expect(analyzeTrend(reversed, 1981, 2025)).toEqual(analyzeTrend(c.points, 1981, 2025));
  });
});

// ---------------------------------------------------------------------------
// 4. Unrounded inputs from the original repository (strict proof for MERRA-2)
// ---------------------------------------------------------------------------

function readCsv(url: URL): { header: string[]; rows: string[][] } {
  const lines = fs
    .readFileSync(url, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  return { header: lines[0].split(","), rows: lines.slice(1).map((l) => l.split(",")) };
}

function csvSeries(url: URL, column: string): MonthlyPoint[] {
  const { header, rows } = readCsv(url);
  const iy = header.indexOf("year");
  const im = header.indexOf("month");
  const iv = header.indexOf(column);
  if (iy < 0 || im < 0 || iv < 0) throw new Error(`column ${column} not found in ${url.href}`);
  return rows.map((r) => ({
    year: Number(r[iy]),
    month: Number(r[im]),
    value: r[iv] === "" ? null : Number(r[iv]),
  }));
}

const HAVE_REFERENCE = fs.existsSync(new URL("processed/rondonia.csv", REFERENCE_DATA));

describe.skipIf(!HAVE_REFERENCE)(
  "unrounded MERRA-2 inputs from ../_reference (skipped when that folder is absent)",
  () => {
    for (const c of CASES.filter((k) => k.variable !== "NDVI")) {
      it(`${c.region}/${c.variable}: full record and all windows to 1e-9`, () => {
        const points = csvSeries(new URL(`processed/${c.region}.csv`, REFERENCE_DATA), c.variable);
        expect(points.length).toBe(c.points.length);
        const got = analyzeTrend(points, c.data.period[0], c.data.period[1]);
        expect(got).not.toBeNull();
        if (!got) return;
        compareTrend("full record, unrounded CSV inputs (40 MERRA-2 files)", got, c.data.trend, EXACT);

        const group = "windows, unrounded CSV inputs (40 MERRA-2 files)";
        const windows = allWindows(points);
        expect(windows.length).toBe(c.data.windows.length);
        for (let i = 0; i < windows.length; i++) {
          const g = windows[i];
          const w = c.data.windows[i];
          const halfWidth = (w.ci_high - w.ci_low) / 2;
          const pairs: [string, number, number, number][] = [
            ["slope_per_decade", g.slopePerDecade, w.slope_per_decade, halfWidth],
            ["ci_low", g.ciLow, w.ci_low, halfWidth],
            ["ci_high", g.ciHigh, w.ci_high, halfWidth],
            ["intercept", g.intercept, w.intercept, halfWidth * 200],
          ];
          for (const [name, a, b, scale] of pairs) {
            const e = scaledErr(a, b, scale);
            record(group, name, e);
            expect(e, `${w.start}-${w.end} ${name}`).toBeLessThan(EXACT.slope);
          }
          const e = logErr(g.pValue, w.p_value);
          record(group, "p_value (log)", e);
          expect(e, `${w.start}-${w.end} p_value`).toBeLessThan(EXACT.logP);
          expect(g.significant, `${w.start}-${w.end} significant`).toBe(w.significant);
        }
        const sum = summarizeWindows(windows, got.slopePerDecade);
        const ws = c.data.windows_summary;
        expect(sum.shareSameDirection).toBeCloseTo(ws.share_same_direction, 12);
        expect(sum.shareSignificantSameDirection).toBeCloseTo(ws.share_significant_same_direction, 12);
        expect(sum.shareSignificantOppositeDirection).toBeCloseTo(ws.share_significant_opposite_direction, 12);
        expect(relErr(sum.slopeMin, ws.slope_min)).toBeLessThan(1e-9);
        expect(relErr(sum.slopeMax, ws.slope_max)).toBeLessThan(1e-9);
      });
    }
  },
);

// ---------------------------------------------------------------------------
// 5. The documented 2005 level shift (MERRA-2 minus GPCP, south-western Amazon)
//
// The published JSON holds the RESULT of this test (crosscheck.known_issue) but
// not the GPCP series it needs, so the app cannot recompute it from its own
// data. It is reproduced here from the original repository's CSVs when present.
// ---------------------------------------------------------------------------

describe.skipIf(!HAVE_REFERENCE)(
  "2005 level shift, rondonia/PRECTOTCORR vs GPCP (needs ../_reference; GPCP series is not in the app's JSON)",
  () => {
    it("reproduces crosscheck.known_issue", () => {
      const c = CASES.find((k) => k.region === "rondonia" && k.variable === "PRECTOTCORR");
      expect(c).toBeDefined();
      if (!c) return;
      const issue = c.data.crosscheck.known_issue;
      expect(issue?.break_year).toBe(2005);
      if (!issue || !issue.step || !issue.drift_per_decade || !issue.periods) {
        throw new Error("known_issue block is incomplete");
      }
      const main = csvSeries(new URL("processed/rondonia.csv", REFERENCE_DATA), "PRECTOTCORR");
      const gpcp = csvSeries(new URL("crosscheck/gpcp.csv", REFERENCE_DATA), "rondonia");
      const got = levelShiftTest(main, gpcp, 2005);
      expect(got).not.toBeNull();
      if (!got) return;
      const group = "level shift 2005 (unrounded CSV inputs)";
      const rel: [string, number, number][] = [
        ["gap_before", got.gapBefore, issue.gap_before ?? NaN],
        ["gap_after", got.gapAfter, issue.gap_after ?? NaN],
        ["step.value", got.step.value, issue.step.value],
        ["step.ci_low", got.step.ciLow, issue.step.ci_low],
        ["step.ci_high", got.step.ciHigh, issue.step.ci_high],
        ["drift_per_decade.value", got.driftPerDecade.value, issue.drift_per_decade.value],
        ["drift_per_decade.ci_low", got.driftPerDecade.ciLow, issue.drift_per_decade.ci_low],
        ["drift_per_decade.ci_high", got.driftPerDecade.ciHigh, issue.drift_per_decade.ci_high],
      ];
      got.periods.forEach((p, i) => {
        const want = issue.periods?.[i];
        if (!want) throw new Error("missing period");
        expect(p.start).toBe(want.start);
        expect(p.end).toBe(want.end);
        expect(p.rangesOverlap).toBe(want.ranges_overlap);
        for (const side of ["main", "independent"] as const) {
          rel.push([`periods[${i}].${side}.slope`, p[side].slopePerDecade, want[side].slope_per_decade]);
          rel.push([`periods[${i}].${side}.ci_low`, p[side].ciLow, want[side].ci_low]);
          rel.push([`periods[${i}].${side}.ci_high`, p[side].ciHigh, want[side].ci_high]);
          expect(p[side].significant).toBe(want[side].significant);
          const e = logErr(p[side].pValue, want[side].p_value);
          record(group, "periods p_value (log)", e);
          expect(e).toBeLessThan(1e-7);
        }
      });
      for (const [name, a, b] of rel) {
        const e = relErr(a, b);
        record(group, name.replace(/\[\d\]\.(main|independent)/, ""), e);
        expect(e, name).toBeLessThan(1e-9);
      }
      const ep = logErr(got.step.pValue, issue.step.p_value);
      record(group, "step.p_value (log)", ep);
      expect(ep).toBeLessThan(1e-7);
      expect(got.bestFitBreakYear).toBe(issue.best_fit_break_year);
      expect(got.breakYear).toBe(2005);
      // The numbers quoted in METHODOLOGY.md section 5.
      expect(got.gapBefore.toFixed(2)).toBe("-0.13");
      expect(got.gapAfter.toFixed(2)).toBe("-0.99");
      expect(got.step.value.toFixed(2)).toBe("-1.07");
      expect(got.driftPerDecade.value.toFixed(2)).toBe("0.10");
    });
  },
);

// ---------------------------------------------------------------------------
// 6. Speed and the method statement
// ---------------------------------------------------------------------------

describe("performance", () => {
  it("analyzeTrend on 540 months stays under 50 ms", () => {
    const c = CASES.find((k) => k.region === "rondonia" && k.variable === "PRECTOTCORR");
    expect(c).toBeDefined();
    if (!c) return;
    expect(c.points.length).toBe(540);
    for (let i = 0; i < 5; i++) analyzeTrend(c.points, 1981, 2025); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      analyzeTrend(c.points, 1981, 2025);
      times.push(performance.now() - t0);
    }
    times.sort((p, q) => p - q);
    const median = times[Math.floor(times.length / 2)];
    record("performance (ms, not an error)", "analyzeTrend, 540 months, median", median);
    record("performance (ms, not an error)", "analyzeTrend, 540 months, slowest", times[times.length - 1]);
    expect(median).toBeLessThan(50);
  });
});

describe("TREND_METHOD", () => {
  it("states the method without empty fields", () => {
    expect(TREND_METHOD.name.length).toBeGreaterThan(20);
    expect(TREND_METHOD.nullHypothesis).toContain("No trend");
    expect(TREND_METHOD.autocorrelation).toContain("n_eff = n (1 - r1) / (1 + r1)");
    expect(TREND_METHOD.significanceRule).toContain("p < 0.05");
    expect(TREND_METHOD.limitations.length).toBeGreaterThan(5);
    expect(TREND_METHOD.references.some((r) => r.includes("Santer"))).toBe(true);
    expect(TREND_METHOD.references.some((r) => r.includes("Hamed"))).toBe(true);
  });
});
