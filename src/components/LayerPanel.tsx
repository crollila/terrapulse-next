import { useStore, type LayerId } from "../state/store";
import { CATEGORIES, LAYERS, gibsDate, type LayerDef } from "../data/layers";
import { ageLabel, freshnessStatus } from "../data/freshness";
import type { FreshnessStatus, HazardEvent } from "../data/types";
import { Badge, Switch } from "./ui";

const kindLayer = (k: HazardEvent["kind"]): LayerId => (k === "earthquake" ? "earthquakes" : k === "wildfire" ? "wildfires" : k === "severeStorm" ? "storms" : "otherEvents");

/** Freshness label and one-line detail for a layer, from real metadata only. */
export function useLayerStatus(def: LayerDef): { status: FreshnessStatus | null; detail: string; count: number | null } {
  const feeds = useStore((s) => s.feeds);
  const refineries = useStore((s) => s.refineries);
  const ports = useStore((s) => s.ports);
  const refMeta = useStore((s) => s.refineryMeta);
  const portMeta = useStore((s) => s.portMeta);
  const infraError = useStore((s) => s.infraError);
  if (def.feed) {
    const f = feeds[def.feed];
    if (!f) return { status: null, detail: "loading…", count: null };
    const evs = f.events.filter((e) => kindLayer(e.kind) === def.id);
    const newest = evs.length ? new Date(Math.max(...evs.map((e) => Date.parse(e.observedAt)))).toISOString() : null;
    const status = freshnessStatus({ fromCache: f.meta.fromCache, observedAt: newest, retrievedAt: f.meta.retrievedAt });
    const detail = f.meta.fromCache
      ? `${evs.length} events · snapshot saved ${ageLabel(f.meta.retrievedAt)} ago`
      : evs.length
        ? `${evs.length} events · newest ${ageLabel(newest)} ago`
        : "no open events reported";
    return { status: evs.length || f.meta.fromCache ? status : null, detail, count: evs.length };
  }
  if (def.gibs) {
    if (!def.gibs.daily) return { status: "HISTORICAL", detail: "static composite image", count: null };
    const d = gibsDate(def.gibs.lagDays);
    return { status: freshnessStatus({ fromCache: false, observedAt: `${d}T12:00:00Z`, retrievedAt: null }), detail: `imagery date ${d}`, count: null };
  }
  if (def.id === "trendRegions") return { status: "HISTORICAL", detail: "8 regions · 1981–2025 · retrieved 2026-11-14", count: 8 };
  if (def.id === "refineries" || def.id === "listedOnly") {
    if (infraError) return { status: null, detail: "Insufficient validated data: dataset failed to load", count: null };
    return { status: "HISTORICAL", detail: refMeta ? `${refineries.length} sites · capacity as of ${refMeta.dataAsOf}` : "loading…", count: refineries.length };
  }
  if (def.id === "ports") {
    if (infraError) return { status: null, detail: "Insufficient validated data: dataset failed to load", count: null };
    return { status: "HISTORICAL", detail: portMeta ? `${ports.length} ports · ${portMeta.dataAsOf}` : "loading…", count: ports.length };
  }
  return { status: null, detail: "", count: null };
}

function LayerRow({ def }: { def: LayerDef }) {
  const on = useStore((s) => s.layers[def.id]);
  const toggle = useStore((s) => s.toggleLayer);
  const setLayer = useStore((s) => s.setLayer);
  const select = useStore((s) => s.select);
  const { status, detail } = useLayerStatus(def);
  return (
    <div className={`layer ${on ? "" : "off"}`} data-testid={`layer-${def.id}`}>
      <button
        type="button"
        className="layer-main"
        onClick={() => {
          useStore.getState().setTrendOpen(false);
          select({ type: "layer", id: def.id });
        }}
        title="Show source details"
      >
        <span className="layer-dot" style={{ background: def.color }} />
        <span className="layer-label">{def.label}</span>
      </button>
      <Switch
        checked={on}
        label={`Toggle ${def.label}`}
        onChange={() => {
          toggle(def.id);
          if (def.id === "listedOnly" && !on) setLayer("refineries", true);
        }}
      />
      <div className="layer-meta">
        {status && <Badge kind={status} />}
        <span>{detail}</span>
      </div>
    </div>
  );
}

export function LayerPanel() {
  const feeds = useStore((s) => s.feeds);
  const anyCache = Object.values(feeds).some((f) => f?.meta.fromCache);
  return (
    <aside className="panel panel-left" aria-label="Map layers">
      <div className="panel-head">
        <h2>Layers</h2>
        <button className="btn ghost sm" onClick={() => useStore.getState().resetWorkspace()}>
          Reset
        </button>
      </div>
      <div className="panel-body">
        {anyCache && (
          <div className="callout warn" style={{ marginBottom: 10 }}>
            A live source could not be reached. Layers marked <strong>CACHED</strong> show the last saved snapshot, not new observations.
          </div>
        )}
        {CATEGORIES.map((cat) => (
          <div className="layer-cat" key={cat}>
            <div className="layer-cat-head">
              <h4>{cat}</h4>
            </div>
            {LAYERS.filter((l) => l.category === cat).map((def) => (
              <LayerRow key={def.id} def={def} />
            ))}
          </div>
        ))}
        <p className="footer-note">
          Click a layer name for its source, timestamps and limits. TerraPulse is not a NASA product and is not for emergency use. Code generated with AI assistance; every figure is computed from cited data.
        </p>
      </div>
    </aside>
  );
}
