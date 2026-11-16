/**
 * Trend statistics for monthly Earth-system time series, in the browser.
 *
 * This is a line-by-line port of the original TerraPulse Python pipeline
 * (backend/terrapulse/stats.py, analysis.py and the numeric part of
 * crosscheck.py). It is dependency-free and pure: arrays in, plain numbers out.
 * `stats.test.ts` checks it against every published analysis file.
 *
 * What the Python does, and therefore what this does:
 *
 *  - Calendar months with data in fewer than 80% of the years are left out in
 *    every year (no effect on a complete series).
 *  - Climatology = mean of each calendar month over the WHOLE record passed in
 *    (not over the selected window), so different date windows are comparable.
 *  - Anomaly = value minus its calendar month's climatology.
 *  - Time axis = decimal years at mid-month: year + (month - 0.5) / 12.
 *  - Least-squares slope with the Santer et al. (2008) AR(1) adjustment:
 *    n_eff = n (1 - r1) / (1 + r1), r1 clamped to [0, 0.99], n_eff >= 3,
 *    t distribution with n_eff - 2 degrees of freedom.
 *  - Theil-Sen slope with scipy.stats.theilslopes' rank-based interval.
 *  - Mann-Kendall with ties, and the Hamed-Rao (1998) variance correction
 *    (lags 1..24, factor never below 1).
 *  - Years needed to detect (Weatherhead et al. 1998).
 *
 * References
 *   Santer et al. (2008), Int. J. Climatol. 28, 1703-1722
 *   Mann (1945); Kendall (1975)
 *   Hamed & Rao (1998), J. Hydrol. 204, 182-196
 *   Sen (1968), J. Am. Stat. Assoc. 63, 1379-1389
 *   Weatherhead et al. (1998), J. Geophys. Res. 103, 17149-17161
 */

// --------------------------------------------------------------------------
// Constants (same values as the Python)
// --------------------------------------------------------------------------

/** "Significant" always means p < ALPHA. */
export const ALPHA = 0.05;
/** A date window must span at least this many calendar years (end - start + 1). */
export const MIN_WINDOW_YEARS = 15;
/** A trend needs at least this many valid (non-missing) months. */
export const MIN_VALID_POINTS = 8;
/** A calendar month is analysed only if it has data in at least this share of years. */
export const MIN_CALENDAR_MONTH_COVERAGE = 0.8;
/** Hamed-Rao correction uses the autocorrelations of lags 1..MK_MAX_LAG. */
export const MK_MAX_LAG = 24;

// --------------------------------------------------------------------------
// Public types
// --------------------------------------------------------------------------

export interface MonthlyPoint {
  year: number;
  month: number;
  value: number | null;
}

export interface TrendResult {
  startYear: number;
  endYear: number;
  /** Valid (non-missing) months used by the fit. */
  nMonths: number;
  /** Least-squares slope of anomaly against time, per decade (headline rate). */
  slopePerDecade: number;
  intercept: number;
  rSquared: number;
  /** 95% interval of the slope per decade, AR(1)-adjusted. */
  ciLow: number;
  ciHigh: number;
  /** AR(1)-adjusted t-test p-value. */
  pValue: number;
  /** The same assuming independent months (shown for comparison only). */
  naivePValue: number;
  naiveCiLow: number;
  naiveCiHigh: number;
  /** Theil-Sen median slope per decade and its rank-based interval. */
  senSlopePerDecade: number;
  senCiLow: number | null;
  senCiHigh: number | null;
  mkTau: number;
  /** Mann-Kendall p-value with the Hamed-Rao correction. */
  mkPValue: number;
  /** Mann-Kendall p-value without the correction. */
  mkClassicPValue: number;
  /** Lag-1 autocorrelation of the regression residuals. */
  lag1: number;
  nEffective: number;
  residualStd: number;
  /** Weatherhead et al. years of data needed to detect a trend of this size. */
  yearsNeeded: number | null;
  /**
   * The full-record rule: BOTH corrected tests give p < 0.05
   * (adjusted t-test and Hamed-Rao Mann-Kendall).
   */
  significant: boolean;

  // ---- additional fields (not in the minimum contract) ----
  /** Adjusted t-test alone, p < 0.05. This is the rule used for windows[]. */
  olsSignificant: boolean;
  /** Hamed-Rao Mann-Kendall alone, p < 0.05. */
  mkSignificant: boolean;
  /** Hamed-Rao variance inflation factor (>= 1). */
  mkVarianceFactor: number;
  yearsNeededLow: number | null;
  yearsNeededHigh: number | null;
  /** Calendar months in the window / 12 (missing months included). */
  recordYears: number;
  moreYears: number | null;
}

/** One entry of the date-window heat map (adjusted least squares only). */
export interface WindowTrend {
  start: number;
  end: number;
  slopePerDecade: number;
  intercept: number;
  ciLow: number;
  ciHigh: number;
  pValue: number;
  /** Adjusted t-test p < 0.05 (the windows rule; Mann-Kendall is not run per window). */
  significant: boolean;
}

export interface OlsInterval {
  se: number;
  ciLow: number;
  ciHigh: number;
  pValue: number;
}

export interface OlsFit {
  n: number;
  /** Per unit of t (per year when t is in decimal years). */
  slope: number;
  intercept: number;
  rSquared: number;
  residualStd: number;
  lag1: number;
  nEffective: number;
  naive: OlsInterval;
  adjusted: OlsInterval;
}

export interface MannKendallResult {
  n: number;
  s: number;
  tau: number;
  classicZ: number;
  classicPValue: number;
  hamedRaoZ: number;
  hamedRaoPValue: number;
  varianceFactor: number;
}

export interface TheilSenResult {
  slope: number;
  intercept: number;
  ciLow: number;
  ciHigh: number;
}

export interface Detectability {
  yearsNeeded: number | null;
  low: number | null;
  high: number | null;
  recordYears: number;
  moreYears: number | null;
}

export interface PreparedSeries {
  n: number;
  firstYear: number;
  lastYear: number;
  /** Decimal year at mid-month. */
  t: Float64Array;
  year: Int32Array;
  month: Int32Array;
  /** Input values, NaN where missing. */
  value: Float64Array;
  /** Anomalies, NaN where missing or where the calendar month is excluded. */
  anomaly: Float64Array;
  /** Index 0 = January. NaN where a calendar month has no usable data. */
  climatology: Float64Array;
  /** Calendar months (1..12) left out because they have data in too few years. */
  excludedMonths: number[];
}

// --------------------------------------------------------------------------
// Special functions
// --------------------------------------------------------------------------

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];
const HALF_LOG_TWO_PI = 0.9189385332046727;
const SQRT2 = Math.SQRT2;
const FPMIN = 1e-300;
const EPS = 1e-16;

/** Natural log of the gamma function (Lanczos, g = 7; about 15 digits). */
export function logGamma(x: number): number {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - logGamma(1 - x);
  }
  const z = x - 1;
  let a = LANCZOS[0];
  const tt = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  return HALF_LOG_TWO_PI + (z + 0.5) * Math.log(tt) - tt + Math.log(a);
}

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 100000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 4 * EPS) break;
  }
  return h;
}

/**
 * Regularized incomplete beta I_x(a, b), given both x and y = 1 - x so that
 * neither tail loses digits to cancellation.
 */
function incompleteBetaXY(x: number, y: number, a: number, b: number): number {
  if (!(x > 0)) return 0;
  if (!(y > 0)) return 1;
  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(y),
  );
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(y, b, a)) / b;
}

/** Regularized incomplete beta function I_x(a, b). */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  return incompleteBetaXY(x, 1 - x, a, b);
}

/** Complementary error function, accurate in the far tail (relative error ~1e-15). */
export function erfc(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0) return 2 - erfc(-x);
  const x2 = x * x;
  if (x2 < 1.5) {
    // erf(x) = P(1/2, x^2), series expansion.
    if (x === 0) return 1;
    let ap = 0.5;
    let del = 2;
    let sum = 2;
    for (let i = 0; i < 500; i++) {
      ap += 1;
      del *= x2 / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return 1 - (sum * Math.exp(-x2) * x) / Math.sqrt(Math.PI);
  }
  // erfc(x) = Q(1/2, x^2), continued fraction (modified Lentz).
  let b = x2 + 0.5;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 10000; i++) {
    const an = -i * (i - 0.5);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 4 * EPS) break;
  }
  return (Math.exp(-x2) * x * h) / Math.sqrt(Math.PI);
}

/** Standard normal upper tail P(Z > z). */
export function normalSf(z: number): number {
  return 0.5 * erfc(z / SQRT2);
}

/** Standard normal CDF P(Z <= z). */
export function normalCdf(z: number): number {
  return 0.5 * erfc(-z / SQRT2);
}

/** Standard normal quantile (Acklam's rational approximation, then Halley refinement). */
export function normalQuantile(p: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // Halley steps against the accurate tail function. The tail is used on the
  // side where it is small so the error is measured without cancellation.
  for (let i = 0; i < 3; i++) {
    const e = x < 0 ? normalCdf(x) - p : 1 - p - normalSf(x);
    const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
    const step = u / (1 + (x * u) / 2);
    x -= step;
    if (Math.abs(step) < 1e-16 * Math.max(1, Math.abs(x))) break;
  }
  return x;
}

/** Two-sided p-value of a Student t statistic: P(|T| > |t|), df may be fractional. */
export function studentTTwoSidedP(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  const t2 = t * t;
  if (t2 === 0) return 1;
  if (!Number.isFinite(t2)) return 0;
  return incompleteBetaXY(df / (df + t2), t2 / (df + t2), df / 2, 0.5);
}

/** Student t upper tail P(T > t). */
export function studentTSf(t: number, df: number): number {
  const half = 0.5 * studentTTwoSidedP(t, df);
  return t >= 0 ? half : 1 - half;
}

/** Student t CDF P(T <= t). */
export function studentTCdf(t: number, df: number): number {
  return studentTSf(-t, df);
}

/** Student t probability density. */
export function studentTPdf(t: number, df: number): number {
  return Math.exp(
    logGamma((df + 1) / 2) -
      logGamma(df / 2) -
      0.5 * Math.log(df * Math.PI) -
      ((df + 1) / 2) * Math.log1p((t * t) / df),
  );
}

/** Student t quantile: the t with P(T <= t) = p. df may be fractional. */
export function studentTQuantile(p: number, df: number): number {
  if (Number.isNaN(p) || p < 0 || p > 1 || !(df > 0)) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  if (p === 0.5) return 0;
  if (p < 0.5) return -studentTQuantile(1 - p, df);
  const q = 1 - p; // exact for p in [0.5, 1]
  // The t upper tail is convex for t > 0 and the normal quantile lies below the
  // t quantile, so Newton's method from there rises monotonically to the root.
  let t = normalQuantile(p);
  if (!(t > 0)) t = 1e-8;
  for (let i = 0; i < 500; i++) {
    const f = 0.5 * studentTTwoSidedP(t, df) - q;
    const step = f / studentTPdf(t, df);
    t += step;
    if (!(Math.abs(step) > 1e-15 * Math.abs(t))) break;
  }
  return t;
}

// --------------------------------------------------------------------------
// Small numeric helpers
// --------------------------------------------------------------------------

type Numeric = ArrayLike<number>;

function isFiniteNumber(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** numpy.round semantics: halves go to the even integer. */
function roundHalfEven(v: number): number {
  const f = Math.floor(v);
  const diff = v - f;
  if (diff < 0.5) return f;
  if (diff > 0.5) return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Rearranges a[lo..hi] so that a[k] is the k-th smallest; returns it. */
function selectKth(a: Float64Array, k: number, lo: number, hi: number): number {
  while (hi > lo) {
    const mid = (lo + hi) >>> 1;
    let tmp: number;
    if (a[mid] < a[lo]) {
      tmp = a[mid];
      a[mid] = a[lo];
      a[lo] = tmp;
    }
    if (a[hi] < a[lo]) {
      tmp = a[hi];
      a[hi] = a[lo];
      a[lo] = tmp;
    }
    if (a[hi] < a[mid]) {
      tmp = a[hi];
      a[hi] = a[mid];
      a[mid] = tmp;
    }
    const pivot = a[mid];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) {
        tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k];
  }
  return a[k];
}

/** Median of the first m entries of a (numpy.median). Reorders a. */
function medianInPlace(a: Float64Array, m: number): number {
  if (m === 0) return NaN;
  const k = m >>> 1;
  const upper = selectKth(a, k, 0, m - 1);
  if (m % 2 === 1) return upper;
  let lower = -Infinity;
  for (let i = 0; i < k; i++) if (a[i] > lower) lower = a[i];
  return (lower + upper) / 2;
}

function medianOf(x: Numeric): number {
  const copy = Float64Array.from(x as ArrayLike<number>);
  return medianInPlace(copy, copy.length);
}

/** Sum over groups of equal values of c (c - 1) (2c + 5), c = group size. */
function tieTerm(x: Numeric): number {
  const sorted = Float64Array.from(x as ArrayLike<number>).sort();
  let total = 0;
  let run = 1;
  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === sorted[i - 1]) {
      run++;
    } else {
      if (run > 1) total += run * (run - 1) * (2 * run + 5);
      run = 1;
    }
  }
  return total;
}

/** scipy.stats.rankdata (average ranks for ties), 1-based. */
function rankAverage(x: Float64Array): Float64Array {
  const n = x.length;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((p, q) => x[p] - x[q]);
  const ranks = new Float64Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && x[order[j + 1]] === x[order[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[order[k]] = r;
    i = j + 1;
  }
  return ranks;
}

/** Keeps the pairs where both t and y are finite. */
function finitePairs(t: Numeric, y: Numeric): { t: Float64Array; y: Float64Array } {
  const n = Math.min(t.length, y.length);
  let m = 0;
  for (let i = 0; i < n; i++) if (Number.isFinite(t[i]) && Number.isFinite(y[i])) m++;
  const tt = new Float64Array(m);
  const yy = new Float64Array(m);
  let k = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(t[i]) && Number.isFinite(y[i])) {
      tt[k] = t[i];
      yy[k] = y[i];
      k++;
    }
  }
  return { t: tt, y: yy };
}

// --------------------------------------------------------------------------
// Seasonal cycle
// --------------------------------------------------------------------------

/**
 * Sum of a[start .. start + n) in the order NumPy uses (pairwise summation with
 * eight running partial sums, blocks of 128). A plain left-to-right loop can
 * differ from NumPy in the last bit; that is enough to flip the sign of a
 * difference between two anomalies that are mathematically equal, and so to
 * change the Mann-Kendall score by a pair or two. Summing the same way keeps
 * the anomalies bit-identical to the Python pipeline's.
 */
function numpySum(a: Float64Array, start: number, n: number): number {
  if (n < 8) {
    let res = 0;
    for (let i = 0; i < n; i++) res += a[start + i];
    return res;
  }
  if (n <= 128) {
    let r0 = a[start];
    let r1 = a[start + 1];
    let r2 = a[start + 2];
    let r3 = a[start + 3];
    let r4 = a[start + 4];
    let r5 = a[start + 5];
    let r6 = a[start + 6];
    let r7 = a[start + 7];
    let i = 8;
    const stop = n - (n % 8);
    for (; i < stop; i += 8) {
      r0 += a[start + i];
      r1 += a[start + i + 1];
      r2 += a[start + i + 2];
      r3 += a[start + i + 3];
      r4 += a[start + i + 4];
      r5 += a[start + i + 5];
      r6 += a[start + i + 6];
      r7 += a[start + i + 7];
    }
    let res = r0 + r1 + (r2 + r3) + (r4 + r5 + (r6 + r7));
    for (; i < n; i++) res += a[start + i];
    return res;
  }
  let n2 = n >>> 1;
  n2 -= n2 % 8;
  return numpySum(a, start, n2) + numpySum(a, start + n2, n - n2);
}

/**
 * Mean of each calendar month (index 0 = January), ignoring missing values.
 * Mirrors numpy.nanmean: missing values count as 0 in the sum and are left out
 * of the count. NaN for a calendar month with no data.
 */
export function monthlyClimatology(months: Numeric, values: Numeric): Float64Array {
  const clim = new Float64Array(12);
  const buffer = new Float64Array(values.length);
  for (let m = 1; m <= 12; m++) {
    let rows = 0;
    let count = 0;
    for (let i = 0; i < values.length; i++) {
      if (months[i] !== m) continue;
      const v = values[i];
      if (Number.isFinite(v)) {
        buffer[rows++] = v;
        count++;
      } else {
        buffer[rows++] = 0;
      }
    }
    clim[m - 1] = count > 0 ? numpySum(buffer, 0, rows) / count : NaN;
  }
  return clim;
}

/**
 * Drops calendar months that are missing in too many years: returns a copy of
 * `values` with those calendar months set to NaN in every year, and the list
 * of excluded month numbers. A complete series is returned unchanged.
 */
export function maskSparseCalendarMonths(
  months: Numeric,
  values: Numeric,
  minFraction: number = MIN_CALENDAR_MONTH_COVERAGE,
): { values: Float64Array; excluded: number[] } {
  const out = Float64Array.from(values as ArrayLike<number>);
  const excluded: number[] = [];
  for (let m = 1; m <= 12; m++) {
    let total = 0;
    let valid = 0;
    for (let i = 0; i < out.length; i++) {
      if (months[i] === m) {
        total++;
        if (Number.isFinite(values[i])) valid++;
      }
    }
    if (total === 0) continue;
    const share = valid / total;
    if (share < minFraction) {
      for (let i = 0; i < out.length; i++) if (months[i] === m) out[i] = NaN;
      if (share > 0) excluded.push(m);
    }
  }
  return { values: out, excluded };
}

/**
 * Everything the trend functions need, computed once from the full record:
 * time axis, sparse-month mask, full-record climatology and anomalies.
 * Points are put in chronological order if they are not already.
 */
export function prepareSeries(points: readonly MonthlyPoint[]): PreparedSeries {
  let ordered = points;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (cur.year * 12 + cur.month < prev.year * 12 + prev.month) {
      ordered = [...points].sort((p, q) => p.year * 12 + p.month - (q.year * 12 + q.month));
      break;
    }
  }
  const n = ordered.length;
  const year = new Int32Array(n);
  const month = new Int32Array(n);
  const value = new Float64Array(n);
  const t = new Float64Array(n);
  let firstYear = Infinity;
  let lastYear = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = ordered[i];
    year[i] = p.year;
    month[i] = p.month;
    value[i] = isFiniteNumber(p.value) ? p.value : NaN;
    t[i] = p.year + (p.month - 0.5) / 12.0;
    if (p.year < firstYear) firstYear = p.year;
    if (p.year > lastYear) lastYear = p.year;
  }
  const masked = maskSparseCalendarMonths(month, value);
  const climatology = monthlyClimatology(month, masked.values);
  const anomaly = new Float64Array(n);
  for (let i = 0; i < n; i++) anomaly[i] = masked.values[i] - climatology[month[i] - 1];
  return {
    n,
    firstYear,
    lastYear,
    t,
    year,
    month,
    value,
    anomaly,
    climatology,
    excludedMonths: masked.excluded,
  };
}

/**
 * Removes the seasonal cycle.
 *
 * The climatology is the mean of each calendar month over the WHOLE record in
 * `points` (as in the Python: "fixed for the whole record so that results for
 * different date windows are comparable"). `startYear`/`endYear` only select
 * which months are returned; they do not change the climatology.
 *
 * `anomaly` is null where the value is missing or where the calendar month is
 * excluded for having data in fewer than 80% of the years. `climatology` has
 * 12 entries (index 0 = January); an entry is NaN if that calendar month has no
 * usable data (the published JSON shows null there).
 */
export function deseasonalize(
  points: MonthlyPoint[],
  startYear: number,
  endYear: number,
): {
  t: number[];
  year: number[];
  month: number[];
  value: (number | null)[];
  anomaly: (number | null)[];
  climatology: number[];
} {
  const prep = prepareSeries(points);
  const t: number[] = [];
  const year: number[] = [];
  const month: number[] = [];
  const value: (number | null)[] = [];
  const anomaly: (number | null)[] = [];
  for (let i = 0; i < prep.n; i++) {
    if (prep.year[i] < startYear || prep.year[i] > endYear) continue;
    t.push(prep.t[i]);
    year.push(prep.year[i]);
    month.push(prep.month[i]);
    value.push(Number.isFinite(prep.value[i]) ? prep.value[i] : null);
    anomaly.push(Number.isFinite(prep.anomaly[i]) ? prep.anomaly[i] : null);
  }
  return { t, year, month, value, anomaly, climatology: Array.from(prep.climatology) };
}

// --------------------------------------------------------------------------
// Autocorrelation
// --------------------------------------------------------------------------

/** Lag-1 autocorrelation of an evenly spaced series (standard biased estimator). */
export function lag1Autocorrelation(x: Numeric): number {
  const n = x.length;
  if (n === 0) return 0;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  let denom = 0;
  let num = 0;
  for (let i = 0; i < n; i++) {
    const d = x[i] - mean;
    denom += d * d;
    if (i + 1 < n) num += d * (x[i + 1] - mean);
  }
  if (denom === 0 || n < 3) return 0;
  return num / denom;
}

/**
 * Lag-1 autocorrelation of a series observed at times `t` that may have gaps.
 * Only pairs of truly consecutive time steps are used. Equals
 * `lag1Autocorrelation` when nothing is missing.
 */
export function lag1AutocorrelationAt(t: Numeric, x: Numeric): number {
  const n = x.length;
  if (n < 3) return 0;
  let minStep = Infinity;
  for (let i = 1; i < n; i++) {
    const s = t[i] - t[i - 1];
    if (s < minStep) minStep = s;
  }
  const limit = 1.5 * minStep;
  let nPairs = 0;
  for (let i = 1; i < n; i++) if (t[i] - t[i - 1] < limit) nPairs++;
  if (nPairs === n - 1) return lag1Autocorrelation(x);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  let denom = 0;
  for (let i = 0; i < n; i++) denom += (x[i] - mean) * (x[i] - mean);
  if (denom === 0 || nPairs < 2) return 0;
  let num = 0;
  for (let i = 1; i < n; i++) {
    if (t[i] - t[i - 1] < limit) num += (x[i - 1] - mean) * (x[i] - mean);
  }
  const r1 = (num / nPairs / (denom / n)) * ((n - 1) / n);
  return Math.min(Math.max(r1, -1), 1);
}

// --------------------------------------------------------------------------
// Least squares with the AR(1) adjustment
// --------------------------------------------------------------------------

/**
 * Least-squares linear trend with an AR(1)-adjusted t-test (Santer et al. 2008).
 * Missing values (NaN) are dropped. Returns null with fewer than 8 valid points
 * (the Python raises ValueError).
 */
export function olsTrend(tIn: Numeric, yIn: Numeric, alpha: number = ALPHA): OlsFit | null {
  const { t, y } = finitePairs(tIn, yIn);
  const n = y.length;
  if (n < MIN_VALID_POINTS) return null;
  // Sums are taken in NumPy's order (see numpySum) so that ill-conditioned
  // quantities such as r^2 of a flat series agree with the Python to the last digits.
  const tm = numpySum(t, 0, n) / n;
  const ym = numpySum(y, 0, n) / n;
  const work = new Float64Array(n);
  for (let i = 0; i < n; i++) work[i] = (t[i] - tm) * (t[i] - tm);
  const sxx = numpySum(work, 0, n);
  for (let i = 0; i < n; i++) work[i] = (t[i] - tm) * (y[i] - ym);
  const slope = numpySum(work, 0, n) / sxx;
  const intercept = ym - slope * tm;
  const resid = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    resid[i] = y[i] - (intercept + slope * t[i]);
    work[i] = resid[i] * resid[i];
  }
  const sse = numpySum(work, 0, n);
  for (let i = 0; i < n; i++) work[i] = (y[i] - ym) * (y[i] - ym);
  const sst = numpySum(work, 0, n);
  const seNaive = Math.sqrt(sse / (n - 2) / sxx);
  const r1 = lag1AutocorrelationAt(t, resid);
  const r1Used = Math.min(Math.max(r1, 0), 0.99);
  const nEff = Math.max(3, (n * (1 - r1Used)) / (1 + r1Used));
  const seAdj = Math.sqrt(sse / (nEff - 2) / sxx);

  const interval = (se: number, df: number): OlsInterval => {
    if (se === 0) return { se, ciLow: slope, ciHigh: slope, pValue: slope !== 0 ? 0 : 1 };
    const tcrit = studentTQuantile(1 - alpha / 2, df);
    const p = studentTTwoSidedP(slope / se, df);
    return { se, ciLow: slope - tcrit * se, ciHigh: slope + tcrit * se, pValue: p };
  };

  return {
    n,
    slope,
    intercept,
    rSquared: sst === 0 ? 0 : 1 - sse / sst,
    residualStd: Math.sqrt(sse / (n - 2)),
    lag1: r1,
    nEffective: nEff,
    naive: interval(seNaive, n - 2),
    adjusted: interval(seAdj, nEff - 2),
  };
}

// --------------------------------------------------------------------------
// Mann-Kendall and Theil-Sen
// --------------------------------------------------------------------------

let scratchStep = new Float64Array(0);
let scratchTime = new Float64Array(0);

/**
 * One pass over all pairs i < j of a series: the Mann-Kendall score S, the
 * slopes per time step (y[j] - y[i]) / (j - i), and optionally the slopes
 * against the real time axis for the pairs with different times.
 */
function pairwise(
  x: Float64Array,
  t: Float64Array | null,
): { s: number; nStep: number; nTime: number } {
  const n = x.length;
  const nPairs = (n * (n - 1)) / 2;
  if (scratchStep.length < nPairs) scratchStep = new Float64Array(nPairs);
  if (t && scratchTime.length < nPairs) scratchTime = new Float64Array(nPairs);
  const step = scratchStep;
  const time = scratchTime;
  let s = 0;
  let k = 0;
  let kt = 0;
  for (let i = 0; i < n - 1; i++) {
    const xi = x[i];
    if (t) {
      const ti = t[i];
      for (let j = i + 1; j < n; j++) {
        const d = x[j] - xi;
        if (d > 0) s++;
        else if (d < 0) s--;
        step[k++] = d / (j - i);
        const dt = t[j] - ti;
        if (dt > 0) time[kt++] = d / dt;
        else if (dt < 0) time[kt++] = -d / -dt;
      }
    } else {
      for (let j = i + 1; j < n; j++) {
        const d = x[j] - xi;
        if (d > 0) s++;
        else if (d < 0) s--;
        step[k++] = d / (j - i);
      }
    }
  }
  return { s, nStep: k, nTime: kt };
}

function mannKendallFromPairs(
  x: Float64Array,
  s: number,
  senPerStep: number,
  tieSum: number,
  alpha: number,
  maxLag: number | null,
  conservative: boolean,
): MannKendallResult {
  const n = x.length;
  const varS = (n * (n - 1) * (2 * n + 5) - tieSum) / 18.0;
  const tau = s / (0.5 * n * (n - 1));
  const zOf = (v: number): number => {
    if (v <= 0 || s === 0) return 0;
    return s > 0 ? (s - 1) / Math.sqrt(v) : (s + 1) / Math.sqrt(v);
  };
  const zClassic = zOf(varS);
  const pClassic = erfc(Math.abs(zClassic) / SQRT2);

  const lag = maxLag === null ? n : Math.min(maxLag + 1, n);
  const detrended = new Float64Array(n);
  for (let i = 0; i < n; i++) detrended[i] = x[i] - (i + 1) * senPerStep;
  const ranks = rankAverage(detrended);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += ranks[i];
  mean /= n;
  for (let i = 0; i < n; i++) ranks[i] -= mean;
  let acov0 = 0;
  for (let i = 0; i < n; i++) acov0 += ranks[i] * ranks[i];
  const bound = normalQuantile(1 - alpha / 2) / Math.sqrt(n);
  let sni = 0;
  for (let i = 1; i < lag; i++) {
    let acov = 0;
    for (let j = 0; j + i < n; j++) acov += ranks[j] * ranks[j + i];
    const acf = acov / acov0;
    if (Math.abs(acf) > bound) sni += (n - i) * (n - i - 1) * (n - i - 2) * acf;
  }
  let factor = 1 + (2 / (n * (n - 1) * (n - 2))) * sni;
  if (conservative) factor = Math.max(factor, 1.0);
  const zHr = zOf(varS * factor);
  const pHr = erfc(Math.abs(zHr) / SQRT2);
  return {
    n,
    s,
    tau,
    classicZ: zClassic,
    classicPValue: pClassic,
    hamedRaoZ: zHr,
    hamedRaoPValue: pHr,
    varianceFactor: factor,
  };
}

/**
 * Mann-Kendall trend test, classic and Hamed-Rao (1998) corrected.
 * Missing values are dropped and the rest treated as consecutive. Returns null
 * with fewer than 8 valid points.
 */
export function mannKendall(
  y: Numeric,
  alpha: number = ALPHA,
  maxLag: number | null = MK_MAX_LAG,
  conservative: boolean = true,
): MannKendallResult | null {
  const x = Float64Array.from(y as ArrayLike<number>).filter((v) => Number.isFinite(v));
  if (x.length < MIN_VALID_POINTS) return null;
  const pairs = pairwise(x, null);
  const sen = medianInPlace(scratchStep, pairs.nStep);
  return mannKendallFromPairs(x, pairs.s, sen, tieTerm(x), alpha, maxLag, conservative);
}

/** Median of all pairwise slopes for an evenly spaced series (per time step). */
export function senSlopePerStep(x: Numeric): number {
  const xs = Float64Array.from(x as ArrayLike<number>);
  const pairs = pairwise(xs, null);
  return medianInPlace(scratchStep, pairs.nStep);
}

function theilSenFromSlopes(
  slopes: Float64Array,
  nt: number,
  t: Float64Array,
  y: Float64Array,
  tieSumT: number,
  tieSumY: number,
  alpha: number,
): TheilSenResult {
  const sorted = slopes.subarray(0, nt).sort();
  const slope =
    nt === 0
      ? NaN
      : nt % 2 === 1
        ? sorted[nt >>> 1]
        : (sorted[nt / 2 - 1] + sorted[nt / 2]) / 2;
  const intercept = medianOf(y) - slope * medianOf(t);
  // scipy: alpha is the confidence level; here `alpha` is the significance level.
  const z = normalQuantile(alpha / 2);
  const ny = y.length;
  const sigsq = (1 / 18) * (ny * (ny - 1) * (2 * ny + 5) - tieSumT - tieSumY);
  let ciLow = NaN;
  let ciHigh = NaN;
  if (nt > 0 && sigsq >= 0) {
    const sigma = Math.sqrt(sigsq);
    const ru = Math.min(roundHalfEven((nt - z * sigma) / 2), nt - 1);
    const rl = Math.max(roundHalfEven((nt + z * sigma) / 2) - 1, 0);
    if (ru >= 0 && rl < nt) {
      ciLow = sorted[rl];
      ciHigh = sorted[ru];
    }
  }
  return { slope, intercept, ciLow, ciHigh };
}

/**
 * Theil-Sen median slope with its rank-based confidence interval
 * (scipy.stats.theilslopes). The interval assumes independent values, so for
 * autocorrelated monthly data it is narrower than it should be.
 */
export function theilSen(tIn: Numeric, yIn: Numeric, alpha: number = ALPHA): TheilSenResult {
  const { t, y } = finitePairs(tIn, yIn);
  const pairs = pairwise(y, t);
  return theilSenFromSlopes(scratchTime, pairs.nTime, t, y, tieTerm(t), tieTerm(y), alpha);
}

// --------------------------------------------------------------------------
// Detectability
// --------------------------------------------------------------------------

/**
 * Years of monthly data needed to detect a trend (Weatherhead et al. 1998, eq. 3):
 * n* = [ (3.3 sigma / |omega|) sqrt((1 + phi) / (1 - phi)) ]^(2/3),
 * range n* exp(+-B), B = (4 / (3 sqrt(M))) sqrt((1 + phi) / (1 - phi)).
 */
export function yearsToDetect(
  slopePerYear: number,
  noiseStd: number,
  phi: number,
  recordYears: number,
): Detectability {
  const phiUsed = Math.min(Math.max(phi, 0), 0.95);
  const omega = Math.abs(slopePerYear);
  if (omega === 0 || noiseStd === 0) {
    return { yearsNeeded: null, low: null, high: null, recordYears, moreYears: null };
  }
  const ar = Math.sqrt((1 + phiUsed) / (1 - phiUsed));
  const nStar = Math.pow(((3.3 * noiseStd) / omega) * ar, 2 / 3);
  const b = (4 / (3 * Math.sqrt(recordYears * 12))) * ar;
  return {
    yearsNeeded: nStar,
    low: nStar * Math.exp(-b),
    high: nStar * Math.exp(b),
    recordYears,
    moreYears: Math.max(0, nStar - recordYears),
  };
}

// --------------------------------------------------------------------------
// Window trends
// --------------------------------------------------------------------------

function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

/**
 * The window rule of the Python (analysis.custom_trend + stats.ols_trend):
 * a window is analysed only if
 *   1. endYear - startYear + 1 >= 15 (MIN_WINDOW_YEARS),
 *   2. it lies inside the record: startYear >= first year and endYear <= last year,
 *   3. it holds at least 8 valid (non-missing, non-excluded) months.
 */
export function windowIsAllowed(prep: PreparedSeries, startYear: number, endYear: number): boolean {
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return false;
  if (endYear - startYear + 1 < MIN_WINDOW_YEARS) return false;
  if (startYear < prep.firstYear || endYear > prep.lastYear) return false;
  let valid = 0;
  for (let i = 0; i < prep.n; i++) {
    if (prep.year[i] >= startYear && prep.year[i] <= endYear && Number.isFinite(prep.anomaly[i])) {
      valid++;
    }
  }
  return valid >= MIN_VALID_POINTS;
}

function windowArrays(
  prep: PreparedSeries,
  startYear: number,
  endYear: number,
): { t: Float64Array; y: Float64Array; nRows: number } {
  let nRows = 0;
  let m = 0;
  for (let i = 0; i < prep.n; i++) {
    if (prep.year[i] >= startYear && prep.year[i] <= endYear) {
      nRows++;
      if (Number.isFinite(prep.anomaly[i])) m++;
    }
  }
  const t = new Float64Array(m);
  const y = new Float64Array(m);
  let k = 0;
  for (let i = 0; i < prep.n; i++) {
    if (
      prep.year[i] >= startYear &&
      prep.year[i] <= endYear &&
      Number.isFinite(prep.anomaly[i])
    ) {
      t[k] = prep.t[i];
      y[k] = prep.anomaly[i];
      k++;
    }
  }
  return { t, y, nRows };
}

/** All trend statistics for one window of an already prepared series. */
export function analyzePrepared(
  prep: PreparedSeries,
  startYear: number,
  endYear: number,
): TrendResult | null {
  if (!windowIsAllowed(prep, startYear, endYear)) return null;
  const { t, y, nRows } = windowArrays(prep, startYear, endYear);
  const ols = olsTrend(t, y);
  if (!ols) return null;

  const pairs = pairwise(y, t);
  const tieY = tieTerm(y);
  const sen = theilSenFromSlopes(scratchTime, pairs.nTime, t, y, tieTerm(t), tieY, ALPHA);
  const senPerStep = medianInPlace(scratchStep, pairs.nStep);
  const mk = mannKendallFromPairs(y, pairs.s, senPerStep, tieY, ALPHA, MK_MAX_LAG, true);

  // Record length counted in calendar months, so a partial first or last year
  // (NDVI starts in February 2000) is not overstated.
  const recordYears = nRows / 12;
  const detect = yearsToDetect(ols.slope, ols.residualStd, ols.lag1, recordYears);

  const olsSignificant = ols.adjusted.pValue < ALPHA;
  const mkSignificant = mk.hamedRaoPValue < ALPHA;
  return {
    startYear,
    endYear,
    nMonths: ols.n,
    slopePerDecade: ols.slope * 10,
    intercept: ols.intercept,
    rSquared: ols.rSquared,
    ciLow: ols.adjusted.ciLow * 10,
    ciHigh: ols.adjusted.ciHigh * 10,
    pValue: ols.adjusted.pValue,
    naivePValue: ols.naive.pValue,
    naiveCiLow: ols.naive.ciLow * 10,
    naiveCiHigh: ols.naive.ciHigh * 10,
    senSlopePerDecade: sen.slope * 10,
    senCiLow: finiteOrNull(sen.ciLow * 10),
    senCiHigh: finiteOrNull(sen.ciHigh * 10),
    mkTau: mk.tau,
    mkPValue: mk.hamedRaoPValue,
    mkClassicPValue: mk.classicPValue,
    lag1: ols.lag1,
    nEffective: ols.nEffective,
    residualStd: ols.residualStd,
    yearsNeeded: detect.yearsNeeded,
    significant: olsSignificant && mkSignificant,
    olsSignificant,
    mkSignificant,
    mkVarianceFactor: mk.varianceFactor,
    yearsNeededLow: detect.low,
    yearsNeededHigh: detect.high,
    recordYears,
    moreYears: detect.moreYears,
  };
}

/**
 * All trend statistics for the years startYear..endYear inclusive.
 *
 * `points` must be the variable's FULL record: the climatology (and the
 * sparse-calendar-month mask) are computed from all of it, then the window is
 * cut out. Returns null when the window is not allowed (see `windowIsAllowed`):
 * shorter than 15 calendar years, outside the record, or fewer than 8 valid months.
 */
export function analyzeTrend(
  points: MonthlyPoint[],
  startYear: number,
  endYear: number,
): TrendResult | null {
  return analyzePrepared(prepareSeries(points), startYear, endYear);
}

/** AR(1)-adjusted least-squares trend for one window (one cell of the heat map). */
export function windowTrendPrepared(
  prep: PreparedSeries,
  startYear: number,
  endYear: number,
): WindowTrend | null {
  if (!windowIsAllowed(prep, startYear, endYear)) return null;
  const { t, y } = windowArrays(prep, startYear, endYear);
  const ols = olsTrend(t, y);
  if (!ols) return null;
  return {
    start: startYear,
    end: endYear,
    slopePerDecade: ols.slope * 10,
    intercept: ols.intercept,
    ciLow: ols.adjusted.ciLow * 10,
    ciHigh: ols.adjusted.ciHigh * 10,
    pValue: ols.adjusted.pValue,
    significant: ols.adjusted.pValue < ALPHA,
  };
}

export function windowTrend(
  points: MonthlyPoint[],
  startYear: number,
  endYear: number,
): WindowTrend | null {
  return windowTrendPrepared(prepareSeries(points), startYear, endYear);
}

/**
 * Every start year and end year at least 15 years apart, in the Python's order
 * (start ascending, then end ascending): 496 windows for 1981-2025, 91 for 2000-2026.
 */
export function allWindows(points: MonthlyPoint[]): WindowTrend[] {
  const prep = prepareSeries(points);
  const out: WindowTrend[] = [];
  for (let start = prep.firstYear; start <= prep.lastYear - MIN_WINDOW_YEARS + 1; start++) {
    for (let end = start + MIN_WINDOW_YEARS - 1; end <= prep.lastYear; end++) {
      const w = windowTrendPrepared(prep, start, end);
      if (w) out.push(w);
    }
  }
  return out;
}

export interface WindowsSummary {
  nWindows: number;
  minYears: number;
  shareSameDirection: number;
  shareSignificantSameDirection: number;
  shareSignificantOppositeDirection: number;
  slopeMin: number;
  slopeMax: number;
}

/** Descriptive shares over the date windows, relative to the full-record slope's sign. */
export function summarizeWindows(windows: WindowTrend[], fullSlope: number): WindowsSummary {
  const sign = Math.sign(fullSlope);
  let same = 0;
  let sigSame = 0;
  let sigOpposite = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const w of windows) {
    const isSame = Math.sign(w.slopePerDecade) === sign;
    if (isSame) same++;
    if (isSame && w.significant) sigSame++;
    if (!isSame && w.significant) sigOpposite++;
    if (w.slopePerDecade < min) min = w.slopePerDecade;
    if (w.slopePerDecade > max) max = w.slopePerDecade;
  }
  const n = windows.length;
  return {
    nWindows: n,
    minYears: MIN_WINDOW_YEARS,
    shareSameDirection: same / n,
    shareSignificantSameDirection: sigSame / n,
    shareSignificantOppositeDirection: sigOpposite / n,
    slopeMin: min,
    slopeMax: max,
  };
}

// --------------------------------------------------------------------------
// Level shift at a documented date
// --------------------------------------------------------------------------

export interface LevelShiftTerm {
  value: number;
  se: number;
  ciLow: number;
  ciHigh: number;
  pValue: number;
}

export interface LevelShiftFit {
  n: number;
  /** The step c at the date. */
  step: LevelShiftTerm;
  /** The steady drift b, per unit of t (per year). */
  driftPerYear: LevelShiftTerm;
  lag1: number;
  nEffective: number;
  sse: number;
}

/**
 * Size of a step in `y` at a known date, with a steady drift allowed.
 *
 * Fits y = a + b (t - mean t) + c * after by least squares; c is the step and
 * b the drift. Standard errors allow for persistence as in `olsTrend`:
 * n_eff = n (1 - r1) / (1 + r1), at least 5, with n_eff - 3 degrees of freedom.
 *
 * The date must come from outside the data (a documented change in a dataset).
 * Returns null unless there are at least 12 valid points on each side.
 */
export function levelShift(
  tIn: Numeric,
  yIn: ArrayLike<number | null>,
  afterIn: ArrayLike<boolean>,
  alpha: number = ALPHA,
): LevelShiftFit | null {
  const len = Math.min(tIn.length, yIn.length, afterIn.length);
  const tArr: number[] = [];
  const yArr: number[] = [];
  const aArr: number[] = [];
  let nAfter = 0;
  for (let i = 0; i < len; i++) {
    const yi = yIn[i];
    if (Number.isFinite(tIn[i]) && isFiniteNumber(yi)) {
      tArr.push(tIn[i]);
      yArr.push(yi);
      aArr.push(afterIn[i] ? 1 : 0);
      if (afterIn[i]) nAfter++;
    }
  }
  const n = yArr.length;
  if (n < 24 || nAfter < 12 || n - nAfter < 12) return null;
  let tm = 0;
  for (let i = 0; i < n; i++) tm += tArr[i];
  tm /= n;

  // Normal equations for the design [1, t - mean t, after].
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const v = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const x1 = tArr[i] - tm;
    const x2 = aArr[i];
    const yi = yArr[i];
    m[0] += 1;
    m[1] += x1;
    m[2] += x2;
    m[4] += x1 * x1;
    m[5] += x1 * x2;
    m[8] += x2 * x2;
    v[0] += yi;
    v[1] += x1 * yi;
    v[2] += x2 * yi;
  }
  m[3] = m[1];
  m[6] = m[2];
  m[7] = m[5];
  const c00 = m[4] * m[8] - m[5] * m[7];
  const c01 = m[5] * m[6] - m[3] * m[8];
  const c02 = m[3] * m[7] - m[4] * m[6];
  const det = m[0] * c00 + m[1] * c01 + m[2] * c02;
  if (det === 0) return null;
  const inv = [
    c00 / det,
    (m[2] * m[7] - m[1] * m[8]) / det,
    (m[1] * m[5] - m[2] * m[4]) / det,
    c01 / det,
    (m[0] * m[8] - m[2] * m[6]) / det,
    (m[2] * m[3] - m[0] * m[5]) / det,
    c02 / det,
    (m[1] * m[6] - m[0] * m[7]) / det,
    (m[0] * m[4] - m[1] * m[3]) / det,
  ];
  const beta = [
    inv[0] * v[0] + inv[1] * v[1] + inv[2] * v[2],
    inv[3] * v[0] + inv[4] * v[1] + inv[5] * v[2],
    inv[6] * v[0] + inv[7] * v[1] + inv[8] * v[2],
  ];
  const resid = new Float64Array(n);
  let sse = 0;
  for (let i = 0; i < n; i++) {
    resid[i] = yArr[i] - (beta[0] + beta[1] * (tArr[i] - tm) + beta[2] * aArr[i]);
    sse += resid[i] * resid[i];
  }
  const r1 = lag1AutocorrelationAt(tArr, resid);
  const r1Used = Math.min(Math.max(r1, 0), 0.99);
  const nEff = Math.max(5, (n * (1 - r1Used)) / (1 + r1Used));
  const df = nEff - 3;
  const tcrit = studentTQuantile(1 - alpha / 2, df);
  const term = (i: number): LevelShiftTerm => {
    const value = beta[i];
    const se = Math.sqrt((inv[i * 4] * sse) / df);
    const pValue =
      se === 0 && value === 0 ? 1 : se === 0 ? 0 : studentTTwoSidedP(value / se, df);
    return { value, se, ciLow: value - tcrit * se, ciHigh: value + tcrit * se, pValue };
  };
  return { n, step: term(2), driftPerYear: term(1), lag1: r1, nEffective: nEff, sse };
}

export interface SubTrend {
  slopePerDecade: number;
  ciLow: number;
  ciHigh: number;
  pValue: number;
  significant: boolean;
}

export interface LevelShiftPeriod {
  start: number;
  end: number;
  main: SubTrend;
  independent: SubTrend;
  rangesOverlap: boolean;
}

export interface LevelShiftTestResult {
  breakYear: number;
  /** Mean of (main - independent) raw values before the break year. */
  gapBefore: number;
  /** The same from the break year on. */
  gapAfter: number;
  step: { value: number; ciLow: number; ciHigh: number; pValue: number };
  driftPerDecade: { value: number; ciLow: number; ciHigh: number };
  /** The single break year with the smallest squared error (a consistency check only). */
  bestFitBreakYear: number;
  periods: LevelShiftPeriod[];
  /** The underlying fit, for display. */
  fit: LevelShiftFit;
}

function subTrend(t: Float64Array, y: Float64Array, keep: (i: number) => boolean): SubTrend | null {
  const tt: number[] = [];
  const yy: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (keep(i)) {
      tt.push(t[i]);
      yy.push(y[i]);
    }
  }
  const ols = olsTrend(tt, yy);
  if (!ols) return null;
  return {
    slopePerDecade: ols.slope * 10,
    ciLow: ols.adjusted.ciLow * 10,
    ciHigh: ols.adjusted.ciHigh * 10,
    pValue: ols.adjusted.pValue,
    significant: ols.adjusted.pValue < ALPHA,
  };
}

/**
 * The documented-break test of the Python's `crosscheck.known_issue`, used for
 * the 2005 shift in MERRA-2 rainfall over the south-western Amazon.
 *
 * `main` is the primary series (MERRA-2) and `independent` the second record
 * (GPCP), both as raw monthly values covering exactly the same months. The step
 * model is fitted to the difference of their anomalies; `breakYear` must be a
 * documented year, not one chosen from the data.
 *
 * NOTE: the published analysis JSON does not contain the independent series,
 * so the app can only call this if that series is supplied separately.
 * Returns null if the two series do not cover the same months or are too short.
 */
export function levelShiftTest(
  main: MonthlyPoint[],
  independent: MonthlyPoint[],
  breakYear: number,
  minYears: number = 5,
): LevelShiftTestResult | null {
  const a = prepareSeries(main);
  // The independent series is restricted to the main series' period, and its
  // anomalies are taken without the sparse-month mask, as in the Python.
  const inPeriod = independent.filter((p) => p.year >= a.firstYear && p.year <= a.lastYear);
  const bRaw = prepareSeries(inPeriod);
  if (bRaw.n !== a.n) return null;
  for (let i = 0; i < a.n; i++) {
    if (bRaw.year[i] !== a.year[i] || bRaw.month[i] !== a.month[i]) return null;
  }
  const bClim = monthlyClimatology(bRaw.month, bRaw.value);
  const bAnom = new Float64Array(a.n);
  for (let i = 0; i < a.n; i++) bAnom[i] = bRaw.value[i] - bClim[bRaw.month[i] - 1];

  let sumBefore = 0;
  let nBefore = 0;
  let sumAfter = 0;
  let nAfterGap = 0;
  const difference = new Float64Array(a.n);
  for (let i = 0; i < a.n; i++) {
    const gap = a.value[i] - bRaw.value[i];
    if (Number.isFinite(gap)) {
      if (a.year[i] >= breakYear) {
        sumAfter += gap;
        nAfterGap++;
      } else {
        sumBefore += gap;
        nBefore++;
      }
    }
    difference[i] = a.anomaly[i] - bAnom[i];
  }
  const after = (y0: number): boolean[] => Array.from(a.year, (y) => y >= y0);
  const fit = levelShift(a.t, difference, after(breakYear));
  if (!fit) return null;

  let best = breakYear;
  let bestSse = Infinity;
  for (let y0 = a.firstYear + minYears; y0 <= a.lastYear - minYears + 1; y0++) {
    const f = levelShift(a.t, difference, after(y0));
    if (f && f.sse < bestSse) {
      bestSse = f.sse;
      best = y0;
    }
  }

  const periods: LevelShiftPeriod[] = [];
  const spans: [number, number, (i: number) => boolean][] = [
    [a.firstYear, breakYear - 1, (i) => a.year[i] < breakYear],
    [breakYear, a.lastYear, (i) => a.year[i] >= breakYear],
  ];
  for (const [start, end, keep] of spans) {
    const m = subTrend(a.t, a.anomaly, keep);
    const o = subTrend(a.t, bAnom, keep);
    if (!m || !o) return null;
    periods.push({
      start,
      end,
      main: m,
      independent: o,
      rangesOverlap: m.ciLow <= o.ciHigh && o.ciLow <= m.ciHigh,
    });
  }

  return {
    breakYear,
    gapBefore: sumBefore / nBefore,
    gapAfter: sumAfter / nAfterGap,
    step: {
      value: fit.step.value,
      ciLow: fit.step.ciLow,
      ciHigh: fit.step.ciHigh,
      pValue: fit.step.pValue,
    },
    driftPerDecade: {
      value: fit.driftPerYear.value * 10,
      ciLow: fit.driftPerYear.ciLow * 10,
      ciHigh: fit.driftPerYear.ciHigh * 10,
    },
    bestFitBreakYear: best,
    periods,
    fit,
  };
}

// --------------------------------------------------------------------------
// Plain-language method statement (taken from docs/METHODOLOGY.md; no new claims)
// --------------------------------------------------------------------------

export const TREND_METHOD: {
  name: string;
  nullHypothesis: string;
  autocorrelation: string;
  significanceRule: string;
  limitations: string[];
  references: string[];
} = {
  name:
    "Least-squares trend of monthly anomalies with an AR(1)-adjusted t-test (Santer et al. 2008), " +
    "cross-checked with Sen's slope and a Mann-Kendall test with the Hamed-Rao correction (1998). " +
    "For each calendar month, the climatology is the mean of all values for that month over the " +
    "variable's full record; the anomaly is the value minus its month's climatology. Time is " +
    "measured in decimal years at mid-month and slopes are reported per decade.",
  nullHypothesis:
    "No trend: the anomalies have zero slope against time (adjusted t-test) and no monotonic " +
    "trend (Mann-Kendall test). A result that is not significant means the estimated change " +
    "cannot be told apart from natural variability; it does not mean nothing changed.",
  autocorrelation:
    "Monthly anomalies are persistent: a warm month tends to follow a warm month. Tests that " +
    "assume independent values then overstate significance. With r1 the lag-1 autocorrelation of " +
    "the regression residuals, the effective sample size is n_eff = n (1 - r1) / (1 + r1). The " +
    "standard error of the slope, the 95% confidence interval and the p-value use n_eff - 2 " +
    "degrees of freedom in place of n - 2. Negative r1 is treated as zero, so the adjustment can " +
    "only widen the interval. The Mann-Kendall variance is multiplied by the Hamed-Rao factor, " +
    "built from the autocorrelations of the ranks of the Sen-detrended series that are " +
    "individually significant at the 5% level, for lags 1 to 24 months; the factor is not allowed " +
    "below 1, so the correction cannot make a trend look more significant than the uncorrected test.",
  significanceRule:
    "\"Significant\" means p < 0.05 throughout. A full-record trend is called significant only if " +
    "both corrected tests give p < 0.05. Date windows (at least 15 years) are marked using the " +
    "adjusted t-test alone; windows overlap heavily and are not independent tests.",
  limitations: [
    "Reanalysis, not observation: MERRA-2 is a model constrained by observations, and the mix of observations it assimilates changed over 1981-2025. Such changes can create or mask trends.",
    "Independent validation is partial: only rainfall and temperature have a second dataset; humidity, wind speed, soil wetness and NDVI have none, and nothing has been compared with station data.",
    "Linear trends only: a straight line can be a poor description of a series with steps, cycles or regime shifts.",
    "AR(1) only: the t-test adjustment assumes persistence is described by lag-1 autocorrelation. Long-memory behaviour would make the intervals too narrow.",
    "Skewed variables: precipitation anomalies are far from normally distributed, and in regions with a dry season most of the change sits in the wet months. There the least-squares slope (a change in the mean) and Sen's slope (a change in the typical month) can differ by an order of magnitude, as in the Central Sahel. The headline rate is the change in the mean.",
    "Sen's slope interval is rank-based and assumes independent values, so it is not used as the headline interval.",
    "Missing months are never filled in. The Hamed-Rao correction treats the remaining months as consecutive, which is an approximation.",
    "Coarse boxes: rectangles average over different land covers, elevations and, in places, ocean. A regional mean can hide opposing local trends.",
    "Association, not cause: a significant trend says the series changed. It does not identify why.",
    "Detected is not validated: a significant trend that holds across dates can still be wrong about the real world.",
    "Thresholds: p < 0.05 is a convention. The 15-year minimum window and the 24-month lag limit are judgment calls made for clarity.",
    "Years needed to detect answers \"if the true trend were this size, how long a record would be needed\"; it is not a prediction that the trend will continue.",
  ],
  references: [
    "Santer, B. D., et al. (2008). Consistency of modelled and observed temperature trends in the tropical troposphere. Int. J. Climatol., 28, 1703-1722.",
    "Mann, H. B. (1945). Nonparametric tests against trend. Econometrica, 13, 245-259.",
    "Kendall, M. G. (1975). Rank Correlation Methods. Griffin.",
    "Hamed, K. H., & Rao, A. R. (1998). A modified Mann-Kendall trend test for autocorrelated data. J. Hydrol., 204, 182-196.",
    "Sen, P. K. (1968). Estimates of the regression coefficient based on Kendall's tau. J. Am. Stat. Assoc., 63, 1379-1389.",
    "Weatherhead, E. C., et al. (1998). Factors affecting the detection of trends. J. Geophys. Res., 103, 17149-17161.",
  ],
};
