import { useEffect, useState } from "react";

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";
const ROOT = `${BASE}data/trends/`;

export interface CatalogRegion {
  id: string;
  name: string;
  short_name: string;
  country: string;
  bbox: [number, number, number, number];
  setting: string;
  land_share: number;
}
export interface CatalogVariable {
  id: string;
  name: string;
  long_name: string;
  units: string;
  definition: string;
  decimals: number;
  source: string;
  period: [number, number];
}
export interface CatalogSource {
  id: string;
  short_name: string;
  dataset: string;
  producer: string;
  access: string;
  access_url: string;
  native_grid: string;
  kind: string;
  caveat: string;
  credit: string;
}
export interface Catalog {
  period: [number, number];
  min_window_years: number;
  regions: CatalogRegion[];
  variables: CatalogVariable[];
  sources: Record<string, CatalogSource>;
}

export interface OverviewRegion {
  region: string;
  name: string;
  short_name: string;
  bbox: [number, number, number, number];
  slope_per_decade: number;
  ci_low: number;
  ci_high: number;
  p_value: number;
  mk_p_value: number;
  verdict: string;
  verdict_title: string;
  crosscheck?: string | null;
  p_value_fdr: number;
  significant_after_fdr: boolean;
}
export interface Overview {
  variable: CatalogVariable;
  period: [number, number];
  regions: OverviewRegion[];
  multiple_testing: { method: string; n_tests: number; n_significant_raw: number; n_significant_fdr: number };
}

export interface PublishedTrend {
  start: number;
  end: number;
  n_months: number;
  ols: { slope_per_decade: number; intercept: number; r_squared: number; ci_low: number; ci_high: number; p_value: number; naive_p_value: number };
  theil_sen: { slope_per_decade: number; ci_low: number; ci_high: number };
  mann_kendall: { tau: number; p_value: number; classic_p_value: number };
  noise: { residual_std: number; lag1_autocorrelation: number; n_effective: number };
  detectability: { years_needed: number | null; record_years: number };
}

export interface Analysis {
  region: CatalogRegion;
  variable: CatalogVariable;
  period: [number, number];
  first_month: string;
  last_month: string;
  series: { t: number[]; year: number[]; month: number[]; value: (number | null)[]; anomaly: (number | null)[]; climatology: number[]; annual_year: number[]; annual_mean: (number | null)[] };
  trend: PublishedTrend;
  verdict: { code: string; title: string; text: string; direction: string };
  /** Trend for every start/end-year window of at least 15 years (published pipeline output). */
  windows?: { start: number; end: number; slope_per_decade: number; ci_low: number; ci_high: number; p_value: number; significant: boolean }[];
  windows_summary?: { n_windows: number; min_years: number; share_same_direction: number; share_significant_same_direction: number; share_significant_opposite_direction: number; slope_min: number; slope_max: number };
  crosscheck?: {
    code: string;
    label: string;
    text: string;
    period: [number, number];
    trend: { slope_per_decade: number; ci_low: number; ci_high: number; p_value: number; significant: boolean };
    dataset: { id: string; name: string; long_name: string; kind: string; url: string; citation: string; caveat: string };
    known_issue?: {
      id: string;
      title: string;
      text: string;
      credit?: string;
      sources: { label: string; url: string }[];
      [k: string]: unknown;
    };
    [k: string]: unknown;
  } | null;
  quality: { months_total: number; months_missing: number; coverage: number; grid_cells?: number; months_used?: number };
  provenance: { request_url?: string; retrieved_utc?: string; source?: CatalogSource; [k: string]: unknown };
}

const cache = new Map<string, Promise<unknown>>();
function getJson<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(ROOT + path).then((r) => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p as Promise<T>;
}

export const loadCatalog = () => getJson<Catalog>("catalog.json");
export const loadOverview = (v: string) => getJson<Overview>(`overview/${v}.json`);
export const loadAnalysis = (r: string, v: string) => getJson<Analysis>(`analysis/${r}/${v}.json`);

function useAsync<T>(key: string | null, load: () => Promise<T>): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null });
  useEffect(() => {
    if (!key) return;
    let live = true;
    load().then(
      (data) => live && setState({ key, data, error: null }),
      (e: Error) => live && setState({ key, data: null, error: e.message }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? { data: state.data, error: state.error } : { data: null, error: null };
}

export const useCatalog = () => useAsync("catalog", loadCatalog);
export const useOverview = (v: string) => useAsync(`ov:${v}`, () => loadOverview(v));
export const useAnalysis = (r: string | null, v: string) => useAsync(r ? `an:${r}:${v}` : null, () => loadAnalysis(r as string, v));

/** Colour of a region box by the published verdict for the selected variable. */
export function verdictColor(o: Pick<OverviewRegion, "verdict" | "slope_per_decade"> | undefined): string {
  if (!o || o.verdict === "not_detected") return "#8b97a8";
  return o.slope_per_decade >= 0 ? "#1d6bff" : "#f76808";
}
