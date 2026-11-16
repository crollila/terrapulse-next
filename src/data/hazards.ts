import type { HazardEvent, HazardKind, SourceMeta } from "./types";

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";

export const USGS_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson";
export const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20";

export interface HazardFeed {
  id: "usgs" | "eonet";
  meta: SourceMeta;
  events: HazardEvent[];
  /** Records rejected by validation (never silently repaired). */
  rejected: number;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const validLonLat = (lon: unknown, lat: unknown) => isNum(lon) && isNum(lat) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** USGS GeoJSON summary feed to HazardEvent[]. Invalid records are dropped and counted. */
export function parseUsgs(json: unknown): { events: HazardEvent[]; rejected: number } {
  const feats = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(feats)) throw new Error("USGS feed: missing features[]");
  const events: HazardEvent[] = [];
  let rejected = 0;
  for (const f of feats as any[]) {
    const c = f?.geometry?.coordinates;
    const p = f?.properties;
    if (!p || !Array.isArray(c) || !validLonLat(c[0], c[1]) || !isNum(p.time) || !isNum(p.mag) || typeof f.id !== "string") {
      rejected++;
      continue;
    }
    events.push({
      id: `usgs:${f.id}`,
      kind: "earthquake",
      title: `M ${p.mag.toFixed(1)}, ${p.place ?? "location not reported"}`,
      lat: c[1],
      lon: c[0],
      observedAt: new Date(p.time).toISOString(),
      magnitude: p.mag,
      magnitudeUnit: typeof p.magType === "string" ? `M (${p.magType})` : "M",
      url: typeof p.url === "string" ? p.url : "https://earthquake.usgs.gov/",
      provider: "USGS Earthquake Hazards Program",
      detail: isNum(c[2]) ? `Depth ${c[2].toFixed(0)} km, status ${p.status ?? "unknown"}` : undefined,
    });
  }
  return { events, rejected };
}

const EONET_KIND: Record<string, HazardKind> = {
  wildfires: "wildfire",
  severeStorms: "severeStorm",
  volcanoes: "volcano",
  floods: "flood",
  drought: "drought",
  seaLakeIce: "seaLakeIce",
  earthquakes: "earthquake",
};

/** NASA EONET v3 events to HazardEvent[] (latest point geometry of each event). */
export function parseEonet(json: unknown): { events: HazardEvent[]; rejected: number } {
  const evs = (json as { events?: unknown[] } | null)?.events;
  if (!Array.isArray(evs)) throw new Error("EONET: missing events[]");
  const events: HazardEvent[] = [];
  let rejected = 0;
  for (const e of evs as any[]) {
    const geoms: any[] = Array.isArray(e?.geometry)
      ? e.geometry.filter((g: any) => g?.type === "Point" && Array.isArray(g.coordinates))
      : [];
    const g = geoms.sort((a, b) => Date.parse(a.date) - Date.parse(b.date)).at(-1);
    const cat = e?.categories?.[0];
    if (!g || !validLonLat(g.coordinates[0], g.coordinates[1]) || Number.isNaN(Date.parse(g.date)) || typeof e.id !== "string" || !cat) {
      rejected++;
      continue;
    }
    events.push({
      id: `eonet:${e.id}`,
      kind: EONET_KIND[cat.id] ?? "other",
      title: String(e.title ?? cat.title),
      lat: g.coordinates[1],
      lon: g.coordinates[0],
      observedAt: new Date(g.date).toISOString(),
      magnitude: isNum(g.magnitudeValue) ? g.magnitudeValue : null,
      magnitudeUnit: typeof g.magnitudeUnit === "string" ? g.magnitudeUnit : null,
      url: e.sources?.[0]?.url ?? e.link ?? "https://eonet.gsfc.nasa.gov/",
      provider: `NASA EONET (source: ${e.sources?.[0]?.id ?? "n/a"})`,
      detail: `${cat.title}${geoms.length > 1 ? `, ${geoms.length} track points` : ""}`,
    });
  }
  return { events, rejected };
}

const newest = (events: HazardEvent[]) =>
  events.length ? new Date(Math.max(...events.map((e) => Date.parse(e.observedAt)))).toISOString() : null;

async function fetchJson(url: string, ms: number): Promise<unknown> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

interface FeedDef {
  id: HazardFeed["id"];
  url: string;
  snapshot: string;
  parse: (j: unknown) => { events: HazardEvent[]; rejected: number };
  meta: Omit<SourceMeta, "retrievedAt" | "observedAt" | "fromCache">;
}

const DEFS: FeedDef[] = [
  {
    id: "usgs",
    url: USGS_URL,
    snapshot: "data/snapshots/earthquakes.json",
    parse: parseUsgs,
    meta: {
      provider: "U.S. Geological Survey",
      dataset: "Magnitude 4.5+ earthquakes, past 7 days (GeoJSON summary feed)",
      sourceUrl: USGS_URL,
      landingPage: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
      units: "magnitude",
      cadence: "feed regenerated about every minute",
      scope: "Global",
      license: "U.S. Government work, public domain",
      quality: "Automatic and reviewed solutions are mixed; see each event's status",
    },
  },
  {
    id: "eonet",
    url: EONET_URL,
    snapshot: "data/snapshots/eonet.json",
    parse: parseEonet,
    meta: {
      provider: "NASA Earth Observatory Natural Event Tracker (EONET) v3",
      dataset: "Open natural events, last 20 days",
      sourceUrl: EONET_URL,
      landingPage: "https://eonet.gsfc.nasa.gov/",
      units: "per event (acres, kts, ...)",
      cadence: "curated; events appear hours to days after onset",
      scope: "Global",
      license: "NASA open data",
      quality: "Curated metadata pointing to third-party sources; not for emergency use",
    },
  },
];

export const FEED_IDS: HazardFeed["id"][] = ["usgs", "eonet"];

/** Live fetch with validation; on any failure fall back to the bundled snapshot, labelled as cache. */
export async function loadFeed(id: HazardFeed["id"], timeoutMs = 9000): Promise<HazardFeed> {
  const def = DEFS.find((d) => d.id === id)!;
  try {
    const { events, rejected } = def.parse(await fetchJson(def.url, timeoutMs));
    if (!events.length) throw new Error("feed returned no valid records");
    return {
      id,
      events,
      rejected,
      meta: { ...def.meta, retrievedAt: new Date().toISOString(), observedAt: newest(events), fromCache: false },
    };
  } catch (err) {
    const snap = (await fetchJson(`${BASE}${def.snapshot}`, 15000)) as { retrievedAt: string; data: unknown };
    const { events, rejected } = def.parse(snap.data);
    return {
      id,
      events,
      rejected,
      meta: {
        ...def.meta,
        retrievedAt: snap.retrievedAt,
        observedAt: newest(events),
        fromCache: true,
        cacheReason: `Live request failed (${(err as Error).message}); showing the last saved snapshot.`,
      },
    };
  }
}
