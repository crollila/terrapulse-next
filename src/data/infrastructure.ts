import type { InfrastructureMeta, Port, Refinery } from "./types";

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Keep only records with valid coordinates; a missing capacity stays null (never zero-filled). */
export function validateRefineries(raw: unknown): Refinery[] {
  const list = (raw as { facilities?: unknown[] } | null)?.facilities;
  if (!Array.isArray(list)) throw new Error("refineries.json: facilities[] missing");
  return (list as any[])
    .filter((f) => f && typeof f.id === "string" && num(f.lat) && num(f.lon) && Math.abs(f.lat) <= 90 && Math.abs(f.lon) <= 180)
    .map((f) => ({ ...f, capacityBpd: num(f.capacityBpd) && f.capacityBpd > 0 ? f.capacityBpd : null }));
}

export function validatePorts(raw: unknown): Port[] {
  const list = (raw as { ports?: unknown[] } | null)?.ports;
  if (!Array.isArray(list)) throw new Error("ports.json: ports[] missing");
  return (list as any[])
    .filter((p) => p && typeof p.id === "string" && num(p.lat) && num(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)
    .map((p) => ({ ...p, totalTons: num(p.totalTons) ? p.totalTons : null }));
}

async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE}data/infrastructure/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export async function loadInfrastructure(): Promise<{ refineries: Refinery[]; ports: Port[]; refineryMeta: InfrastructureMeta; portMeta: InfrastructureMeta }> {
  const [r, p] = await Promise.all([get("refineries.json"), get("ports.json")]);
  return { refineries: validateRefineries(r), ports: validatePorts(p), refineryMeta: r.meta, portMeta: p.meta };
}

export interface PriceSeries {
  id: string;
  name: string;
  units: string;
  frequency: string;
  sourceUrl: string;
  points: [string, number][];
}
export interface HarveyPrices {
  meta: { provider: string; retrievedAt: string; license: string; notes?: string };
  series: PriceSeries[];
}
let harvey: Promise<HarveyPrices> | null = null;
export function loadHarveyPrices(): Promise<HarveyPrices> {
  harvey ??= get("harvey_prices.json");
  return harvey;
}
