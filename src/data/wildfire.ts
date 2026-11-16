/**
 * Loaders for the bundled wildfire record (public/data/wildfire/, built by
 * research/scripts/build_wildfires.py). Files are validated on load.
 */
import { useEffect, useState } from "react";
import type { FireEvent } from "../sim/wildfire";

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";

export interface FireIndexEntry {
  id: string;
  name: string;
  place: string;
  year: number;
  start: string;
  contained: string | null;
  reportedAcres: number;
  bbox: [number, number, number, number];
  detections: number;
  datedPerimeters: number;
  file: string;
}
export interface FireIndex {
  meta: { builtAt: string; note: string };
  events: FireIndexEntry[];
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}data/wildfire/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function validateFire(ev: FireEvent): FireEvent {
  if (!ev?.meta?.id || !ev.perimeter?.geometry || !Array.isArray(ev.detections?.rows) || !Array.isArray(ev.progression)) throw new Error("wildfire file: malformed");
  if (!Number.isFinite(Date.parse(ev.meta.start))) throw new Error(`wildfire file ${ev.meta.id}: bad start time`);
  for (let i = 1; i < ev.detections.rows.length; i++) if (ev.detections.rows[i][0] < ev.detections.rows[i - 1][0]) throw new Error(`wildfire file ${ev.meta.id}: detections are not in time order`);
  return ev;
}

let index: Promise<FireIndex> | null = null;
export function loadFireIndex(): Promise<FireIndex> {
  index ??= get<FireIndex>("index.json").then((d) => {
    if (!Array.isArray(d?.events) || !d.events.length) throw new Error("wildfire index: no events");
    return d;
  });
  index.catch(() => (index = null));
  return index;
}

const events = new Map<string, Promise<FireEvent>>();
export function loadFire(id: string): Promise<FireEvent> {
  let p = events.get(id);
  if (!p) {
    p = loadFireIndex().then((ix) => {
      const e = ix.events.find((x) => x.id === id);
      if (!e) throw new Error(`unknown fire ${id}`);
      return get<FireEvent>(e.file).then(validateFire);
    });
    events.set(id, p);
    p.catch(() => events.delete(id));
  }
  return p;
}

export function useFireIndex(): { data: FireIndex | null; error: string | null } {
  const [data, setData] = useState<FireIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    loadFireIndex().then(
      (d) => live && setData(d),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, []);
  return { data, error };
}

export function useFire(id: string): { data: FireEvent | null; error: string | null } {
  const [state, setState] = useState<{ id: string; data: FireEvent | null; error: string | null }>({ id, data: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ id, data: null, error: null });
    loadFire(id).then(
      (d) => live && setState({ id, data: d, error: null }),
      (e: Error) => live && setState({ id, data: null, error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [id]);
  return state.id === id ? { data: state.data, error: state.error } : { data: null, error: null };
}
