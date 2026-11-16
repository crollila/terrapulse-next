import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { useAnalysis, type Analysis } from "../data/trends";
import { analyzeTrend, MIN_WINDOW_YEARS, type MonthlyPoint, type TrendResult } from "../science/stats";

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";

export const toPoints = (a: Analysis): MonthlyPoint[] => a.series.year.map((year, i) => ({ year, month: a.series.month[i], value: a.series.value[i] }));

/** The selected series, the window clamped to what the record allows, and its trend (computed in the browser). */
export function useTrendWindow(): { a: Analysis | null; error: string | null; rec: readonly [number, number] | null; start: number; end: number; result: TrendResult | null; isFullRecord: boolean } {
  const trend = useStore((s) => s.trend);
  const { data: a, error } = useAnalysis(trend.regionId, trend.variableId);
  const rec = a ? ([a.series.year[0], a.series.year[a.series.year.length - 1]] as const) : null;
  const start = rec ? Math.max(rec[0], Math.min(trend.startYear, rec[1] - MIN_WINDOW_YEARS + 1)) : trend.startYear;
  const end = rec ? Math.min(rec[1], Math.max(trend.endYear, start + MIN_WINDOW_YEARS - 1)) : trend.endYear;
  const result = useMemo(() => (a ? analyzeTrend(toPoints(a), start, end) : null), [a, start, end]);
  return { a, error, rec, start, end, result, isFullRecord: !!a && start === a.trend.start && end === a.trend.end };
}

/** Independent regional series copied unchanged from the original TerraPulse repository. */
export interface CrosscheckFile {
  meta: { id: string; name: string; units_in_file?: string; retrieved_utc?: string; grid?: string; regional_mean?: string; citation?: string; opendap_url?: string; [k: string]: unknown };
  year: number[];
  month: number[];
  regions: Record<string, (number | null)[]>;
}
const cache = new Map<string, Promise<CrosscheckFile>>();
export function loadCrosscheck(id: "gpcp" | "gistemp"): Promise<CrosscheckFile> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`${BASE}data/trends/crosscheck/${id}.json`).then((r) => {
      if (!r.ok) throw new Error(`crosscheck/${id}.json: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
export function useCrosscheck(id: "gpcp" | "gistemp" | null): { data: CrosscheckFile | null; error: string | null } {
  const [state, setState] = useState<{ id: string | null; data: CrosscheckFile | null; error: string | null }>({ id: null, data: null, error: null });
  useEffect(() => {
    if (!id) return;
    let live = true;
    loadCrosscheck(id).then(
      (data) => live && setState({ id, data, error: null }),
      (e: Error) => live && setState({ id, data: null, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  return state.id === id ? { data: state.data, error: state.error } : { data: null, error: null };
}
export const crosscheckPoints = (f: CrosscheckFile, regionId: string): MonthlyPoint[] => f.year.map((year, i) => ({ year, month: f.month[i], value: f.regions[regionId]?.[i] ?? null }));

/** The two featured investigations. Every number shown for them is read from the published analysis files. */
export const CASES = {
  amazon: { id: "amazon", regionId: "rondonia", variableId: "PRECTOTCORR", second: "gpcp", title: "The Amazon Rainfall Mystery", kicker: "Significant, but how big?", diff: "raw" },
  alaska: { id: "alaska", regionId: "north-slope", variableId: "T2M", second: "gistemp", title: "Northern Alaska warming", kicker: "Two records agree", diff: "anomaly" },
} as const;
export type CaseId = keyof typeof CASES;

export const fmtBounds = (bbox: [number, number, number, number]) => {
  const [w, s, e, n] = bbox;
  const lat = (v: number) => `${Math.abs(v)}°${v < 0 ? "S" : v > 0 ? "N" : ""}`;
  const lon = (v: number) => `${Math.abs(v)}°${v < 0 ? "W" : v > 0 ? "E" : ""}`;
  return `${lat(s)} to ${lat(n)}, ${lon(w)} to ${lon(e)}`;
};
