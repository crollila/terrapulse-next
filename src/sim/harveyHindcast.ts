/**
 * Hindcast of the wind and rainfall screens against the reconstructed DOE record for Hurricane
 * Harvey (2017). Pure and deterministic.
 *
 * Universe: refineries of the EIA fleet as of 1 January 2017 that have a crude distillation
 * capacity, a position, and rainfall data (inside the rainfall record area).
 * Record: the refineries DOE counted as shut or shutting down in one report (reconstructed; see
 * research/scripts/build_doe_harvey_record.py).
 * Screens are evaluated with what had been observed BY THE TIME OF THE REPORT: best-track wind radii
 * up to that hour, and rainfall days completed by then. Nothing here is fitted to the record.
 */
import { type BestTrackStorm } from "./hindcast";
import { ariFor, contingency, type AssetRain, type Contingency, type Reading } from "./rainfall";
import { completedDays, exposuresToDate, recordWindow, windClassBy, windOnsets } from "./rainRecord";

export interface HindcastSite {
  id: string;
  name: string;
  company: string;
  lat: number;
  lon: number;
  capacityBpd: number | null;
}

export interface ScreenScore {
  key: string;
  label: string;
  ids: string[];
  /** Sum of 2017 capacity over the screen's refineries, b/d. */
  capacityBpd: number;
  score: Contingency;
}

export interface HarveyHindcast {
  asOfUtc: string;
  /** Rainfall days completed at the report time. */
  rainDays: number;
  universe: HindcastSite[];
  /** Recorded refineries inside the universe, and those left out because they have no position or no rainfall data. */
  recorded: string[];
  recordedOutsideUniverse: string[];
  recordedCapacityBpd: number;
  screens: ScreenScore[];
}

export interface HindcastInput {
  /** 2017 fleet (any extent); filtered here to sites with capacity and rainfall data. */
  fleet: HindcastSite[];
  rain: AssetRain[];
  /** Dates of the daily rainfall fields. */
  days: string[];
  storm: BestTrackStorm;
  /** Fleet ids of the refineries in the record. */
  recordedIds: string[];
  /** Time of the record, ISO UTC. */
  asOfUtc: string;
  ariYears: number;
  reading?: Reading;
  /** Scale applied to rainfall, for sensitivity. */
  rainFactor?: number;
}

export function harveyHindcast(inp: HindcastInput): HarveyHindcast {
  const reading = inp.reading ?? "estimate";
  const rainById = new Map(inp.rain.map((a) => [a.id, a]));
  const universe = inp.fleet.filter((s) => typeof s.capacityBpd === "number" && s.capacityBpd > 0 && rainById.has(s.id));
  const uIds = universe.map((s) => s.id);
  const uSet = new Set(uIds);
  const cap = new Map(universe.map((s) => [s.id, s.capacityBpd ?? 0]));
  const sumCap = (ids: string[]) => ids.reduce((s, id) => s + (cap.get(id) ?? 0), 0);

  const ms = Date.parse(inp.asOfUtc);
  if (!Number.isFinite(ms)) throw new Error(`bad asOfUtc ${inp.asOfUtc}`);
  const w = recordWindow(inp.days);
  const rainDays = completedDays(w, (ms - w.startMs) / 3_600_000);

  const on = windOnsets(inp.storm, universe);
  const wind = (kt: 34 | 50 | 64) => uIds.filter((id) => windClassBy(on, id, ms) >= kt);

  const ex = exposuresToDate(
    universe.map((s) => rainById.get(s.id)!),
    rainDays,
    inp.rainFactor ?? 1,
  );
  const rainIds = ex.filter((e) => (ariFor(e, reading) ?? -1) >= inp.ariYears).map((e) => e.id);
  const union = (a: string[], b: string[]) => uIds.filter((id) => a.includes(id) || b.includes(id));

  const recorded = inp.recordedIds.filter((id) => uSet.has(id));
  const defs: { key: string; label: string; ids: string[] }[] = [
    { key: "wind64", label: "Wind: inside the observed 64-kt radii", ids: wind(64) },
    { key: "wind50", label: "Wind: inside the observed 50-kt radii", ids: wind(50) },
    { key: "wind34", label: "Wind: inside the observed 34-kt radii", ids: wind(34) },
    { key: "rain", label: `Rainfall: reached the ${inp.ariYears.toLocaleString("en-US")}-year depth`, ids: rainIds },
    { key: "wind50orRain", label: "50-kt wind or that rainfall", ids: union(wind(50), rainIds) },
    { key: "wind64orRain", label: "64-kt wind or that rainfall", ids: union(wind(64), rainIds) },
  ];
  return {
    asOfUtc: inp.asOfUtc,
    rainDays,
    universe,
    recorded,
    recordedOutsideUniverse: inp.recordedIds.filter((id) => !uSet.has(id)),
    recordedCapacityBpd: sumCap(recorded),
    screens: defs.map((d) => ({ ...d, capacityBpd: sumCap(d.ids), score: contingency(uIds, d.ids, recorded) })),
  };
}
