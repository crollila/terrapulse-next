import { create } from "zustand";
import type { HazardFeed } from "../data/hazards";
import type { InfrastructureMeta, Port, Refinery } from "../data/types";
import { SCENARIO_001, type HurricaneParams } from "../sim/hurricane";

export type Tab = "world" | "sim";

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
  | { type: "layer"; id: string };

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
  tab: "world",
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
  setTab: (tab) => {
    const layers = { ...get().layers };
    if (tab === "sim") {
      layers.refineries = true;
      layers.ports = true;
    }
    set({ tab, layers, selection: null, simPlaying: false });
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
  setTrendOpen: (trendOpen) => set({ trendOpen }),
  setSim: (p) => set((s) => ({ sim: { ...s.sim, ...p } })),
  setSimPos: (x) => set({ simPos: Math.min(1, Math.max(0, x)) }),
  setSimPlaying: (simPlaying) => set({ simPlaying }),
  startSim: () => set({ simStarted: true, simPlaying: true, simPos: get().simPos >= 0.999 ? 0 : get().simPos }),
  resetSim: () => set({ sim: { ...SCENARIO_001 }, simPos: 0, simPlaying: false, simStarted: false, selection: null, graphFilter: {} }),
  toggleGraphFilter: (k) => set((s) => ({ graphFilter: { ...s.graphFilter, [k]: !s.graphFilter[k] } })),
  setMapReady: (mapReady) => set({ mapReady }),
  setMapError: (mapError) => set({ mapError }),
  resetWorkspace: () => set({ selection: null, pinned: [], layers: { ...DEFAULT_LAYERS, refineries: get().tab === "sim", ports: get().tab === "sim" }, trendOpen: false, graphFilter: {} }),
}));

// Exposed for browser tests and debugging (read-only use; no secrets are held in state).
if (typeof window !== "undefined") (window as unknown as { __tpStore?: typeof useStore }).__tpStore = useStore;
