/**
 * Time handling and derived views for the observed rainfall record (Hurricane Harvey, 2017).
 * Pure and deterministic. Rainfall accumulates in whole Stage IV days (24 hours ending 1200 UTC):
 * nothing is interpolated inside a day, because the daily file says nothing about when in the day
 * the rain fell. The storm position is interpolated hourly from the NHC best track, as in the hindcast.
 */
import { destination } from "./geo";
import { interpolateTrack, nmToKm, observedRadiiExposure, type BestTrackStorm, type Quadrant, type RadiiThresholdKt, type TrackPoint } from "./hindcast";
import { rainExposure, type AssetRain, type RainExposure } from "./rainfall";

const HOUR_MS = 3_600_000;

export interface RecordWindow {
  /** Start of the first Stage IV day (ISO UTC). */
  startMs: number;
  /** Number of daily fields. */
  nDays: number;
  hours: number;
}

/** The window covered by daily fields whose 24-hour periods end at 1200 UTC on `days`. */
export function recordWindow(days: string[]): RecordWindow {
  if (!days.length) throw new Error("no days");
  const startMs = Date.parse(`${days[0]}T12:00:00Z`) - 24 * HOUR_MS;
  if (!Number.isFinite(startMs)) throw new Error(`bad date ${days[0]}`);
  for (let i = 1; i < days.length; i++) if (Date.parse(`${days[i]}T12:00:00Z`) - Date.parse(`${days[i - 1]}T12:00:00Z`) !== 24 * HOUR_MS) throw new Error("days must be consecutive");
  return { startMs, nDays: days.length, hours: days.length * 24 };
}

/** Number of complete Stage IV days at `hours` into the window (0 ... nDays). */
export function completedDays(w: RecordWindow, hours: number): number {
  return Math.max(0, Math.min(w.nDays, Math.floor(hours / 24 + 1e-9)));
}

export const timeAt = (w: RecordWindow, hours: number): number => w.startMs + Math.max(0, Math.min(w.hours, hours)) * HOUR_MS;

/** Daily series as known after `count` complete days: later days are zero (no rain has been recorded yet). */
export function seriesToDate(daily: (number | null)[], count: number): (number | null)[] {
  return daily.map((v, i) => (i < count ? v : 0));
}

/** Rainfall exposure of every site using only the first `count` days. */
export function exposuresToDate(assets: AssetRain[], count: number, rainFactor = 1): RainExposure[] {
  return assets.map((a) => rainExposure({ ...a, stage4: { ...a.stage4, dailyMm: seriesToDate(a.stage4.dailyMm, count) } }, rainFactor));
}

/** Hourly best-track points. */
export function hourlyTrack(storm: BestTrackStorm): TrackPoint[] {
  return interpolateTrack(storm, 1);
}

/** Last track point at or before a time; null before the first fix or after the last. */
export function trackAt(track: TrackPoint[], ms: number): TrackPoint | null {
  if (!track.length || ms < track[0].timeMs || ms > track[track.length - 1].timeMs) return null;
  let lo = 0;
  let hi = track.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (track[mid].timeMs <= ms) lo = mid;
    else hi = mid - 1;
  }
  return track[lo];
}

const QUAD_START: Record<Quadrant, number> = { ne: 0, se: 90, sw: 180, nw: 270 };

/**
 * Outline of the best-track wind radii at one time: in each quadrant an arc at that quadrant's
 * radius. HURDAT2 radii are the MAXIMUM extent of the wind speed in the quadrant, so the outline
 * overstates the area with that wind. Returns null when no quadrant has a radius.
 */
export function radiiOutline(p: TrackPoint, thresholdKt: RadiiThresholdKt, stepDeg = 5): [number, number][] | null {
  const r = thresholdKt === 34 ? p.r34 : thresholdKt === 50 ? p.r50 : p.r64;
  const quads: Quadrant[] = ["ne", "se", "sw", "nw"];
  if (!quads.some((q) => (r[q] ?? 0) > 0)) return null;
  const ring: [number, number][] = [];
  for (const q of quads) {
    const km = nmToKm(r[q] ?? 0);
    for (let b = QUAD_START[q]; b <= QUAD_START[q] + 90; b += stepDeg) {
      if (km <= 0) {
        if (b === QUAD_START[q]) ring.push([p.lon, p.lat]);
        continue;
      }
      const d = destination(p.lat, p.lon, b, km);
      ring.push([d.lon, d.lat]);
    }
  }
  ring.push(ring[0]);
  return ring;
}

export interface WindOnset {
  /** First time (ms) each site was inside the observed 34, 50 and 64-kt radii; absent = never. */
  t34: Map<string, number>;
  t50: Map<string, number>;
  t64: Map<string, number>;
}

/** When each site first fell inside the observed best-track wind radii. */
export function windOnsets(storm: BestTrackStorm, sites: { id: string; lat: number; lon: number }[]): WindOnset {
  const first = (thr: RadiiThresholdKt) => new Map(observedRadiiExposure(storm, sites, thr).exposed.map((e) => [e.id, Date.parse(e.firstExposedAt)]));
  return { t34: first(34), t50: first(50), t64: first(64) };
}

/** Highest observed wind-radius class a site has been inside by time ms: 64, 50, 34 or 0. */
export function windClassBy(on: WindOnset, id: string, ms: number): 0 | 34 | 50 | 64 {
  const by = (m: Map<string, number>) => {
    const t = m.get(id);
    return t !== undefined && t <= ms;
  };
  return by(on.t64) ? 64 : by(on.t50) ? 50 : by(on.t34) ? 34 : 0;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "27 Aug 2017, 12:00 UTC". */
export function fmtUtc(ms: number, withTime = true): string {
  const d = new Date(ms);
  const day = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withTime ? `${day}, ${String(d.getUTCHours()).padStart(2, "0")}:00 UTC` : day;
}

/** "8 Nov 2018, 14:33 UTC": like fmtUtc but keeps the minutes, for times that are not on the hour. */
export function fmtUtcMinutes(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

const STATUS: Record<string, string> = { HU: "Hurricane", TS: "Tropical storm", TD: "Tropical depression", EX: "Extratropical low", LO: "Low", SD: "Subtropical depression", SS: "Subtropical storm", WV: "Tropical wave", DB: "Disturbance" };
export const statusLabel = (code: string): string => STATUS[code] ?? code;
