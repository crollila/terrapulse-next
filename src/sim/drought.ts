/**
 * Drought index and what-if for the regional monthly series. Deterministic and dependency-light.
 *
 * Index: a non-parametric standardised precipitation index. For an accumulation period of k months,
 * the k-month mean precipitation ending in each month is ranked among the values for the same
 * calendar month in all years of the record. The rank becomes an empirical probability with the
 * Gringorten plotting position, p = (rank - 0.44) / (n + 0.12), and the index is the standard
 * normal quantile of p. This follows the idea of the Standardized Precipitation Index (McKee,
 * Doesken and Kleist 1993) without fitting a gamma distribution; ranks cannot extrapolate beyond
 * the record, so the index is bounded by the record length.
 *
 * Classes (McKee et al. 1993): index <= -1.0 moderate, <= -1.5 severe, <= -2.0 extreme.
 *
 * Input here is MERRA-2 precipitation (a reanalysis), so "observed" episodes are episodes in that
 * dataset. See DROUGHT_CARD.limitations.
 */
import { normalQuantile } from "../science/stats";

export interface MonthlyValue {
  year: number;
  month: number;
  value: number | null;
}

export const DROUGHT_THRESHOLDS = { moderate: -1.0, severe: -1.5, extreme: -2.0 } as const;
export type DroughtClass = "none" | "moderate" | "severe" | "extreme";

export function droughtClass(z: number | null): DroughtClass {
  if (z === null) return "none";
  if (z <= DROUGHT_THRESHOLDS.extreme) return "extreme";
  if (z <= DROUGHT_THRESHOLDS.severe) return "severe";
  if (z <= DROUGHT_THRESHOLDS.moderate) return "moderate";
  return "none";
}

/** Trailing k-month mean ending at each month; null until k months exist or if any is missing. */
export function trailingMean(series: MonthlyValue[], k: number): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 0; i < series.length; i++) {
    if (i < k - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = i - k + 1; j <= i; j++) {
      const v = series[j].value;
      if (v === null || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / k : null);
  }
  return out;
}

/** Gringorten plotting position. */
export const gringorten = (rank: number, n: number) => (rank - 0.44) / (n + 0.12);

/** Average ranks (1 = smallest), ties share the mean rank. */
export function averageRanks(values: number[]): number[] {
  const idx = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let q = i; q <= j; q++) ranks[idx[q][1]] = r;
    i = j + 1;
  }
  return ranks;
}

export interface StandardisedIndex {
  /** Index value per input month (null where the k-month mean is unavailable). */
  index: (number | null)[];
  /** k-month means per input month. */
  accumulated: (number | null)[];
  /** Number of years contributing for each calendar month (index 0 = January). */
  nByMonth: number[];
}

export function standardisedIndex(series: MonthlyValue[], k: number): StandardisedIndex {
  const accumulated = trailingMean(series, k);
  const index: (number | null)[] = new Array(series.length).fill(null);
  const nByMonth = new Array<number>(12).fill(0);
  for (let m = 1; m <= 12; m++) {
    const where: number[] = [];
    for (let i = 0; i < series.length; i++) if (series[i].month === m && accumulated[i] !== null) where.push(i);
    nByMonth[m - 1] = where.length;
    if (where.length < 2) continue;
    const ranks = averageRanks(where.map((i) => accumulated[i] as number));
    where.forEach((i, q) => {
      index[i] = normalQuantile(gringorten(ranks[q], where.length));
    });
  }
  return { index, accumulated, nByMonth };
}

export interface Episode {
  start: string;
  end: string;
  months: number;
  peak: number;
  peakMonth: string;
  mean: number;
}

const ym = (s: MonthlyValue) => `${s.year}-${String(s.month).padStart(2, "0")}`;

/** Runs of consecutive months with index <= threshold lasting at least minMonths. */
export function episodes(series: MonthlyValue[], index: (number | null)[], threshold: number = DROUGHT_THRESHOLDS.moderate, minMonths = 3): Episode[] {
  const out: Episode[] = [];
  let run: number[] = [];
  const flush = () => {
    if (run.length >= minMonths) {
      const vals = run.map((i) => index[i] as number);
      const peak = Math.min(...vals);
      out.push({ start: ym(series[run[0]]), end: ym(series[run[run.length - 1]]), months: run.length, peak, peakMonth: ym(series[run[vals.indexOf(peak)]]), mean: vals.reduce((a, b) => a + b, 0) / vals.length });
    }
    run = [];
  };
  for (let i = 0; i < series.length; i++) {
    const z = index[i];
    if (z !== null && z <= threshold) run.push(i);
    else flush();
  }
  flush();
  return out;
}

export interface Hypothetical {
  /** k-month mean in the what-if, same units as the series. */
  value: number;
  /** Mean k-month value for that calendar month over the record. */
  normal: number;
  /** Years in the record with a k-month value at or below the what-if value. */
  yearsAtOrBelow: number;
  nYears: number;
  /** Index of the what-if; null when it is drier than every year in the record (cannot be ranked). */
  index: number | null;
  /** Lowest index the record can express for that month (rank 1). */
  recordFloor: number;
  cls: DroughtClass;
  beyondRecord: boolean;
}

/**
 * What-if: rainfall at `fraction` of the monthly normal for the k months ending in calendar month
 * `endMonth`. Each month at fraction f of its own normal makes the k-month mean f times the normal
 * k-month mean. The result is placed in the record by counting years, never by extrapolation.
 */
export function hypotheticalDeficit(series: MonthlyValue[], k: number, endMonth: number, fraction: number): Hypothetical | null {
  const acc = trailingMean(series, k);
  const hist: number[] = [];
  for (let i = 0; i < series.length; i++) if (series[i].month === endMonth && acc[i] !== null) hist.push(acc[i] as number);
  if (hist.length < 2) return null;
  const normal = hist.reduce((a, b) => a + b, 0) / hist.length;
  const value = fraction * normal;
  const yearsAtOrBelow = hist.filter((v) => v <= value).length;
  const n = hist.length;
  const recordFloor = normalQuantile(gringorten(1, n));
  const beyondRecord = yearsAtOrBelow === 0;
  // Between the yearsAtOrBelow-th and the next driest year: rank = count + 0.5, capped inside the record.
  const index = beyondRecord ? null : normalQuantile(gringorten(Math.min(n, yearsAtOrBelow + 0.5), n));
  return { value, normal, yearsAtOrBelow, nYears: n, index, recordFloor, cls: beyondRecord ? "extreme" : droughtClass(index), beyondRecord };
}

/** Standardised anomaly per calendar month: (value - month mean) / month standard deviation. */
export function monthlyZ(series: MonthlyValue[]): (number | null)[] {
  const out: (number | null)[] = new Array(series.length).fill(null);
  for (let m = 1; m <= 12; m++) {
    const where = series.map((s, i) => (s.month === m && s.value !== null && Number.isFinite(s.value) ? i : -1)).filter((i) => i >= 0);
    if (where.length < 3) continue;
    const vals = where.map((i) => series[i].value as number);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
    if (!(sd > 0)) continue;
    where.forEach((i, q) => (out[i] = (vals[q] - mean) / sd));
  }
  return out;
}

export interface Response {
  n: number;
  median: number | null;
  q25: number | null;
  q75: number | null;
}

const quantile = (sorted: number[], p: number) => {
  if (!sorted.length) return null;
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (h - lo);
};

/**
 * Standardised anomalies of another variable in the months when the drought index was at or below
 * a level. A description of what co-occurred in the record: association, not cause, and not a
 * prediction.
 */
export function coOccurringResponse(indexSeries: MonthlyValue[], index: (number | null)[], other: MonthlyValue[], otherZ: (number | null)[], level: number): Response {
  const key = (s: MonthlyValue) => s.year * 12 + s.month;
  const map = new Map<number, number>();
  other.forEach((s, i) => {
    const z = otherZ[i];
    if (z !== null) map.set(key(s), z);
  });
  const vals: number[] = [];
  indexSeries.forEach((s, i) => {
    const z = index[i];
    if (z !== null && z <= level) {
      const o = map.get(key(s));
      if (o !== undefined) vals.push(o);
    }
  });
  vals.sort((a, b) => a - b);
  return { n: vals.length, median: quantile(vals, 0.5), q25: quantile(vals, 0.25), q75: quantile(vals, 0.75) };
}

export const DROUGHT_CARD = {
  name: "Regional drought index and what-if v0.1",
  status: "EXPERIMENTAL: arithmetic unit-tested; not compared with an operational drought monitor",
  inputs: [
    "Monthly precipitation, root-zone soil wetness (NASA MERRA-2 via NASA POWER, 1981-2025) and vegetation greenness (MODIS MOD13C2 NDVI, 2000-2026) for eight region boxes",
    "Accumulation period k (3, 6 or 12 months), user-chosen",
    "What-if rainfall as a fraction of the monthly normal and the month the period ends: hypothetical, user-chosen",
  ],
  formula: [
    "A(t) = mean precipitation over the k months ending at t",
    "rank A(t) among the values for the same calendar month in all years (ties share the mean rank)",
    "p = (rank - 0.44) / (n + 0.12)          [Gringorten plotting position]",
    "index(t) = standard normal quantile of p",
    "what-if value = fraction * mean A for that calendar month; placed by counting the years at or below it",
  ],
  assumptions: [
    "Each calendar month's k-month totals are compared only with the same calendar month in other years",
    "The what-if holds every month in the period at the same fraction of its own normal",
  ],
  limitations: [
    "Not the gamma-fitted SPI: ranks cannot extrapolate, so with about 45 years the index cannot go below about -2.2 and a what-if drier than every year is reported as beyond the record, without a return period.",
    "MERRA-2 is a reanalysis, not rain gauges. Changes in its inputs can create false dry or wet periods. In the south-western Amazon box its rainfall shifts down in 2005 for a documented data reason, which biases this index dry after 2005.",
    "Precipitation only: no temperature or evaporative demand, so it is not a full drought indicator.",
    "Regions are rectangles; a regional mean can hide local drought.",
    "The vegetation and soil figures describe what co-occurred with dry months in the record. They are associations, not a forecast of crop or pasture loss.",
    "No crop production, water supply or economic dataset is linked yet, so economic exposure is not estimated.",
  ],
  references: [
    "McKee, T. B., Doesken, N. J., & Kleist, J. (1993). The relationship of drought frequency and duration to time scales. Eighth Conference on Applied Climatology, American Meteorological Society.",
    "Gringorten, I. I. (1963). A plotting rule for extreme probability paper. Journal of Geophysical Research, 68, 813-814.",
  ],
} as const;
