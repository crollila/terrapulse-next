import type { FreshnessStatus, SourceMeta } from "./types";

const HOUR = 3_600_000;

/**
 * Honest freshness label. "LIVE FEED" is reserved for data fetched in this session whose newest
 * observation is under one hour old. Bundled snapshots are always CACHED, whatever their age.
 */
export function freshnessStatus(
  meta: Pick<SourceMeta, "fromCache" | "observedAt" | "retrievedAt">,
  now: number = Date.now(),
  simulated = false,
): FreshnessStatus {
  if (simulated) return "SIMULATED";
  if (meta.fromCache) return "CACHED";
  const ref = meta.observedAt ?? meta.retrievedAt;
  if (!ref) return "HISTORICAL";
  const age = now - Date.parse(ref);
  if (!Number.isFinite(age)) return "HISTORICAL";
  if (age <= HOUR) return "LIVE FEED";
  if (age <= 48 * HOUR) return "RECENT OBSERVATION";
  if (age <= 30 * 24 * HOUR) return "DELAYED";
  return "HISTORICAL";
}

/** "3 min", "5 h", "2 d", "4 mo", "3 yr": age of an ISO timestamp. */
export function ageLabel(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "unknown age";
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return "unknown age";
  if (ms < 0) return "in the future";
  const min = ms / 60_000;
  if (min < 1) return "under 1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 48) return `${Math.round(h)} h`;
  const d = h / 24;
  if (d < 60) return `${Math.round(d)} d`;
  if (d < 730) return `${Math.round(d / 30.44)} mo`;
  return `${Math.round(d / 365.25)} yr`;
}

export function utc(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}
