/**
 * Observed-rainfall exposure screen. Pure and deterministic.
 *
 * What it does: for each site it takes OBSERVED daily rainfall (NOAA Stage IV radar and gauge
 * analysis), finds the largest total over 1, 2, 3, 4 and 7 consecutive days, and compares each
 * with the NOAA Atlas 14 precipitation frequency estimate for the same place and duration.
 * A site is "inside the rainfall screen" when an observed total reaches the Atlas 14 depth for the
 * chosen average recurrence interval (ARI).
 *
 * What it does not do: it does not estimate flood depth, inundation, damage or shutdown. Rainfall
 * rarity is a hazard indicator. Whether a site floods depends on drainage, river stage, levees,
 * pumps and local elevation, none of which are modelled. See RAINFALL_CARD.
 *
 * Data: public/data/rainfall/harvey_2017_*.json, built by research/scripts/build_harvey_rainfall.py.
 */

export const MM_PER_INCH = 25.4;

/** Atlas 14 durations that daily data can address, with their length in days. */
export const DURATIONS = [
  { key: "24-hr", days: 1, label: "1 day" },
  { key: "2-day", days: 2, label: "2 days" },
  { key: "3-day", days: 3, label: "3 days" },
  { key: "4-day", days: 4, label: "4 days" },
  { key: "7-day", days: 7, label: "7 days" },
] as const;
export type DurationKey = (typeof DURATIONS)[number]["key"];

export interface Atlas14 {
  volume?: string | null;
  projectArea?: string | null;
  /** Average recurrence intervals, years, ascending (1 ... 1000). */
  ariYears: number[];
  /** Depth (mm) by duration, one value per ARI. */
  mm: Record<string, number[]>;
  upper90: Record<string, number[]>;
  lower90: Record<string, number[]>;
}

export interface AssetRain {
  id: string;
  kind: "refinery" | "port";
  /** Which site lists the record belongs to: "2026" (current refineries), "2017" (fleet at the time), "ports". */
  fleets?: string[];
  lat?: number;
  lon?: number;
  stage4: { dailyMm: (number | null)[]; block3x3TotalMm: { min: number; max: number } | null };
  atlas14: Atlas14 | null;
  nasa: { imergDailyMm: (number | null)[]; merra2DailyMm: (number | null)[] } | null;
  elevationM: number | null;
  nfhl: { mapped: boolean; zone: string | null; subtype: string | null; sfha: boolean | null } | null;
  hwm: { within2km: number; within5km: number; nearestKm: number; withHeightWithin5km: number; maxHeightFtWithin5km: number | null; medianHeightFtWithin5km: number | null };
}

/** Sum of a daily series; null when any value is missing (a partial sum would understate the total). */
export function total(daily: (number | null)[]): number | null {
  let s = 0;
  for (const v of daily) {
    if (v === null || !Number.isFinite(v)) return null;
    s += v;
  }
  return s;
}

/** Cumulative total through day index i (inclusive); null from the first missing value on. */
export function cumulative(daily: (number | null)[]): (number | null)[] {
  const out: (number | null)[] = [];
  let s: number | null = 0;
  for (const v of daily) {
    s = s === null || v === null || !Number.isFinite(v) ? null : s + v;
    out.push(s);
  }
  return out;
}

/**
 * Largest total over k consecutive days. Windows containing a missing day are skipped.
 * Returns null when no complete window exists.
 */
export function maxRunningTotal(daily: (number | null)[], k: number): { mm: number; startIndex: number } | null {
  if (!Number.isInteger(k) || k < 1) throw new Error("k must be a positive integer");
  let best: { mm: number; startIndex: number } | null = null;
  for (let i = 0; i + k <= daily.length; i++) {
    let s = 0;
    let ok = true;
    for (let j = i; j < i + k; j++) {
      const v = daily[j];
      if (v === null || !Number.isFinite(v)) {
        ok = false;
        break;
      }
      s += v;
    }
    if (ok && (!best || s > best.mm)) best = { mm: s, startIndex: i };
  }
  return best;
}

/**
 * Largest tabulated ARI whose depth the observed depth reaches. 0 = below the smallest tabulated
 * ARI. Nothing is extrapolated beyond the table: an observation above the last value is reported
 * as "at least" the last ARI (1,000 years), never as a longer return period.
 */
export function ariReached(depthMm: number, ariYears: number[], depthsMm: number[]): number {
  if (ariYears.length !== depthsMm.length) throw new Error("ARI and depth arrays differ in length");
  let out = 0;
  for (let i = 0; i < ariYears.length; i++) if (depthMm >= depthsMm[i]) out = ariYears[i];
  return out;
}

export interface DurationResult {
  key: DurationKey;
  days: number;
  /** Largest observed total over this many consecutive days (mm); null when the series has gaps. */
  observedMm: number | null;
  startIndex: number | null;
  /** Largest tabulated ARI reached using the Atlas 14 estimate, and using its 90% bounds. */
  ari: number | null;
  /** Using the upper 90% bound of Atlas 14 (harder to reach: a conservative reading). */
  ariConservative: number | null;
  /** Using the lower 90% bound of Atlas 14 (easier to reach). */
  ariLiberal: number | null;
  /** Observed total divided by the Atlas 14 100-year depth. */
  ratioTo100yr: number | null;
  atlas100Mm: number | null;
}

export interface RainExposure {
  id: string;
  kind: "refinery" | "port";
  totalMm: number | null;
  durations: DurationResult[];
  /** Highest ARI reached over the five durations, and the duration that gives it. */
  peakAri: number | null;
  peakAriConservative: number | null;
  peakAriLiberal: number | null;
  peakDuration: DurationKey | null;
  /** Largest ratio to the 100-year depth over the five durations. */
  peakRatioTo100yr: number | null;
}

/** Rainfall scaled by a factor, for sensitivity to error in the rainfall analysis itself. */
const scaled = (daily: (number | null)[], f: number) => (f === 1 ? daily : daily.map((v) => (v === null ? null : v * f)));

export function rainExposure(a: AssetRain, rainFactor = 1): RainExposure {
  const daily = scaled(a.stage4.dailyMm, rainFactor);
  const at = a.atlas14;
  const durations: DurationResult[] = DURATIONS.map((d) => {
    const m = maxRunningTotal(daily, d.days);
    const i100 = at ? at.ariYears.indexOf(100) : -1;
    const atlas100 = at && i100 >= 0 && at.mm[d.key] ? at.mm[d.key][i100] : null;
    const has = !!m && !!at && !!at.mm[d.key] && !!at.upper90[d.key] && !!at.lower90[d.key];
    return {
      key: d.key,
      days: d.days,
      observedMm: m ? m.mm : null,
      startIndex: m ? m.startIndex : null,
      ari: has ? ariReached(m!.mm, at!.ariYears, at!.mm[d.key]) : null,
      ariConservative: has ? ariReached(m!.mm, at!.ariYears, at!.upper90[d.key]) : null,
      ariLiberal: has ? ariReached(m!.mm, at!.ariYears, at!.lower90[d.key]) : null,
      ratioTo100yr: m && atlas100 ? m.mm / atlas100 : null,
      atlas100Mm: atlas100,
    };
  });
  const maxOf = (f: (d: DurationResult) => number | null) => {
    const v = durations.map(f).filter((x): x is number => x !== null);
    return v.length ? Math.max(...v) : null;
  };
  const peakAri = maxOf((d) => d.ari);
  // Among durations reaching the peak ARI, report the one with the largest ratio to its own 100-year depth.
  const top = durations.filter((d) => d.ari !== null && d.ari === peakAri).sort((x, y) => (y.ratioTo100yr ?? 0) - (x.ratioTo100yr ?? 0))[0];
  return {
    id: a.id,
    kind: a.kind,
    totalMm: total(daily),
    durations,
    peakAri,
    peakAriConservative: maxOf((d) => d.ariConservative),
    peakAriLiberal: maxOf((d) => d.ariLiberal),
    peakDuration: top ? top.key : null,
    peakRatioTo100yr: maxOf((d) => d.ratioTo100yr),
  };
}

/** ARI levels offered as the screening threshold. All are tabulated Atlas 14 values. */
export const SCREEN_ARIS = [10, 25, 100, 500, 1000] as const;
export type ScreenAri = (typeof SCREEN_ARIS)[number];
export type Reading = "estimate" | "conservative" | "liberal";

export const ariFor = (e: RainExposure, reading: Reading): number | null => (reading === "estimate" ? e.peakAri : reading === "conservative" ? e.peakAriConservative : e.peakAriLiberal);

/** True when the site's observed rainfall reaches the Atlas 14 depth for ariYears at any of the five durations. */
export function inRainScreen(e: RainExposure, ariYears: number, reading: Reading = "estimate"): boolean | null {
  const a = ariFor(e, reading);
  return a === null ? null : a >= ariYears;
}

export interface CapacityAsset {
  id: string;
  capacityBpd?: number | null;
}

export interface ScreenSummary {
  ariYears: number;
  reading: Reading;
  /** Site ids inside the screen. */
  inside: string[];
  /** Sites that could not be classified (no Atlas 14 value or gaps in the rainfall series). */
  unclassified: string[];
  /** Sum of capacity over refineries inside. Exposure to rare rainfall, NOT lost production. */
  capacityBpd: number;
  /** Refineries inside with no capacity value (counted, never zero-filled). */
  capacityUnknown: number;
}

export function screenSummary(exposures: RainExposure[], refineries: CapacityAsset[], ariYears: number, reading: Reading = "estimate"): ScreenSummary {
  const cap = new Map(refineries.map((r) => [r.id, r.capacityBpd]));
  const inside: string[] = [];
  const unclassified: string[] = [];
  let capacityBpd = 0;
  let capacityUnknown = 0;
  for (const e of exposures) {
    const hit = inRainScreen(e, ariYears, reading);
    if (hit === null) unclassified.push(e.id);
    else if (hit) {
      inside.push(e.id);
      if (e.kind === "refinery") {
        const c = cap.get(e.id);
        if (typeof c === "number" && Number.isFinite(c)) capacityBpd += c;
        else capacityUnknown++;
      }
    }
  }
  return { ariYears, reading, inside, unclassified, capacityBpd, capacityUnknown };
}

/* ---------- comparison with a documented record ---------- */

export interface Contingency {
  /** In the screen and in the record. */
  hits: string[];
  /** In the record, not in the screen. */
  misses: string[];
  /** In the screen, not in the record. */
  falseAlarms: string[];
  /** In neither. */
  correctNegatives: string[];
  /** hits / (hits + misses); null when the record is empty. */
  hitRate: number | null;
  /** falseAlarms / (hits + falseAlarms); null when the screen is empty. */
  falseAlarmRatio: number | null;
  /** hits / (hits + misses + falseAlarms); null when all three are zero. */
  criticalSuccessIndex: number | null;
}

/**
 * Standard 2 x 2 contingency scores for a yes/no screen against a yes/no record, over a stated
 * universe of sites. Ids outside the universe are ignored on both sides.
 */
export function contingency(universe: string[], screened: Iterable<string>, recorded: Iterable<string>): Contingency {
  const u = new Set(universe);
  const s = new Set([...screened].filter((x) => u.has(x)));
  const r = new Set([...recorded].filter((x) => u.has(x)));
  const hits: string[] = [];
  const misses: string[] = [];
  const falseAlarms: string[] = [];
  const correctNegatives: string[] = [];
  for (const id of universe) {
    const a = s.has(id);
    const b = r.has(id);
    (a && b ? hits : !a && b ? misses : a && !b ? falseAlarms : correctNegatives).push(id);
  }
  const h = hits.length;
  const m = misses.length;
  const f = falseAlarms.length;
  return {
    hits,
    misses,
    falseAlarms,
    correctNegatives,
    hitRate: h + m ? h / (h + m) : null,
    falseAlarmRatio: h + f ? f / (h + f) : null,
    criticalSuccessIndex: h + m + f ? h / (h + m + f) : null,
  };
}

/* ---------- gridded field ---------- */

export interface RainGridFile {
  meta: Record<string, unknown>;
  grid: { west: number; south: number; east: number; north: number; step: number; nx: number; ny: number };
  /** One field per day; mm, row-major, row 0 = southernmost; -1 = no data. */
  days: { date: string; periodEnd: string; mm: number[] }[];
}

/**
 * Accumulated rainfall through day index dayIndex (inclusive), mm. NaN where any day so far has
 * no data. dayIndex < 0 returns zeros.
 */
export function accumulate(g: RainGridFile, dayIndex: number): Float32Array {
  const n = g.grid.nx * g.grid.ny;
  const out = new Float32Array(n);
  const last = Math.min(dayIndex, g.days.length - 1);
  for (let d = 0; d <= last; d++) {
    const mm = g.days[d].mm;
    for (let i = 0; i < n; i++) out[i] = mm[i] < 0 || Number.isNaN(out[i]) ? NaN : out[i] + mm[i];
  }
  return out;
}

/** Value of the grid cell containing a point; null outside the grid or where there is no data. */
export function sampleGrid(g: RainGridFile["grid"], field: ArrayLike<number>, lat: number, lon: number): number | null {
  const i = Math.floor((lon - g.west) / g.step);
  const j = Math.floor((lat - g.south) / g.step);
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return null;
  const v = field[j * g.nx + i];
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/** Colour ramp for accumulated rainfall (mm). Sequential, light to dark; the last stop is open-ended. */
export const RAIN_STOPS: { mm: number; rgb: [number, number, number] }[] = [
  { mm: 25, rgb: [214, 238, 255] },
  { mm: 50, rgb: [168, 215, 255] },
  { mm: 100, rgb: [112, 180, 255] },
  { mm: 200, rgb: [52, 132, 255] },
  { mm: 300, rgb: [29, 96, 235] },
  { mm: 500, rgb: [48, 58, 196] },
  { mm: 750, rgb: [92, 42, 176] },
  { mm: 1000, rgb: [140, 30, 150] },
  { mm: 1250, rgb: [190, 24, 110] },
];

/** Index of the highest colour stop a rainfall amount reaches; -1 below the first stop. */
export function rainClass(mm: number): number {
  let k = -1;
  for (let i = 0; i < RAIN_STOPS.length; i++) if (mm >= RAIN_STOPS[i].mm) k = i;
  return k;
}

/** Class colour for a rainfall amount: the highest stop reached; null below the first stop. */
export function rainColor(mm: number): [number, number, number] | null {
  const k = rainClass(mm);
  return k < 0 ? null : RAIN_STOPS[k].rgb;
}

/** Colour for a site by the largest ARI its rainfall reached. */
export function ariColor(ari: number | null): string {
  if (ari === null) return "#8b97a8";
  if (ari >= 1000) return "#8c1e96";
  if (ari >= 500) return "#5c2ab0";
  if (ari >= 100) return "#1d60eb";
  if (ari >= 25) return "#3484ff";
  if (ari >= 10) return "#70b4ff";
  return "#b9c6d8";
}

export function ariLabel(ari: number | null): string {
  if (ari === null) return "not classified";
  if (ari === 0) return "below the 1-year depth";
  if (ari >= 1000) return "at or above the 1,000-year depth";
  return `at or above the ${ari.toLocaleString("en-US")}-year depth`;
}

export const fmtMm = (mm: number | null, dec = 0): string => (mm === null ? "n/a" : `${mm.toFixed(dec)} mm (${(mm / MM_PER_INCH).toFixed(1)} in)`);

/**
 * Model card for the rainfall screen. The hindcast lines quote research/rainfall_hindcast_results.json;
 * rainfall.data.test.ts fails if the code stops reproducing them.
 */
export const RAINFALL_CARD = {
  name: "Observed-rainfall exposure screen v0.1 (Hurricane Harvey, 2017)",
  status: "EXPERIMENTAL. Rainfall, terrain and flood evidence are observations. The screen that counts sites is a simple comparison, tested on one storm and not validated as a predictor of flooding or shutdowns.",
  inputs: [
    "Daily rainfall, 24 August to 2 September 2017: NOAA NWS/NCEP Stage IV radar and rain-gauge analysis, about 4 km, 24-hour totals ending 12:00 UTC (OBSERVED)",
    "Second estimates at each site: NASA GPM IMERG and NASA MERRA-2, through the NASA POWER service (OBSERVED / reanalysis)",
    "Rainfall rarity: NOAA Atlas 14 precipitation frequency estimates at each site, with 90% confidence bounds",
    "Ground elevation at each site point: USGS 3DEP",
    "Regulatory flood zone at each site point: FEMA National Flood Hazard Layer (current map, not the 2017 map)",
    "Surveyed high-water marks: USGS Flood Event Data, 2017 Harvey (2,364 marks)",
    "Storm track and wind radii: NOAA NHC HURDAT2 best track",
    "Refineries and ports: U.S. EIA and USACE/BTS, as in the rest of the app; the hindcast uses the EIA fleet as of 1 January 2017",
  ],
  formula: [
    "P_d = largest rainfall total over d consecutive days at the site's analysis cell, d = 1, 2, 3, 4, 7",
    "A_d(T) = NOAA Atlas 14 depth for duration d and average recurrence interval T at the site",
    "reached_d = largest tabulated T (1 to 1,000 years) with P_d >= A_d(T); never extrapolated past 1,000 years",
    "site is in the screen when max over d of reached_d >= the chosen T",
    "capacity_in_screen = sum of EIA capacity over refineries in the screen",
    "uncertainty: the same with the lower and upper 90% bounds of A_d(T), and with rainfall scaled by 0.8 and 1.2",
  ],
  limitations: [
    "No flood depth, inundation extent, damage or shutdown is estimated. Rare rainfall is a hazard indicator; flooding depends on drainage, river and bayou stage, levees, pumps and site grading, none of which are modelled.",
    "Fixed 12:00 UTC days cannot find the true largest 24-hour amount, so the 1-day comparison understates rarity. Atlas 14 values are point estimates; a 4-km cell average is lower than the largest point inside it.",
    "NOAA Atlas 14 Volume 11 (Texas, 2018) was published after Harvey and includes it in its record, so the 'expected' depths already reflect this storm.",
    "A refinery is one point here. Real sites cover several square kilometres with their own drainage and flood defences.",
    "High-water marks exist where survey crews went. No mark near a site is not evidence that it stayed dry, and a mark nearby is not a measurement inside the fence.",
    "The FEMA zone is the regulatory map in force when the file was built, not the 2017 map, and is not an observation of flooding.",
    "The record covers the Texas and Louisiana Gulf Coast only (26 to 33 N, 100 to 89.5 W) and one storm. A hypothetical storm has no observed rainfall: the wind what-if scenario shows no rainfall figure.",
  ],
  hindcast: [
    "Reference: DOE Update #9 (as of 12:00 UTC 30 August 2017) counted 15 refineries shut or shutting down, 3,871,449 b/d. DOE names no refinery; the 15 are reconstructed from DOE's regional counts and the EIA capacities of 1 January 2017 (exactly one set fits). 14 of them have a position and rainfall data; 39 refineries of the 2017 fleet are scored.",
    "Wind alone: the observed 64-kt radii contain none of the 14; the 50-kt radii contain 5 (the Corpus Christi plants) and 1 that DOE did not count; the 34-kt radii contain all 14 and 11 others.",
    "Rainfall alone (100-year depth reached by the report time): 14 refineries, of which 8 are in DOE's count: every counted refinery from Houston to Port Arthur. It misses the 6 Corpus Christi area refineries, which shut ahead of the wind, and includes 6 that DOE did not count as shut at that time.",
    "50-kt wind or 100-year rainfall: 20 refineries, 13 of the 14 counted (the one missed, Three Rivers, had 34-kt wind and little rain) and 7 not counted.",
    "This is one storm, and the thresholds were not tuned to it: every tabulated threshold is reported in research/RAINFALL_FLOOD.md. The rainfall screen explains where wind failed; with as many as 6 or 7 sites wrongly included it is not a shutdown predictor.",
  ],
  uncertainty: "For the reference comparison the rainfall screen holds 11 to 17 refineries across NOAA's 90% bounds and 11 to 15 if the rainfall analysis is 20% low or high. Stage IV against 1,129 rain gauges: correlation 0.98, mean absolute difference 24 mm; for the 45 gauges above 750 mm, 75 mm (8%).",
  references: [
    "Lin, Y., and K. E. Mitchell (2005): The NCEP Stage II/IV hourly precipitation analyses: development and applications. 19th Conf. on Hydrology, American Meteorological Society, Paper 1.2.",
    "Perica, S., and Coauthors (2018): NOAA Atlas 14, Precipitation-Frequency Atlas of the United States, Volume 11, Version 2.0: Texas. NOAA, National Weather Service.",
    "Huffman, G. J., and Coauthors: NASA GPM Integrated Multi-satellitE Retrievals for GPM (IMERG).",
    "Blake, E. S., and D. A. Zelinsky (2018): National Hurricane Center Tropical Cyclone Report, Hurricane Harvey (AL092017).",
    "Watson, K. M., and Coauthors (2018): Characterization of peak streamflows and flood inundation of selected areas in southeastern Texas and southwestern Louisiana from the August and September 2017 flood resulting from Hurricane Harvey. USGS Scientific Investigations Report 2018-5070.",
    "U.S. Department of Energy (2017): Hurricane Harvey Event Reports, Updates #1 to #22.",
  ],
} as const;
