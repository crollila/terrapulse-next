import { create } from "zustand";
import type { HazardFeed } from "../data/hazards";
import type { InfrastructureMeta, Port, Refinery } from "../data/types";
import { SCENARIO_001, type HurricaneParams } from "../sim/hurricane";

export type Tab = "trends" | "world" | "sim";
export type CaseKey = "amazon" | "alaska";
const CASE_TARGET: Record<CaseKey, { regionId: string; variableId: string }> = {
  amazon: { regionId: "rondonia", variableId: "PRECTOTCORR" },
  alaska: { regionId: "north-slope", variableId: "T2M" },
};
export type HazardType = "hurricane" | "rainfall" | "wildfire" | "drought";
/** View state of the wildfire record. */
export interface FireView {
  eventId: string;
  /** Hours since the start of the selected fire's record window. */
  hours: number;
  playing: boolean;
  /** Distance from the final perimeter within which a site is listed as near the fire, km. */
  bufferKm: 0 | 2 | 10 | 25 | 50;
  showDetections: boolean;
  showPerimeters: boolean;
  showInfra: boolean;
}
/** hours = -1 means "end of the record", resolved once the fire's file has loaded. */
export const DEFAULT_FIRE: FireView = { eventId: "camp-2018", hours: -1, playing: false, bufferKm: 0, showDetections: true, showPerimeters: true, showInfra: true };
/** View state of the observed-rainfall record (Hurricane Harvey 2017). */
export interface RainView {
  /** Hours since the start of the record window (1200 UTC 23 August 2017). */
  hours: number;
  playing: boolean;
  /** Atlas 14 average recurrence interval used as the screening threshold, years. */
  ariYears: 10 | 25 | 100 | 500 | 1000;
  /** Which Atlas 14 value to compare with: the estimate, or its upper or lower 90% bound. */
  reading: "estimate" | "conservative" | "liberal";
  showField: boolean;
  showMarks: boolean;
  showWind: boolean;
}
/** Length of the rainfall record window, hours (ten Stage IV days). */
export const RAIN_WINDOW_H = 240;
export const DEFAULT_RAIN: RainView = { hours: RAIN_WINDOW_H, playing: false, ariYears: 100, reading: "estimate", showField: true, showMarks: true, showWind: true };
export interface DroughtInputs {
  regionId: string;
  /** Accumulation period in months. */
  k: number;
  /** Rainfall as a fraction of the monthly normal. */
  fraction: number;
  /** Calendar month (1-12) in which the period ends. */
  endMonth: number;
}
export const DEFAULT_DROUGHT: DroughtInputs = { regionId: "murray-darling", k: 12, fraction: 0.6, endMonth: 12 };

export type LayerId =
  | "earthquakes"
  | "wildfires"
  | "storms"
  | "otherEvents"
  | "trendRegions"
  | "gibsTrueColor"
  | "gibsPrecip"
  | "gibsLst"
  | "gibsNdvi"
  | "gibsSst"
  | "blueMarble"
  | "refineries"
  | "ports"
  | "listedOnly";

export type Selection =
  | { type: "hazard"; id: string }
  | { type: "refinery"; id: string }
  | { type: "port"; id: string }
  | { type: "region"; id: string }
  | { type: "node"; id: string }
  | { type: "edge"; id: string }
  | { type: "layer"; id: string }
  | { type: "plant"; id: string };

export interface CameraCmd {
  lon: number;
  lat: number;
  zoom: number;
  pitch?: number;
  bearing?: number;
  /** Monotonic counter so the same target can be requested twice. */
  seq: number;
}

export interface TrendState {
  regionId: string;
  variableId: string;
  startYear: number;
  endYear: number;
  compareRegionId: string | null;
}

interface State {
  tab: Tab;
  layers: Record<LayerId, boolean>;
  selection: Selection | null;
  pinned: Selection[];
  camera: CameraCmd | null;
  feeds: Partial<Record<HazardFeed["id"], HazardFeed>>;
  feedErrors: string[];
  refineries: Refinery[];
  ports: Port[];
  refineryMeta: InfrastructureMeta | null;
  portMeta: InfrastructureMeta | null;
  infraError: string | null;
  trend: TrendState;
  trendOpen: boolean;
  sim: HurricaneParams;
  simPos: number;
  simPlaying: boolean;
  simStarted: boolean;
  graphFilter: Record<string, boolean>;
  mapReady: boolean;
  mapError: string | null;
  pickingLandfall: boolean;
  setPickingLandfall: (p: boolean) => void;
  hazard: HazardType;
  setHazard: (h: HazardType) => void;
  /** Featured investigation open in the Earth-System Trends view, if any. */
  caseId: CaseKey | null;
  setCase: (c: CaseKey | null) => void;
  tourStep: number | null;
  setTourStep: (i: number | null) => void;
  drought: DroughtInputs;
  setDrought: (d: Partial<DroughtInputs>) => void;
  rain: RainView;
  setRain: (r: Partial<RainView>) => void;
  fire: FireView;
  setFire: (f: Partial<FireView>) => void;
  /** Id of the fire whose file is in memory (set by the map layer hook). */
  fireLoadedId: string | null;
  /** True once the rainfall record files are in memory (set by the map layer hook). */
  rainLoaded: boolean;
  setTab: (t: Tab) => void;
  toggleLayer: (id: LayerId) => void;
  setLayer: (id: LayerId, on: boolean) => void;
  select: (s: Selection | null) => void;
  togglePin: (s: Selection) => void;
  clearPins: () => void;
  flyTo: (c: Omit<CameraCmd, "seq">) => void;
  setFeed: (f: HazardFeed) => void;
  setInfra: (r: { refineries: Refinery[]; ports: Port[]; refineryMeta: InfrastructureMeta; portMeta: InfrastructureMeta }) => void;
  setInfraError: (e: string) => void;
  setTrend: (t: Partial<TrendState>) => void;
  setTrendOpen: (o: boolean) => void;
  setSim: (p: Partial<HurricaneParams>) => void;
  setSimPos: (x: number) => void;
  setSimPlaying: (p: boolean) => void;
  startSim: () => void;
  resetSim: () => void;
  toggleGraphFilter: (k: string) => void;
  setMapReady: (r: boolean) => void;
  setMapError: (e: string | null) => void;
  resetWorkspace: () => void;
}

export const DEFAULT_LAYERS: Record<LayerId, boolean> = {
  earthquakes: true,
  wildfires: true,
  storms: true,
  otherEvents: true,
  trendRegions: true,
  gibsTrueColor: false,
  gibsPrecip: false,
  gibsLst: false,
  gibsNdvi: false,
  gibsSst: false,
  blueMarble: false,
  refineries: false,
  ports: false,
  listedOnly: false,
};

export const sameSel = (a: Selection | null, b: Selection | null) => !!a && !!b && a.type === b.type && a.id === b.id;

let seq = 0;

export const useStore = create<State>((set, get) => ({
  tab: "trends",
  layers: { ...DEFAULT_LAYERS },
  selection: null,
  pinned: [],
  camera: null,
  feeds: {},
  feedErrors: [],
  refineries: [],
  ports: [],
  refineryMeta: null,
  portMeta: null,
  infraError: null,
  trend: { regionId: "rondonia", variableId: "PRECTOTCORR", startYear: 1981, endYear: 2025, compareRegionId: null },
  trendOpen: false,
  sim: { ...SCENARIO_001 },
  simPos: 0,
  simPlaying: false,
  simStarted: false,
  graphFilter: {},
  mapReady: false,
  mapError: null,
  pickingLandfall: false,
  setPickingLandfall: (pickingLandfall) => set({ pickingLandfall }),
  caseId: null,
  setCase: (caseId) =>
    set((s) => (caseId ? { caseId, tab: "trends", selection: null, trend: { ...s.trend, ...CASE_TARGET[caseId], startYear: 1900, endYear: 2100, compareRegionId: null } } : { caseId: null })),
  tourStep: null,
  setTourStep: (tourStep) => set({ tourStep }),
  hazard: "hurricane",
  setHazard: (hazard) => set((s) => ({ hazard, selection: null, simPlaying: false, rain: { ...s.rain, playing: false }, fire: { ...s.fire, playing: false } })),
  drought: { ...DEFAULT_DROUGHT },
  setDrought: (d) => set((s) => ({ drought: { ...s.drought, ...d } })),
  rain: { ...DEFAULT_RAIN },
  rainLoaded: false,
  fire: { ...DEFAULT_FIRE },
  fireLoadedId: null,
  setFire: (f) => set((s) => ({ fire: { ...s.fire, ...f, ...(f.eventId && f.eventId !== s.fire.eventId ? { hours: f.hours ?? -1, playing: false } : {}) }, ...(f.eventId && f.eventId !== s.fire.eventId ? { selection: null } : {}) })),
  setRain: (r) => set((s) => ({ rain: { ...s.rain, ...r, hours: Math.min(RAIN_WINDOW_H, Math.max(0, r.hours ?? s.rain.hours)) } })),
  setTab: (tab) => {
    const layers = { ...get().layers };
    if (tab === "sim") {
      layers.refineries = true;
      layers.ports = true;
    }
    set((s) => ({ tab, layers, selection: null, simPlaying: false, rain: { ...s.rain, playing: false }, fire: { ...s.fire, playing: false } }));
  },
  toggleLayer: (id) => set((s) => ({ layers: { ...s.layers, [id]: !s.layers[id] } })),
  setLayer: (id, on) => set((s) => ({ layers: { ...s.layers, [id]: on } })),
  select: (selection) => set({ selection }),
  togglePin: (sel) => set((s) => ({ pinned: s.pinned.some((p) => sameSel(p, sel)) ? s.pinned.filter((p) => !sameSel(p, sel)) : [...s.pinned, sel].slice(-4) })),
  clearPins: () => set({ pinned: [] }),
  flyTo: (c) => set({ camera: { ...c, seq: ++seq } }),
  setFeed: (f) => set((s) => ({ feeds: { ...s.feeds, [f.id]: f } })),
  setInfra: (r) => set({ ...r, infraError: null }),
  setInfraError: (infraError) => set({ infraError }),
  setTrend: (t) => set((s) => ({ trend: { ...s.trend, ...t } })),
  // The trend explorer now lives in the Earth-System Trends view: "opening" it goes there.
  setTrendOpen: (open) => set(open ? { tab: "trends", caseId: null, trendOpen: false, selection: null } : { trendOpen: false }),
  setSim: (p) => set((s) => ({ sim: { ...s.sim, ...p } })),
  setSimPos: (x) => set({ simPos: Math.min(1, Math.max(0, x)) }),
  setSimPlaying: (simPlaying) => set({ simPlaying }),
  startSim: () => set({ simStarted: true, simPlaying: true, simPos: get().simPos >= 0.999 ? 0 : get().simPos }),
  resetSim: () => set({ sim: { ...SCENARIO_001 }, simPos: 0, simPlaying: false, simStarted: false, selection: null, graphFilter: {}, hazard: "hurricane", drought: { ...DEFAULT_DROUGHT }, rain: { ...DEFAULT_RAIN }, fire: { ...DEFAULT_FIRE } }),
  toggleGraphFilter: (k) => set((s) => ({ graphFilter: { ...s.graphFilter, [k]: !s.graphFilter[k] } })),
  setMapReady: (mapReady) => set({ mapReady }),
  setMapError: (mapError) => set({ mapError }),
  resetWorkspace: () => set({ selection: null, pinned: [], layers: { ...DEFAULT_LAYERS, refineries: get().tab === "sim", ports: get().tab === "sim" }, trendOpen: false, graphFilter: {} }),
}));

// Exposed for browser tests and debugging (read-only use; no secrets are held in state).
if (typeof window !== "undefined") (window as unknown as { __tpStore?: typeof useStore }).__tpStore = useStore;
