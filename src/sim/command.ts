/**
 * Deterministic command parser for the search / command bar. Keyword rules only: no AI model,
 * no network. The same text always produces the same action.
 */
import { SAFFIR_SIMPSON } from "./hurricane";

export interface Place {
  name: string;
  lat: number;
  lon: number;
  zoom: number;
  aliases?: string[];
}

/** Approximate city-centre coordinates, used only to move the camera or place a hypothetical storm. */
export const PLACES: Place[] = [
  { name: "Houston", lat: 29.76, lon: -95.37, zoom: 7 },
  { name: "Galveston", lat: 29.3, lon: -94.8, zoom: 8 },
  { name: "Corpus Christi", lat: 27.8, lon: -97.4, zoom: 8 },
  { name: "Port Arthur", lat: 29.9, lon: -93.93, zoom: 8, aliases: ["beaumont"] },
  { name: "Lake Charles", lat: 30.23, lon: -93.22, zoom: 8 },
  { name: "New Orleans", lat: 29.95, lon: -90.07, zoom: 7 },
  { name: "Baton Rouge", lat: 30.45, lon: -91.15, zoom: 8 },
  { name: "Mobile", lat: 30.69, lon: -88.04, zoom: 8 },
  { name: "Tampa", lat: 27.95, lon: -82.46, zoom: 8, aliases: ["tampa bay"] },
  { name: "Miami", lat: 25.76, lon: -80.19, zoom: 8 },
  { name: "Gulf of Mexico", lat: 25.5, lon: -90.5, zoom: 4.6, aliases: ["gulf coast", "gulf"] },
  { name: "New York", lat: 40.71, lon: -74.01, zoom: 8, aliases: ["nyc", "new york harbor"] },
  { name: "Los Angeles", lat: 34.05, lon: -118.24, zoom: 8 },
  { name: "Philadelphia", lat: 39.95, lon: -75.17, zoom: 8 },
  { name: "Chicago", lat: 41.88, lon: -87.63, zoom: 8 },
  { name: "London", lat: 51.51, lon: -0.13, zoom: 8 },
  { name: "Tokyo", lat: 35.68, lon: 139.69, zoom: 8 },
  { name: "Shanghai", lat: 31.23, lon: 121.47, zoom: 8 },
  { name: "Manila", lat: 14.6, lon: 120.98, zoom: 8 },
  { name: "Mumbai", lat: 19.08, lon: 72.88, zoom: 8 },
  { name: "Sydney", lat: -33.87, lon: 151.21, zoom: 8 },
  { name: "Lagos", lat: 6.52, lon: 3.38, zoom: 8 },
  { name: "Cairo", lat: 30.04, lon: 31.24, zoom: 8 },
  { name: "Sao Paulo", lat: -23.55, lon: -46.63, zoom: 8, aliases: ["são paulo"] },
];

export const TREND_REGION_WORDS: Record<string, string[]> = {
  rondonia: ["amazon", "rondonia", "rondônia", "brazil"],
  "north-slope": ["alaska", "arctic", "north slope"],
  "upper-colorado": ["colorado", "rockies"],
  "moroccan-atlas": ["morocco", "atlas"],
  "central-sahel": ["sahel", "niger"],
  "punjab-plain": ["punjab", "india", "pakistan"],
  "malay-peninsula": ["malay", "malaysia", "malacca", "sumatra"],
  "murray-darling": ["murray", "darling", "australia"],
};
export const TREND_VARIABLE_WORDS: Record<string, string[]> = {
  PRECTOTCORR: ["rain", "rainfall", "precipitation", "precip"],
  T2M: ["temperature", "warming", "temp", "heat"],
  QV2M: ["humidity"],
  WS10M: ["wind speed", "windiness"],
  GWETROOT: ["soil", "soil moisture", "soil wetness", "drought"],
  NDVI: ["ndvi", "vegetation", "greenness"],
};

export type Command =
  | { kind: "fly"; lat: number; lon: number; zoom: number; label: string }
  | { kind: "simulate"; vmaxKt?: number; lat?: number; lon?: number; label: string }
  | { kind: "trend"; regionId?: string; variableId?: string; label: string }
  | { kind: "reset"; label: string }
  | { kind: "none"; label: string };

/** Representative Vmax for a named category: the lower bound of the NHC band, +3 kt for category 5. */
export function vmaxForCategory(cat: number): number {
  const band = SAFFIR_SIMPSON.find((b) => b.category === cat);
  if (!band) return 50;
  return cat === 5 ? band.minKt + 3 : band.minKt + Math.round((Math.min(band.maxKt, band.minKt + 40) - band.minKt) / 2);
}

export function findPlace(text: string, extra: Place[] = []): Place | null {
  const q = text.toLowerCase();
  let best: Place | null = null;
  let bestLen = 0;
  for (const p of [...PLACES, ...extra]) {
    for (const n of [p.name.toLowerCase(), ...(p.aliases ?? [])]) {
      if (n.length > bestLen && new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(q)) {
        best = p;
        bestLen = n.length;
      }
    }
  }
  return best;
}

const pick = (q: string, table: Record<string, string[]>) => {
  for (const [id, words] of Object.entries(table)) if (words.some((w) => q.includes(w))) return id;
  return undefined;
};

export function parseCommand(text: string, extraPlaces: Place[] = []): Command {
  const raw = text.trim();
  const q = raw.toLowerCase();
  if (!q) return { kind: "none", label: "Type a place, coordinates, or a command such as: simulate a category 5 hurricane near Houston." };

  const coord = q.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([ns])?\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([ew])?\s*$/);
  if (coord) {
    let lat = Number(coord[1]);
    let lon = Number(coord[3]);
    if (coord[2] === "s") lat = -Math.abs(lat);
    if (coord[4] === "w") lon = -Math.abs(lon);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { kind: "fly", lat, lon, zoom: 6, label: `Coordinates ${lat.toFixed(2)}, ${lon.toFixed(2)}` };
    return { kind: "none", label: "Those coordinates are out of range (latitude ±90, longitude ±180)." };
  }

  if (/^(reset|clear|start over)\b/.test(q)) return { kind: "reset", label: "Workspace reset." };

  const place = findPlace(q, extraPlaces);

  if (/(simulat|hurricane|cyclone|typhoon|landfall|storm)/.test(q)) {
    let vmaxKt: number | undefined;
    const cat = q.match(/cat(?:egory)?\.?\s*([1-5])/);
    if (cat) vmaxKt = vmaxForCategory(Number(cat[1]));
    else if (/\bmajor\b/.test(q)) vmaxKt = vmaxForCategory(4);
    else if (/tropical storm/.test(q)) vmaxKt = 50;
    const kt = q.match(/(\d{2,3})\s*(kt|knots)/);
    if (kt) vmaxKt = Math.max(35, Math.min(175, Number(kt[1])));
    return {
      kind: "simulate",
      vmaxKt,
      lat: place?.lat,
      lon: place?.lon,
      label: `Hypothetical hurricane${vmaxKt ? ` at ${vmaxKt} kt` : ""}${place ? ` near ${place.name}` : " (Scenario 001 location)"}. Keyword parser, no AI.`,
    };
  }

  const variableId = pick(q, TREND_VARIABLE_WORDS);
  const regionId = pick(q, TREND_REGION_WORDS);
  if (/trend/.test(q) || (variableId && regionId)) {
    return { kind: "trend", regionId, variableId, label: `Trend explorer${variableId ? `: ${variableId}` : ""}${regionId ? ` in ${regionId}` : ""}.` };
  }

  if (place) return { kind: "fly", lat: place.lat, lon: place.lon, zoom: place.zoom, label: place.name };
  return { kind: "none", label: `No match for "${raw}". Try a city, a country, "29.7, -95.3", "rainfall trend amazon" or "simulate category 5 hurricane near Houston".` };
}
