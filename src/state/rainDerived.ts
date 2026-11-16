import { useMemo } from "react";
import { useStore } from "./store";
import { useHarveyRain, type HarveyRainData } from "../data/rainfall";
import { ariFor, screenSummary, type RainExposure, type Reading, type ScreenSummary } from "../sim/rainfall";
import { completedDays, exposuresToDate, hourlyTrack, recordWindow, timeAt, trackAt, windClassBy, windOnsets, type RecordWindow, type WindOnset } from "../sim/rainRecord";
import type { TrackPoint } from "../sim/hindcast";
import type { Port, Refinery } from "../data/types";

export interface WindScreen {
  thresholdKt: 34 | 50 | 64;
  inside: string[];
  capacityBpd: number;
  capacityUnknown: number;
}

export interface RainRecord {
  data: HarveyRainData;
  window: RecordWindow;
  /** Complete Stage IV days at the current time (0 ... 10). */
  count: number;
  /** Current time, ms since the epoch. */
  ms: number;
  track: TrackPoint[];
  now: TrackPoint | null;
  /** Exposure of every site from the days completed so far, and from the whole record. */
  toDate: RainExposure[];
  full: RainExposure[];
  byId: Map<string, RainExposure>;
  fullById: Map<string, RainExposure>;
  summary: ScreenSummary;
  /** The same screen under the two alternative readings of Atlas 14 (its 90% bounds). */
  bounds: Record<Reading, ScreenSummary>;
  /** The screen with the rainfall analysis scaled down and up by `rainErr`. */
  rainLow: ScreenSummary;
  rainHigh: ScreenSummary;
  wind: WindOnset;
  windScreens: WindScreen[];
  /** Refineries inside the observed 64-kt radii or the rainfall screen. */
  either: { inside: string[]; capacityBpd: number };
  refineriesInDomain: Refinery[];
  portsInDomain: Port[];
  datasetCapacityBpd: number;
}

/**
 * Relative error applied to the rainfall analysis for the sensitivity lines. 0.2 = 20%, a round
 * figure chosen before the gauge comparison was run; the comparison itself is reported in
 * research/RAINFALL_FLOOD.md and does not tune this value.
 */
export const RAIN_SENSITIVITY = 0.2;

export function useRainRecord(): { rec: RainRecord | null; error: string | null } {
  const { data, error } = useHarveyRain();
  const rain = useStore((s) => s.rain);
  const refineries = useStore((s) => s.refineries);
  const ports = useStore((s) => s.ports);

  const base = useMemo(() => {
    if (!data || !refineries.length) return null;
    const window = recordWindow(data.assets.meta.days);
    const ids = new Set(data.assets.assets.map((a) => a.id));
    const refineriesInDomain = refineries.filter((r) => ids.has(r.id));
    const portsInDomain = ports.filter((p) => ids.has(p.id));
    // The file also holds refineries of the 2017 fleet for the hindcast; this view counts today's sites only.
    const current = new Set([...refineriesInDomain, ...portsInDomain].map((s) => s.id));
    const assets = data.assets.assets.filter((a) => current.has(a.id));
    const full = exposuresToDate(assets, window.nDays);
    return {
      window,
      assets,
      track: hourlyTrack(data.track),
      refineriesInDomain,
      portsInDomain,
      full,
      fullById: new Map(full.map((e) => [e.id, e])),
      wind: windOnsets(data.track, [...refineriesInDomain, ...portsInDomain]),
      datasetCapacityBpd: refineries.reduce((s, r) => s + (r.capacityBpd ?? 0), 0),
    };
  }, [data, refineries, ports]);

  const count = base ? completedDays(base.window, rain.hours) : 0;

  const byDay = useMemo(() => {
    if (!data || !base) return null;
    const toDate = count === base.window.nDays ? base.full : exposuresToDate(base.assets, count);
    return { toDate, byId: new Map(toDate.map((e) => [e.id, e])), low: exposuresToDate(base.assets, count, 1 - RAIN_SENSITIVITY), high: exposuresToDate(base.assets, count, 1 + RAIN_SENSITIVITY) };
  }, [data, base, count]);

  const rec = useMemo<RainRecord | null>(() => {
    if (!data || !base || !byDay) return null;
    const ms = timeAt(base.window, rain.hours);
    const refs = base.refineriesInDomain;
    const summary = screenSummary(byDay.toDate, refs, rain.ariYears, rain.reading);
    const cap = new Map(refs.map((r) => [r.id, r.capacityBpd]));
    const windScreens = ([34, 50, 64] as const).map((thresholdKt) => {
      const inside = refs.filter((r) => windClassBy(base.wind, r.id, ms) >= thresholdKt);
      return { thresholdKt, inside: inside.map((r) => r.id), capacityBpd: inside.reduce((s, r) => s + (r.capacityBpd ?? 0), 0), capacityUnknown: inside.filter((r) => r.capacityBpd == null).length };
    });
    const rainRefs = new Set(byDay.toDate.filter((e) => e.kind === "refinery" && (ariFor(e, rain.reading) ?? -1) >= rain.ariYears).map((e) => e.id));
    const w64 = new Set(windScreens[2].inside);
    const eitherIds = refs.filter((r) => rainRefs.has(r.id) || w64.has(r.id)).map((r) => r.id);
    return {
      data,
      window: base.window,
      count,
      ms,
      track: base.track,
      now: trackAt(base.track, ms),
      toDate: byDay.toDate,
      full: base.full,
      byId: byDay.byId,
      fullById: base.fullById,
      summary,
      bounds: { estimate: screenSummary(byDay.toDate, refs, rain.ariYears, "estimate"), conservative: screenSummary(byDay.toDate, refs, rain.ariYears, "conservative"), liberal: screenSummary(byDay.toDate, refs, rain.ariYears, "liberal") },
      rainLow: screenSummary(byDay.low, refs, rain.ariYears, rain.reading),
      rainHigh: screenSummary(byDay.high, refs, rain.ariYears, rain.reading),
      wind: base.wind,
      windScreens,
      either: { inside: eitherIds, capacityBpd: eitherIds.reduce((s, id) => s + (cap.get(id) ?? 0), 0) },
      refineriesInDomain: refs,
      portsInDomain: base.portsInDomain,
      datasetCapacityBpd: base.datasetCapacityBpd,
    };
  }, [data, base, byDay, count, rain.hours, rain.ariYears, rain.reading]);

  return { rec, error };
}
