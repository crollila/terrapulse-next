/**
 * Loaders for the bundled Hurricane Harvey (2017) rainfall and flood-evidence files
 * (public/data/rainfall/, built by research/scripts/build_harvey_rainfall.py) and the NHC best track.
 * Files are validated on load; a malformed file is an error, never silently patched.
 */
import { useEffect, useState } from "react";
import type { AssetRain, RainGridFile } from "../sim/rainfall";
import type { BestTrackFile, BestTrackStorm } from "../sim/hindcast";

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";

export interface SourceBlock {
  provider: string;
  dataset: string;
  sourceUrl: string;
  landingPage?: string;
  retrievedAt?: string | null;
  license?: string;
  units?: string;
  notes?: string;
  [k: string]: unknown;
}

export interface RainAssetsFile {
  meta: {
    event: string;
    builtAt: string;
    days: string[];
    dayDefinition: { stage4: string; nasa: string };
    assetCount: number;
    missing: Record<string, string[]>;
    sources: Record<"stage4" | "atlas14" | "nasa" | "elevation" | "nfhl" | "hwm", SourceBlock>;
  };
  assets: AssetRain[];
}

export interface HighWaterMark {
  id: number;
  lat: number;
  lon: number;
  /** Height above ground at the mark, feet; null when not recorded. */
  hFt: number | null;
  elevFt: number | null;
  vdatum: string | null;
  quality: string | null;
  env: string | null;
  type: string | null;
  water: string | null;
  county: string | null;
  state: string | null;
}

export interface HwmFile {
  meta: SourceBlock & { count: number };
  marks: HighWaterMark[];
}

export interface HarveyRainData {
  grid: RainGridFile;
  assets: RainAssetsFile;
  hwms: HwmFile;
  track: BestTrackStorm;
  trackMeta: BestTrackFile["meta"];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function validateGrid(g: RainGridFile): RainGridFile {
  const n = g?.grid?.nx * g?.grid?.ny;
  if (!Number.isInteger(n) || n <= 0) throw new Error("rainfall grid: bad dimensions");
  if (!Array.isArray(g.days) || !g.days.length) throw new Error("rainfall grid: no days");
  for (const d of g.days) if (!Array.isArray(d.mm) || d.mm.length !== n) throw new Error(`rainfall grid: day ${d.date} has ${d.mm?.length} cells, expected ${n}`);
  return g;
}

export function validateAssets(a: RainAssetsFile): RainAssetsFile {
  if (!Array.isArray(a?.assets) || !Array.isArray(a?.meta?.days)) throw new Error("rainfall assets: malformed file");
  for (const x of a.assets) if (typeof x.id !== "string" || !Array.isArray(x.stage4?.dailyMm) || x.stage4.dailyMm.length !== a.meta.days.length) throw new Error(`rainfall assets: bad record ${x?.id}`);
  return a;
}

let cache: Promise<HarveyRainData> | null = null;

export function loadHarveyRain(): Promise<HarveyRainData> {
  cache ??= Promise.all([get<RainGridFile>("rainfall/harvey_2017_grid.json"), get<RainAssetsFile>("rainfall/harvey_2017_assets.json"), get<HwmFile>("rainfall/harvey_2017_hwms.json"), get<BestTrackFile>("hindcast/best_tracks.json")]).then(([grid, assets, hwms, tracks]) => {
    const track = tracks.storms.find((s) => s.id === "AL092017");
    if (!track) throw new Error("best_tracks.json: AL092017 missing");
    if (!Array.isArray(hwms?.marks)) throw new Error("high-water marks: malformed file");
    return { grid: validateGrid(grid), assets: validateAssets(assets), hwms, track, trackMeta: tracks.meta };
  });
  cache.catch(() => (cache = null));
  return cache;
}

export function useHarveyRain(): { data: HarveyRainData | null; error: string | null } {
  const [data, setData] = useState<HarveyRainData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadHarveyRain().then(
      (d) => live && setData(d),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, []);
  return { data, error };
}
