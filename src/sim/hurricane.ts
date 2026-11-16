/**
 * Hypothetical hurricane wind-exposure model. Deterministic: identical inputs give identical outputs.
 *
 * Wind field: Holland (1980) parametric profile in its cyclostrophic, Vmax-normalised form
 *   V(r) = Vmax * sqrt( (Rmax/r)^B * exp(1 - (Rmax/r)^B) )
 * Holland, G. J. (1980). An analytic model of the wind and pressure profiles in hurricanes.
 * Monthly Weather Review, 108, 1212-1218.
 *
 * Track: constant heading and forward speed along a great circle through the landfall point (t = 0).
 *
 * Intensity: constant before landfall. After landfall (t > 0 h) the maximum wind can decay with the
 * empirical inland wind decay model of Kaplan and DeMaria (1995):
 *   V(t) = Vb + (R * V0 - Vb) * exp(-alpha * t),  R = 0.9
 * Equation and R = 0.9 as stated in Kaplan, Dunion, Carrasco and DeMaria (2007), Joint Hurricane
 * Testbed final report (https://www.nhc.noaa.gov/jht/05-07reports/final_Kaplan_JHT07.pdf), which
 * applies it "to every point in the initial vortex wind field", as done here.
 * The decay rate alpha and background wind Vb are user-visible ASSUMPTIONS (see DECAY_DEFAULTS).
 * See MODEL_CARD.limitations: this is an exposure screen, not a forecast.
 */
import { destination, haversineKm, circleRing } from "./geo";
import type { Port, Refinery } from "../data/types";

export interface HurricaneParams {
  landfallLat: number;
  landfallLon: number;
  /** Direction of storm motion, degrees clockwise from north. */
  headingDeg: number;
  forwardSpeedKmh: number;
  /** Maximum 1-minute sustained wind, knots. */
  vmaxKt: number;
  /** Radius of maximum wind, km. */
  rmaxKm: number;
  /** Holland shape parameter B (dimensionless). */
  hollandB: number;
  /** Wind speed (kt) at or above which an asset counts as "inside the footprint". An assumption, chosen by the user. */
  exposureThresholdKt: number;
  /** Apply Kaplan-DeMaria weakening after the landfall point (t > 0). */
  inlandDecay: boolean;
  /** Exponential decay rate alpha, per hour. An assumption. */
  decayRatePerH: number;
}

/**
 * Inland decay constants. R = 0.9 is verified from the NOAA report cited above. The default decay
 * rate (0.095 per hour) and background wind (26.7 kt) are the values commonly quoted for Kaplan and
 * DeMaria (1995) for U.S. landfalls south of 37 N; they have NOT been re-verified against the paper
 * in this build, so they are presented in the app as adjustable assumptions.
 */
export const DECAY_DEFAULTS = { reductionFactor: 0.9, decayRatePerH: 0.095, backgroundWindKt: 26.7 } as const;

/** Saffir-Simpson Hurricane Wind Scale, 1-minute sustained wind in knots (NHC: https://www.nhc.noaa.gov/aboutsshws.php). */
export const SAFFIR_SIMPSON = [
  { category: 1, minKt: 64, maxKt: 82 },
  { category: 2, minKt: 83, maxKt: 95 },
  { category: 3, minKt: 96, maxKt: 112 },
  { category: 4, minKt: 113, maxKt: 136 },
  { category: 5, minKt: 137, maxKt: Infinity },
] as const;

export const TS_FORCE_KT = 34;
export const HURRICANE_FORCE_KT = 64;
export const MAJOR_FORCE_KT = 96;

export function saffirSimpsonCategory(vmaxKt: number): 0 | 1 | 2 | 3 | 4 | 5 {
  for (let i = SAFFIR_SIMPSON.length - 1; i >= 0; i--) if (vmaxKt >= SAFFIR_SIMPSON[i].minKt) return SAFFIR_SIMPSON[i].category;
  return 0;
}

export const PARAM_BOUNDS = {
  vmaxKt: { min: 35, max: 175, step: 1 },
  rmaxKm: { min: 10, max: 90, step: 1 },
  hollandB: { min: 1.0, max: 2.5, step: 0.05 },
  forwardSpeedKmh: { min: 5, max: 50, step: 1 },
  headingDeg: { min: 0, max: 359, step: 1 },
  decayRatePerH: { min: 0.03, max: 0.25, step: 0.005 },
} as const;

/** Scenario 001: a HYPOTHETICAL Category 5 landfall on the upper Texas coast. These are chosen inputs, not a forecast. */
export const SCENARIO_001: HurricaneParams = {
  landfallLat: 29.2,
  landfallLon: -94.95,
  headingDeg: 335,
  forwardSpeedKmh: 20,
  vmaxKt: 140,
  rmaxKm: 35,
  hollandB: 1.5,
  exposureThresholdKt: HURRICANE_FORCE_KT,
  inlandDecay: true,
  decayRatePerH: DECAY_DEFAULTS.decayRatePerH,
};

export function validateParams(p: HurricaneParams): string[] {
  const errs: string[] = [];
  const within = (name: keyof typeof PARAM_BOUNDS) => {
    const b = PARAM_BOUNDS[name];
    const v = p[name];
    if (!Number.isFinite(v) || v < b.min || v > b.max) errs.push(`${name} must be between ${b.min} and ${b.max}`);
  };
  (Object.keys(PARAM_BOUNDS) as (keyof typeof PARAM_BOUNDS)[]).forEach(within);
  if (!Number.isFinite(p.landfallLat) || Math.abs(p.landfallLat) > 60) errs.push("landfallLat must be between -60 and 60");
  if (!Number.isFinite(p.landfallLon) || Math.abs(p.landfallLon) > 180) errs.push("landfallLon must be between -180 and 180");
  if (![34, 50, 64, 96].includes(p.exposureThresholdKt)) errs.push("exposureThresholdKt must be 34, 50, 64 or 96");
  if (typeof p.inlandDecay !== "boolean") errs.push("inlandDecay must be true or false");
  return errs;
}

/** Holland (1980) wind speed (kt) at radius rKm from the centre. */
export function hollandWindKt(rKm: number, p: Pick<HurricaneParams, "vmaxKt" | "rmaxKm" | "hollandB">): number {
  if (rKm <= 0) return 0;
  const x = Math.pow(p.rmaxKm / rKm, p.hollandB);
  return p.vmaxKt * Math.sqrt(x * Math.exp(1 - x));
}

/** Outer radius (km) at which the profile falls to thresholdKt; null when the storm never reaches it. */
export function windRadiusKm(thresholdKt: number, p: Pick<HurricaneParams, "vmaxKt" | "rmaxKm" | "hollandB">): number | null {
  if (p.vmaxKt < thresholdKt) return null;
  let lo = p.rmaxKm;
  let hi = p.rmaxKm * 2;
  while (hollandWindKt(hi, p) > thresholdKt && hi < 1e5) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (hollandWindKt(mid, p) > thresholdKt) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Maximum sustained wind (kt) at tHours relative to landfall. Constant before landfall; after it,
 * Kaplan-DeMaria decay when enabled. The model does not know where land is: decay starts at the
 * landfall point the user sets.
 */
export function vmaxAtKt(p: Pick<HurricaneParams, "vmaxKt" | "inlandDecay" | "decayRatePerH">, tHours: number): number {
  if (!p.inlandDecay || tHours <= 0) return p.vmaxKt;
  const { reductionFactor: R, backgroundWindKt: Vb } = DECAY_DEFAULTS;
  const v0 = R * p.vmaxKt;
  if (v0 <= Vb) return v0;
  return Vb + (v0 - Vb) * Math.exp(-p.decayRatePerH * tHours);
}

/** Wind-field parameters in force at tHours. */
export function fieldAt(p: HurricaneParams, tHours: number): Pick<HurricaneParams, "vmaxKt" | "rmaxKm" | "hollandB"> {
  return { vmaxKt: vmaxAtKt(p, tHours), rmaxKm: p.rmaxKm, hollandB: p.hollandB };
}

/** Storm centre at tHours relative to landfall (negative = before landfall). */
export function stormCenter(p: HurricaneParams, tHours: number): { lat: number; lon: number } {
  return destination(p.landfallLat, p.landfallLon, p.headingDeg, p.forwardSpeedKmh * tHours);
}

export function windAtKt(p: HurricaneParams, lat: number, lon: number, tHours: number): number {
  const c = stormCenter(p, tHours);
  return hollandWindKt(haversineKm(lat, lon, c.lat, c.lon), fieldAt(p, tHours));
}

/** Physical simulation window, hours relative to landfall. */
export const T_START_H = -48;
export const T_END_H = 30;
export const T_STEP_H = 0.25;

export type ExposureClass = "none" | "tropical-storm-force" | "hurricane-force" | "major-hurricane-force";

export interface AssetExposure {
  peakWindKt: number;
  /** Hours relative to landfall at which the peak wind occurs. */
  tPeakH: number;
  closestApproachKm: number;
  /** First time the modelled wind reaches 34 kt; null if never. */
  tOnset34H: number | null;
  /** First time the modelled wind reaches the chosen exposure threshold; null if never. */
  tOnsetThresholdH: number | null;
  exposureClass: ExposureClass;
  inFootprint: boolean;
}

export function exposureClass(peakKt: number): ExposureClass {
  if (peakKt >= MAJOR_FORCE_KT) return "major-hurricane-force";
  if (peakKt >= HURRICANE_FORCE_KT) return "hurricane-force";
  if (peakKt >= TS_FORCE_KT) return "tropical-storm-force";
  return "none";
}

export function assetExposure(p: HurricaneParams, lat: number, lon: number): AssetExposure {
  let peak = 0;
  let tPeak = T_START_H;
  let closest = Infinity;
  let t34: number | null = null;
  let tThr: number | null = null;
  for (let t = T_START_H; t <= T_END_H + 1e-9; t += T_STEP_H) {
    const c = stormCenter(p, t);
    const d = haversineKm(lat, lon, c.lat, c.lon);
    if (d < closest) closest = d;
    const v = hollandWindKt(d, fieldAt(p, t));
    if (v > peak) {
      peak = v;
      tPeak = t;
    }
    if (t34 === null && v >= TS_FORCE_KT) t34 = t;
    if (tThr === null && v >= p.exposureThresholdKt) tThr = t;
  }
  return {
    peakWindKt: peak,
    tPeakH: tPeak,
    closestApproachKm: closest,
    tOnset34H: t34,
    tOnsetThresholdH: tThr,
    exposureClass: exposureClass(peak),
    inFootprint: tThr !== null,
  };
}

export type ExposedRefinery = Refinery & AssetExposure;
export type ExposedPort = Port & AssetExposure;

export interface ScenarioResult {
  params: HurricaneParams;
  category: number;
  radiiKm: { r34: number | null; r50: number | null; r64: number | null; r96: number | null; threshold: number | null };
  refineries: ExposedRefinery[];
  ports: ExposedPort[];
  /** Refineries whose modelled peak wind reaches the exposure threshold, largest first. */
  refineriesInFootprint: ExposedRefinery[];
  portsInFootprint: ExposedPort[];
  /** capacity_in_footprint = sum(capacity_i * I[peak wind_i >= threshold]). Exposure, NOT lost production. */
  capacityInFootprintBpd: number;
  /** Sum of all capacities in the dataset (denominator for the share). */
  datasetCapacityBpd: number;
  capacityShare: number | null;
  /** Refineries in the footprint with no capacity value in the source (excluded from the sum, reported). */
  footprintCapacityUnknown: number;
  tonsInFootprint: number;
  datasetTons: number;
  /** Earliest 34-kt onset at any asset, and earliest threshold onset; null when nothing is reached. */
  firstOnset34H: number | null;
  firstThresholdH: number | null;
}

export function runScenario(params: HurricaneParams, refineries: Refinery[], ports: Port[]): ScenarioResult {
  const errs = validateParams(params);
  if (errs.length) throw new Error(`Invalid hurricane parameters: ${errs.join("; ")}`);
  const ex = <T extends { lat: number; lon: number }>(a: T) => ({ ...a, ...assetExposure(params, a.lat, a.lon) });
  const r = refineries.map(ex);
  const pt = ports.map(ex);
  const byCap = (a: ExposedRefinery, b: ExposedRefinery) => (b.capacityBpd ?? 0) - (a.capacityBpd ?? 0) || a.id.localeCompare(b.id);
  const rin = r.filter((x) => x.inFootprint).sort(byCap);
  const pin = pt.filter((x) => x.inFootprint).sort((a, b) => (b.totalTons ?? 0) - (a.totalTons ?? 0) || a.id.localeCompare(b.id));
  const sum = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0);
  const datasetCapacityBpd = sum(refineries.map((x) => x.capacityBpd));
  const capacityInFootprintBpd = sum(rin.map((x) => x.capacityBpd));
  const minOf = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.min(...v) : null;
  };
  return {
    params,
    category: saffirSimpsonCategory(params.vmaxKt),
    radiiKm: {
      r34: windRadiusKm(34, params),
      r50: windRadiusKm(50, params),
      r64: windRadiusKm(64, params),
      r96: windRadiusKm(96, params),
      threshold: windRadiusKm(params.exposureThresholdKt, params),
    },
    refineries: r,
    ports: pt,
    refineriesInFootprint: rin,
    portsInFootprint: pin,
    capacityInFootprintBpd,
    datasetCapacityBpd,
    capacityShare: datasetCapacityBpd > 0 ? capacityInFootprintBpd / datasetCapacityBpd : null,
    footprintCapacityUnknown: rin.filter((x) => x.capacityBpd == null).length,
    tonsInFootprint: sum(pin.map((x) => x.totalTons)),
    datasetTons: sum(ports.map((x) => x.totalTons)),
    firstOnset34H: minOf([...r, ...pt].map((x) => x.tOnset34H)),
    firstThresholdH: minOf([...r, ...pt].map((x) => x.tOnsetThresholdH)),
  };
}

/* ---------- Timeline ---------- */

export const STAGES = [
  { key: "baseline", label: "Pre-event baseline", basis: "MODELED" },
  { key: "onset", label: "Hazard onset", basis: "MODELED" },
  { key: "exposure", label: "Physical exposure", basis: "MODELED" },
  { key: "interruption", label: "Potential infrastructure interruption", basis: "ILLUSTRATIVE" },
  { key: "supply", label: "Supply-chain effects", basis: "ILLUSTRATIVE" },
  { key: "economic", label: "Short-term economic consequences", basis: "ILLUSTRATIVE" },
  { key: "recovery", label: "Possible recovery dynamics", basis: "ILLUSTRATIVE" },
] as const;

/** Fraction of the timeline bar given to the physically modelled hours; the rest steps through illustrative stages. */
export const PHYSICAL_FRACTION = 0.64;

export interface TimelineState {
  /** Hours relative to landfall while in the modelled window; null in the illustrative stages. */
  tH: number | null;
  /** Time used to draw the storm (clamped to the end of the window in illustrative stages). */
  drawTH: number;
  stageIndex: number;
  stage: (typeof STAGES)[number];
  /** Deepest graph tier revealed (see graph.ts TIERS). */
  graphDepth: number;
}

/** Map a timeline position in [0, 1] to hours, stage and graph depth. */
export function timelineState(pos: number, result: Pick<ScenarioResult, "firstOnset34H" | "firstThresholdH">): TimelineState {
  const x = Math.min(1, Math.max(0, pos));
  if (x <= PHYSICAL_FRACTION) {
    const tH = T_START_H + (x / PHYSICAL_FRACTION) * (T_END_H - T_START_H);
    let stageIndex = 0;
    if (result.firstOnset34H !== null && tH >= result.firstOnset34H) stageIndex = 1;
    if (result.firstThresholdH !== null && tH >= result.firstThresholdH) stageIndex = 2;
    return { tH, drawTH: tH, stageIndex, stage: STAGES[stageIndex], graphDepth: stageIndex === 0 ? 0 : 1 };
  }
  const n = STAGES.length - 3;
  const i = Math.min(n - 1, Math.floor(((x - PHYSICAL_FRACTION) / (1 - PHYSICAL_FRACTION)) * n));
  const stageIndex = 3 + i;
  // interruption: activities + operators; supply: commodities; economic: industries + funds; recovery: all
  const depth = [3, 4, 6, 6][i];
  return { tH: null, drawTH: T_END_H, stageIndex, stage: STAGES[stageIndex], graphDepth: depth };
}

/** Timeline position at which a given hour is reached (for jumping to landfall, etc.). */
export function posForHour(tH: number): number {
  return (PHYSICAL_FRACTION * (tH - T_START_H)) / (T_END_H - T_START_H);
}

/* ---------- Geometry for the map ---------- */

export function windRings(p: HurricaneParams, tH: number): { thresholdKt: number; ring: [number, number][] }[] {
  const c = stormCenter(p, tH);
  const out: { thresholdKt: number; ring: [number, number][] }[] = [];
  const f = fieldAt(p, tH);
  for (const thr of [34, 64, 96]) {
    const r = windRadiusKm(thr, f);
    if (r) out.push({ thresholdKt: thr, ring: circleRing(c.lat, c.lon, r) });
  }
  return out;
}

/**
 * Swath polygon: every point that has had wind of at least thresholdKt between tFrom and tTo.
 * The radius is re-evaluated along the track, so the swath narrows as the storm weakens over land
 * and ends where the wind field no longer reaches the threshold.
 */
export function swathPolygon(p: HurricaneParams, thresholdKt: number, tFrom: number, tTo: number): [number, number][] | null {
  const radius = (t: number) => windRadiusKm(thresholdKt, fieldAt(p, t));
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  const n = Math.max(2, Math.ceil(tTo - tFrom));
  let first: { t: number; r: number } | null = null;
  let last: { t: number; r: number } | null = null;
  for (let i = 0; i <= n; i++) {
    const t = tFrom + ((tTo - tFrom) * i) / n;
    const r = radius(t);
    if (r === null) {
      if (first) break;
      continue;
    }
    const c = stormCenter(p, t);
    const l = destination(c.lat, c.lon, p.headingDeg - 90, r);
    const rt = destination(c.lat, c.lon, p.headingDeg + 90, r);
    left.push([l.lon, l.lat]);
    right.push([rt.lon, rt.lat]);
    first ??= { t, r };
    last = { t, r };
  }
  if (!first || !last) return null;
  const cap = (t: number, r: number, from: number) => {
    const c = stormCenter(p, t);
    const pts: [number, number][] = [];
    for (let i = 1; i < 18; i++) {
      const q = destination(c.lat, c.lon, from + (i / 18) * 180, r);
      pts.push([q.lon, q.lat]);
    }
    return pts;
  };
  // left side forward, front cap (through the heading), right side back, rear cap
  const ring = [...left, ...cap(last.t, last.r, p.headingDeg - 90), ...right.reverse(), ...cap(first.t, first.r, p.headingDeg + 90)];
  ring.push(ring[0]);
  return ring;
}

export const MODEL_CARD = {
  name: "Hurricane wind-exposure screen v0.1",
  status: "EXPERIMENTAL: unit-tested numerically; a hindcast on two real storms did not validate it (fails on Harvey 2017, inconclusive on Ike 2008)",
  /** Hindcast along NHC HURDAT2 best tracks with observed winds. Full method and tables: research/HINDCAST.md. Figures are pinned by tests. */
  hindcast: [
    "Hurricane Harvey (2017): FAILS. At 64 kt the wind footprint holds 0.94 to 1.32 million b/d (24% to 34% of the 3,871,449 b/d that DOE reported shut or shutting down on 30 August 2017). It finds the Corpus Christi cluster and no refinery in the Houston, Galveston Bay, Beaumont or Port Arthur areas. Those shutdowns came with days of extreme rainfall while Harvey was a 35 to 45 kt tropical storm; a wind-only screen cannot represent them. Lowering the threshold to 34 kt overshoots instead (up to 164% of the DOE figure).",
    "Hurricane Ike (2008): INCONCLUSIVE. The 64-kt footprint holds 10, 13 or 16 refineries for an assumed storm size of 20, 35 or 50 km, against 14 reported closed (NHC, citing DOE). The list of closed refineries was not retrieved, so the match cannot be scored, and the symmetric wind profile misses the Lake Charles area that the observed wind radii include.",
    "Both comparisons use the refinery fleet as of 1 January 2026, not the 2017 or 2008 fleet. Two storms could not validate a model even if both matched.",
  ],
  inputs: [
    "Landfall point (lat, lon), heading (deg), forward speed (km/h): user-chosen, hypothetical",
    "Vmax: maximum 1-minute sustained wind (kt), user-chosen",
    "Rmax: radius of maximum wind (km), user-chosen",
    "Holland B shape parameter (1.0 to 2.5), user-chosen",
    "Exposure threshold (34, 50, 64 or 96 kt): an assumption, user-chosen",
    "Inland decay rate alpha (default 0.095 per hour) and background wind Vb (26.7 kt): assumptions, values commonly quoted for Kaplan & DeMaria (1995), not re-verified here",
    "Refinery locations and atmospheric crude distillation capacity: U.S. EIA",
    "Port locations and annual tonnage: U.S. Army Corps of Engineers / BTS",
  ],
  formula: [
    "V(r) = Vmax * sqrt((Rmax/r)^B * exp(1 - (Rmax/r)^B))   [Holland 1980, cyclostrophic form]",
    "centre(t) = great-circle point at distance speed * t from the landfall point along the heading",
    "Vmax(t) = Vmax for t <= 0;  Vb + (0.9 * Vmax - Vb) * exp(-alpha * t) for t > 0   [Kaplan & DeMaria 1995 inland decay]",
    "peak_i = max over t in [-48 h, +30 h] of V(distance(asset_i, centre(t)); Vmax(t))",
    "capacity_in_footprint = sum_i capacity_i * 1[peak_i >= threshold]",
  ],
  assumptions: [
    "Symmetric wind field; no forward-motion asymmetry",
    "Constant intensity before the landfall point; after it, exponential weakening (alpha and Vb are assumptions; R = 0.9). Turning weakening off gives an upper bound.",
    "The model has no land mask: weakening starts at the landfall point you set, wherever that is",
    "Constant storm size (Rmax and B) through landfall",
    "Straight track at constant speed",
    "Winds are open-water 1-minute sustained values; no terrain or surface roughness",
  ],
  limitations: [
    "Wind only. No storm surge, rainfall or flooding. Hurricane Harvey (2017) stalled and dropped more than 60 inches of rain on southeastern Texas (NHC); a wind-only screen cannot represent an event like that.",
    "Being inside the footprint is exposure, not damage or shutdown. No vulnerability curve is applied because none has been validated here.",
    "Capacity in the footprint is not lost production. Outage size and duration are not estimated.",
    "Not a forecast of any real storm.",
  ],
  uncertainty: "Not quantified. Use the sliders for sensitivity: outputs change deterministically with Vmax, Rmax, B, track and threshold.",
  references: [
    "Holland, G. J. (1980). An analytic model of the wind and pressure profiles in hurricanes. Mon. Wea. Rev., 108, 1212-1218.",
    "Kaplan, J., & DeMaria, M. (1995). A simple empirical model for predicting the decay of tropical cyclone winds after landfall. J. Appl. Meteor., 34, 2499-2512.",
    "Kaplan, J., Dunion, J., Carrasco, N., & DeMaria, M. (2007). Estimating tropical cyclone wind radii utilizing an empirical inland wind decay model. Joint Hurricane Testbed final report. https://www.nhc.noaa.gov/jht/05-07reports/final_Kaplan_JHT07.pdf",
    "NHC, Saffir-Simpson Hurricane Wind Scale. https://www.nhc.noaa.gov/aboutsshws.php",
  ],
} as const;
