import { useMemo } from "react";
import { useStore } from "./store";
import { runScenario, timelineState, type HurricaneParams, type ScenarioResult, type TimelineState } from "../sim/hurricane";
import { buildGraph, companyExposures, type CompanyExposure, type ImpactGraph } from "../sim/graph";
import type { Port, Refinery } from "../data/types";
import type { HazardEvent } from "../data/types";

export interface Scenario {
  result: ScenarioResult;
  graph: ImpactGraph;
  companies: CompanyExposure[];
}

let cache: { p: HurricaneParams; r: Refinery[]; pt: Port[]; out: Scenario } | null = null;

/** Memoised across components: recomputed only when parameters or datasets change. */
export function getScenario(p: HurricaneParams, r: Refinery[], pt: Port[]): Scenario {
  if (cache && cache.p === p && cache.r === r && cache.pt === pt) return cache.out;
  const result = runScenario(p, r, pt);
  const out = { result, graph: buildGraph(result), companies: companyExposures(result) };
  cache = { p, r, pt, out };
  return out;
}

export function useScenario(): Scenario {
  const p = useStore((s) => s.sim);
  const r = useStore((s) => s.refineries);
  const pt = useStore((s) => s.ports);
  return useMemo(() => getScenario(p, r, pt), [p, r, pt]);
}

export function useTimeline(): TimelineState {
  const pos = useStore((s) => s.simPos);
  const { result } = useScenario();
  return useMemo(() => timelineState(pos, result), [pos, result]);
}

export function useHazards(): HazardEvent[] {
  const feeds = useStore((s) => s.feeds);
  return useMemo(() => [...(feeds.usgs?.events ?? []), ...(feeds.eonet?.events ?? [])], [feeds]);
}
