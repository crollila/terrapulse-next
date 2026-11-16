/**
 * U.S. DOE Hurricane Harvey event reports (Updates #1 to #22): counts and capacities as printed, and
 * the refinery membership RECONSTRUCTED from them (public/data/hindcast/doe_harvey_record.json, built
 * by research/scripts/build_doe_harvey_record.py). DOE did not name refineries: see the file's meta.
 */
import type { Refinery } from "./types";

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";

export interface DoeTally {
  count: number | null;
  capacityBpd: number | null;
  countBasis?: string | null;
  regionCountsAsPrinted?: Record<string, number> | null;
  /** Number of refinery sets whose capacities add up to the printed total (capped at 200). */
  setsFittingTheTotalAlone?: number;
  setsFittingTheTotalAloneCapped?: boolean;
  /** Number of sets that also satisfy the printed regional counts; null when none were printed. */
  setsFittingTotalAndRegionalCounts?: number | null;
  /** True when exactly one set fits the total and the regional counts. */
  resolved?: boolean;
  /** Keys of the refineries in that one set. */
  members?: string[] | null;
  sameResultForEveryTestedRadius?: boolean;
}

export interface DoeReport {
  report: number;
  title: string;
  asOfPrinted: string;
  sectionAsOf: string;
  /** The section's "As of" time converted from EDT to UTC. */
  asOfUtc: string | null;
  url: string;
  summaryQuote: string;
  shut: DoeTally;
  restarting: DoeTally;
  reducedRates: DoeTally;
}

export interface DoeRefinery {
  key: string;
  doeName: string;
  company: string;
  site: string;
  state: string;
  area: string | null;
  capacityBpd2017: number;
  /** Id in the 2017 fleet file; null when the refinery has no position in the EIA layer. */
  eiaId: string | null;
  /** Reports (among the resolved ones) in which the refinery is in the shut set. */
  shutInReports: number[];
  status: Record<string, string>;
}

export interface DoeRecord {
  meta: {
    provider: string;
    dataset: string;
    landingPage: string;
    retrievedAt: string;
    evidence: string;
    method: string[];
    assumptions: string[];
    caveats: string[];
    universeSize: number;
    resolvedReports: number[];
    unresolvedReports: number[];
    [k: string]: unknown;
  };
  reports: DoeReport[];
  refineries: DoeRefinery[];
}

export interface FleetFile {
  meta: { provider: string; dataset: string; sourceUrl: string; landingPage: string; retrievedAt: string; dataAsOf: string; totalCapacityBpd: number; unmatchedNoCoordinates: { name: string; company: string; state: string; padd: number; capacityBpd: number | null }[]; [k: string]: unknown };
  facilities: (Refinery & { padd: number; plants?: { lat: number; lon: number; site: string }[] })[];
}

export function validateDoeRecord(d: DoeRecord): DoeRecord {
  if (!Array.isArray(d?.reports) || !Array.isArray(d?.refineries) || !d.meta) throw new Error("DOE record: malformed file");
  for (const r of d.reports) if (!Number.isInteger(r.report) || !r.shut) throw new Error("DOE record: bad report entry");
  return d;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/hindcast/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

let doe: Promise<DoeRecord> | null = null;
export function loadDoeRecord(): Promise<DoeRecord> {
  doe ??= get<DoeRecord>("doe_harvey_record.json").then(validateDoeRecord);
  doe.catch(() => (doe = null));
  return doe;
}

let fleet17: Promise<FleetFile> | null = null;
export function loadFleet2017(): Promise<FleetFile> {
  fleet17 ??= get<FleetFile>("refineries_2017.json").then((f) => {
    if (!Array.isArray(f?.facilities)) throw new Error("2017 fleet: malformed file");
    return f;
  });
  fleet17.catch(() => (fleet17 = null));
  return fleet17;
}

/** The resolved report with the largest shut capacity (the reference for the hindcast); null if none is resolved. */
export function peakReport(d: DoeRecord): DoeReport | null {
  let best: DoeReport | null = null;
  for (const r of d.reports) if (r.shut.resolved && (r.shut.capacityBpd ?? 0) > (best?.shut.capacityBpd ?? -1)) best = r;
  return best;
}

/** Refineries in the shut set of a resolved report. */
export function shutIn(d: DoeRecord, report: number): DoeRefinery[] {
  return d.refineries.filter((r) => r.shutInReports.includes(report));
}

/** Fleet ids of those refineries that have a position. */
export function shutIds(d: DoeRecord, report: number): string[] {
  return shutIn(d, report).flatMap((r) => (r.eiaId ? [r.eiaId] : []));
}

/** First resolved report in which each refinery is in the shut set. */
export function firstShut(d: DoeRecord): Map<string, DoeReport> {
  const byNo = new Map(d.reports.map((r) => [r.report, r]));
  const out = new Map<string, DoeReport>();
  for (const r of d.refineries) if (r.eiaId && r.shutInReports.length) out.set(r.eiaId, byNo.get(Math.min(...r.shutInReports))!);
  return out;
}
