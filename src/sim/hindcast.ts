/**
 * Hindcast helpers: compare the wind-exposure screen with observed storms. Pure and deterministic.
 *
 * Input: NHC HURDAT2 best tracks (public/data/hindcast/best_tracks.json, built by
 * research/scripts/build_best_tracks.py). Two footprints are computed along the OBSERVED track:
 *
 *  1. observedRadiiExposure: the best-track 34/50/64-kt wind radii. HURDAT2 defines each radius as
 *     the MAXIMUM extent of that wind speed in a quadrant (NE, SE, SW, NW), so a quadrant-sector
 *     footprint built from them overstates the area that had that wind.
 *  2. hollandTrackExposure: the app's Holland (1980) profile (hollandWindKt) with the OBSERVED
 *     maximum wind at each time. No decay model is applied: the observed winds already weaken.
 *
 * Both are wind only. Neither says anything about surge, rain, flooding, damage or shutdowns.
 * See research/HINDCAST.md for the results and their limits.
 */
import { haversineKm } from "./geo";
import { hollandWindKt } from "./hurricane";

/** 1 international nautical mile = 1.852 km exactly. */
export const KM_PER_NM = 1.852;
export const nmToKm = (nm: number): number => nm * KM_PER_NM;

export type Quadrant = "ne" | "se" | "sw" | "nw";
/** Wind radii by quadrant, nautical miles. 0 = that wind is not reached in the quadrant; null = missing in the source. */
export type QuadrantRadii = Record<Quadrant, number | null>;

export interface BestTrackFix {
  /** ISO 8601 UTC. */
  time: string;
  /** HURDAT2 record identifier: "L" = landfall, "" = none. */
  recordId: string;
  /** HURDAT2 status: TD, TS, HU, EX, SD, SS, LO, WV, DB. */
  status: string;
  lat: number;
  lon: number;
  /** Maximum 1-minute sustained wind, knots. */
  vmaxKt: number | null;
  pressureMb: number | null;
  r34: QuadrantRadii;
  r50: QuadrantRadii;
  r64: QuadrantRadii;
  /** Radius of maximum wind, nm (routinely best tracked only from 2021). */
  rmwNm?: number | null;
}

export interface BestTrackStorm {
  id: string;
  name: string;
  year: number;
  fixes: BestTrackFix[];
}

export interface BestTrackFile {
  meta: {
    provider: string;
    dataset: string;
    sourceUrl: string;
    formatDoc: string;
    retrievedAt: string;
    license: string;
    notes?: string;
    [k: string]: unknown;
  };
  storms: BestTrackStorm[];
}

export type RadiiThresholdKt = 34 | 50 | 64;

export interface TrackPoint {
  /** Milliseconds since the Unix epoch (UTC). */
  timeMs: number;
  time: string;
  lat: number;
  lon: number;
  vmaxKt: number | null;
  r34: QuadrantRadii;
  r50: QuadrantRadii;
  r64: QuadrantRadii;
  /** Status of the fix at or before this time. */
  status: string;
}

const QUADS: Quadrant[] = ["ne", "se", "sw", "nw"];
const HOUR_MS = 3_600_000;

/** Linear interpolation where a missing end makes the result missing; at f = 0 the first value is returned as is. */
function lerpNullable(a: number | null, b: number | null, f: number): number | null {
  if (f === 0) return a;
  if (a === null || b === null) return null;
  return a + (b - a) * f;
}

function lerpRadii(a: QuadrantRadii, b: QuadrantRadii, f: number): QuadrantRadii {
  const out = {} as QuadrantRadii;
  for (const q of QUADS) out[q] = lerpNullable(a[q], b[q], f);
  return out;
}

const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

/**
 * Track sampled at most stepHours apart. Each interval between two consecutive fixes is divided
 * into ceil(dt / stepHours) equal parts, so every fix (including asynoptic landfall fixes) is in
 * the output exactly. Latitude, longitude, Vmax and each radius are interpolated linearly in time.
 * A radius or wind that is missing (null) at either end of an interval is null inside it, i.e.
 * treated as not reached. A radius of 0 is a value (not reached in that quadrant) and interpolates.
 */
export function interpolateTrack(storm: BestTrackStorm, stepHours = 1): TrackPoint[] {
  if (!(stepHours > 0) || !Number.isFinite(stepHours)) throw new Error("stepHours must be a positive number");
  const fixes = storm.fixes;
  const out: TrackPoint[] = [];
  const at = (f: BestTrackFix, ms: number): TrackPoint => ({
    timeMs: ms,
    time: iso(ms),
    lat: f.lat,
    lon: f.lon,
    vmaxKt: f.vmaxKt,
    r34: { ...f.r34 },
    r50: { ...f.r50 },
    r64: { ...f.r64 },
    status: f.status,
  });
  for (let i = 0; i < fixes.length; i++) {
    const a = fixes[i];
    const ta = Date.parse(a.time);
    if (!Number.isFinite(ta)) throw new Error(`${storm.id}: unparseable fix time ${a.time}`);
    if (i === fixes.length - 1) {
      out.push(at(a, ta));
      break;
    }
    const b = fixes[i + 1];
    const tb = Date.parse(b.time);
    if (!(tb > ta)) throw new Error(`${storm.id}: fix times must be strictly increasing (${a.time} -> ${b.time})`);
    const n = Math.max(1, Math.ceil((tb - ta) / HOUR_MS / stepHours - 1e-9));
    // shortest way round in longitude, so a track crossing the antimeridian does not jump
    let dLon = b.lon - a.lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    for (let k = 0; k < n; k++) {
      const f = k / n;
      if (k === 0) {
        out.push(at(a, ta));
        continue;
      }
      const ms = ta + (tb - ta) * f;
      out.push({
        timeMs: ms,
        time: iso(ms),
        lat: a.lat + (b.lat - a.lat) * f,
        lon: ((a.lon + dLon * f + 540) % 360) - 180,
        vmaxKt: lerpNullable(a.vmaxKt, b.vmaxKt, f),
        r34: lerpRadii(a.r34, b.r34, f),
        r50: lerpRadii(a.r50, b.r50, f),
        r64: lerpRadii(a.r64, b.r64, f),
        status: a.status,
      });
    }
  }
  return out;
}

/** Initial great-circle bearing from point 1 to point 2, degrees clockwise from north in [0, 360). */
export function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const D2R = Math.PI / 180;
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const dl = (lon2 - lon1) * D2R;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const b = (Math.atan2(y, x) * 180) / Math.PI;
  return ((b % 360) + 360) % 360;
}

/** Quadrant of a bearing: NE [0, 90), SE [90, 180), SW [180, 270), NW [270, 360). */
export function quadrantOf(bearing: number): Quadrant {
  const b = ((bearing % 360) + 360) % 360;
  if (b < 90) return "ne";
  if (b < 180) return "se";
  if (b < 270) return "sw";
  return "nw";
}

export interface HindcastAsset {
  lat: number;
  lon: number;
  /** Present on refineries. null = capacity unknown in the source. */
  capacityBpd?: number | null;
}

export type ExposedAsset<T> = T & {
  /** First interpolated time (ISO UTC) at which the asset is inside the footprint. */
  firstExposedAt: string;
  /** Best-track status at that time. */
  statusAtFirstExposure: string;
  /** Smallest distance (km) to the centre over the whole interpolated track. */
  closestApproachKm: number;
  /** Peak Holland-profile wind (kt) over the track; null for the observed-radii footprint, which has no wind value. */
  peakWindKt: number | null;
};

export interface HindcastExposure<T> {
  stormId: string;
  thresholdKt: number;
  /** Exposed assets in input order. */
  exposed: ExposedAsset<T>[];
  count: number;
  /** Sum of capacityBpd over exposed assets with a known capacity. Exposure, NOT lost production. */
  capacityBpd: number;
  /** Exposed assets with no capacity value (excluded from the sum, never zero-filled). */
  capacityUnknown: number;
}

function summarise<T extends HindcastAsset>(stormId: string, thresholdKt: number, exposed: ExposedAsset<T>[]): HindcastExposure<T> {
  let capacityBpd = 0;
  let capacityUnknown = 0;
  for (const a of exposed) {
    if (typeof a.capacityBpd === "number" && Number.isFinite(a.capacityBpd)) capacityBpd += a.capacityBpd;
    else capacityUnknown++;
  }
  return { stormId, thresholdKt, exposed, count: exposed.length, capacityBpd, capacityUnknown };
}

const radiiFor = (p: TrackPoint, thresholdKt: RadiiThresholdKt): QuadrantRadii => (thresholdKt === 34 ? p.r34 : thresholdKt === 50 ? p.r50 : p.r64);

/**
 * Assets inside the OBSERVED best-track wind radii. An asset is exposed if, at any interpolated
 * time, its great-circle distance from the centre is <= the radius for thresholdKt in the quadrant
 * the asset lies in (by bearing from the centre). A null or zero radius exposes nothing.
 */
export function observedRadiiExposure<T extends HindcastAsset>(
  storm: BestTrackStorm,
  assets: T[],
  thresholdKt: RadiiThresholdKt,
  stepHours = 1,
): HindcastExposure<T> {
  if (thresholdKt !== 34 && thresholdKt !== 50 && thresholdKt !== 64) throw new Error("thresholdKt must be 34, 50 or 64");
  const track = interpolateTrack(storm, stepHours);
  const exposed: ExposedAsset<T>[] = [];
  for (const a of assets) {
    let closest = Infinity;
    let first: TrackPoint | null = null;
    for (const p of track) {
      const d = haversineKm(p.lat, p.lon, a.lat, a.lon);
      if (d < closest) closest = d;
      if (first) continue;
      const rNm = radiiFor(p, thresholdKt)[quadrantOf(bearingDeg(p.lat, p.lon, a.lat, a.lon))];
      if (rNm !== null && rNm > 0 && d <= nmToKm(rNm)) first = p;
    }
    if (first) exposed.push({ ...a, firstExposedAt: first.time, statusAtFirstExposure: first.status, closestApproachKm: closest, peakWindKt: null });
  }
  return summarise(storm.id, thresholdKt, exposed);
}

/**
 * Assets whose Holland-profile wind reaches thresholdKt at any interpolated time, using the
 * observed centre and observed Vmax and a fixed, assumed Rmax and B (the best track has no Rmax
 * before 2021 except on a few landfall fixes). The profile is symmetric, as in the app.
 */
export function hollandTrackExposure<T extends HindcastAsset>(
  storm: BestTrackStorm,
  assets: T[],
  thresholdKt: number,
  rmaxKm: number,
  hollandB: number,
  stepHours = 1,
): HindcastExposure<T> {
  if (!(rmaxKm > 0) || !(hollandB > 0) || !(thresholdKt > 0)) throw new Error("thresholdKt, rmaxKm and hollandB must be positive");
  const track = interpolateTrack(storm, stepHours);
  const exposed: ExposedAsset<T>[] = [];
  for (const a of assets) {
    let closest = Infinity;
    let peak = 0;
    let first: TrackPoint | null = null;
    for (const p of track) {
      const d = haversineKm(p.lat, p.lon, a.lat, a.lon);
      if (d < closest) closest = d;
      if (p.vmaxKt === null) continue;
      const v = hollandWindKt(d, { vmaxKt: p.vmaxKt, rmaxKm, hollandB });
      if (v > peak) peak = v;
      if (!first && v >= thresholdKt) first = p;
    }
    if (first) exposed.push({ ...a, firstExposedAt: first.time, statusAtFirstExposure: first.status, closestApproachKm: closest, peakWindKt: peak });
  }
  return summarise(storm.id, thresholdKt, exposed);
}
