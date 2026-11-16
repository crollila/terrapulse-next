import { useStore, sameSel, type Selection } from "../state/store";
import { useScenario, useHazards } from "../state/derived";
import { LAYER_BY_ID, gibsDate } from "../data/layers";
import { ageLabel, freshnessStatus, utc } from "../data/freshness";
import { listingFor, niceName } from "../data/companies";
import { useCatalog, useOverview } from "../data/trends";
import { fmtBpd } from "../sim/graph";
import { scenarioRainfallMm } from "../sim/rcliper";
import { Badge, FactRow, Icon, Src } from "./ui";
import { useLayerStatus } from "./LayerPanel";
import type { LayerDef } from "../data/layers";

const EIA = { label: "EIA Refinery Capacity Report", url: "https://www.eia.gov/petroleum/refinerycapacity/" };
const USACE = { label: "USACE / BTS Principal Ports", url: "https://www.arcgis.com/home/item.html?id=e3b6065cce144be8a13a59e03c4195fe" };

const fmtH = (h: number | null) => (h === null ? "never" : h === 0 ? "at landfall" : `${Math.abs(h).toFixed(1)} h ${h < 0 ? "before" : "after"} landfall`);

export function selectionTitle(sel: Selection, ctx: { hazards: ReturnType<typeof useHazards>; refineries: any[]; ports: any[]; graph: ReturnType<typeof useScenario>["graph"]; regions: { id: string; name: string }[] }): string {
  switch (sel.type) {
    case "hazard":
      return ctx.hazards.find((h) => h.id === sel.id)?.title ?? "Event";
    case "refinery": {
      const r = ctx.refineries.find((x) => x.id === sel.id);
      return r ? `${niceName(r.name)} refinery` : "Refinery";
    }
    case "port":
      return ctx.ports.find((x) => x.id === sel.id)?.name ?? "Port";
    case "region":
      return ctx.regions.find((r) => r.id === sel.id)?.name ?? "Region";
    case "node":
      return ctx.graph.nodes.find((n) => n.id === sel.id)?.label ?? "Node";
    case "edge": {
      const e = ctx.graph.edges.find((x) => x.id === sel.id);
      return e ? `Link: ${e.kind}` : "Link";
    }
    case "layer":
      return LAYER_BY_ID.get(sel.id as any)?.label ?? "Layer";
    case "plant":
      return "Power plant";
  }
}

function LayerDetail({ def }: { def: LayerDef }) {
  const feeds = useStore((s) => s.feeds);
  const refMeta = useStore((s) => s.refineryMeta);
  const portMeta = useStore((s) => s.portMeta);
  const { status, detail } = useLayerStatus(def);
  const f = def.feed ? feeds[def.feed] : undefined;
  return (
    <div className="kv">
      <p>{def.explain}</p>
      <div className="row wrap">
        {status && <Badge kind={status} />}
        <Badge kind={def.evidence} />
        <span className="small muted">{detail}</span>
      </div>
      <FactRow label="Provider" value={f?.meta.provider ?? def.provider} />
      <FactRow label="Dataset" value={f?.meta.dataset ?? def.gibs?.product ?? (def.id === "refineries" || def.id === "listedOnly" ? String(refMeta?.dataset ?? "EIA Refinery Capacity Report") : def.id === "ports" ? String(portMeta?.dataset ?? "Principal Ports") : "Regional monthly means, 8 regions × 6 variables")} />
      {f && (
        <>
          <FactRow label="Newest observation" value={`${utc(f.meta.observedAt)} (${ageLabel(f.meta.observedAt)} ago)`} />
          <FactRow label={f.meta.fromCache ? "Snapshot saved" : "Retrieved this session"} value={`${utc(f.meta.retrievedAt)} (${ageLabel(f.meta.retrievedAt)} ago)`} note={f.meta.cacheReason} />
          <FactRow label="Geographic scope" value={f.meta.scope ?? "n/a"} />
          <FactRow label="Units" value={f.meta.units ?? "n/a"} />
          <FactRow label="Data quality" value={f.meta.quality ?? "n/a"} note={f.rejected ? `${f.rejected} malformed records were rejected by validation.` : "All records passed validation."} />
        </>
      )}
      {def.gibs && (
        <>
          <FactRow label="Observation date" value={def.gibs.daily ? `${gibsDate(def.gibs.lagDays)} (UTC day)` : "Static composite, no single date"} note={def.gibs.daily ? "A date a few days back is requested so the product is complete. This is not a live image." : undefined} />
          <FactRow label="Units" value={def.gibs.units ?? "imagery"} />
          <FactRow label="Geographic scope" value="Global" />
        </>
      )}
      {(def.id === "refineries" || def.id === "listedOnly") && refMeta && (
        <>
          <FactRow label="Capacity as of" value={String(refMeta.dataAsOf)} note={`Coordinates as of ${String(refMeta.coordinatesDataAsOf ?? "n/a")}, joined by site and company. ${String(refMeta.notes ?? "").slice(0, 260)}`} />
          <FactRow label="Retrieved" value={utc(refMeta.retrievedAt)} />
          <FactRow label="Units" value="barrels per calendar day (atmospheric crude distillation)" />
          <FactRow label="License" value="U.S. Government work, public domain" />
        </>
      )}
      {def.id === "ports" && portMeta && (
        <>
          <FactRow label="Data year" value={String(portMeta.dataAsOf)} note="Port positions are centroids of the port polygons, so a large port can plot away from its main channel." />
          <FactRow label="Retrieved" value={utc(portMeta.retrievedAt)} />
          <FactRow label="Units" value="short tons per year" />
        </>
      )}
      <FactRow label="Update cadence" value={f?.meta.cadence ?? def.cadence} />
      <Src label={def.provider} url={f?.meta.landingPage ?? def.sourceUrl} />
    </div>
  );
}

function Detail({ sel }: { sel: Selection }) {
  const hazards = useHazards();
  const feeds = useStore((s) => s.feeds);
  const refineries = useStore((s) => s.refineries);
  const ports = useStore((s) => s.ports);
  const tab = useStore((s) => s.tab);
  const trend = useStore((s) => s.trend);
  const { result, graph } = useScenario();
  const cat = useCatalog().data;
  const ov = useOverview(trend.variableId).data;
  const st = useStore.getState();

  if (sel.type === "layer") {
    const def = LAYER_BY_ID.get(sel.id as any);
    return def ? <LayerDetail def={def} /> : null;
  }
  if (sel.type === "hazard") {
    const h = hazards.find((x) => x.id === sel.id);
    if (!h) return <p className="muted">This event is no longer in the feed.</p>;
    const feed = h.id.startsWith("usgs") ? feeds.usgs : feeds.eonet;
    const status = freshnessStatus({ fromCache: !!feed?.meta.fromCache, observedAt: h.observedAt, retrievedAt: feed?.meta.retrievedAt ?? null });
    return (
      <div className="kv">
        <div className="row wrap">
          <Badge kind={status} />
          <Badge kind="OBSERVED" />
        </div>
        <FactRow label="Observed" value={`${utc(h.observedAt)}`} note={`${ageLabel(h.observedAt)} ago${feed?.meta.fromCache ? `; from a snapshot saved ${ageLabel(feed.meta.retrievedAt)} ago` : ""}`} />
        {h.magnitude !== null && <FactRow label="Reported magnitude" value={`${h.magnitude.toLocaleString("en-US")} ${h.magnitudeUnit ?? ""}`} evidence="OBSERVED" />}
        <FactRow label="Location" value={`${h.lat.toFixed(2)}°, ${h.lon.toFixed(2)}°`} note={h.detail} />
        <FactRow label="Provider" value={h.provider} />
        <Src label="Open the source record" url={h.url} />
        <div className="row wrap">
          <button className="btn sm" onClick={() => st.flyTo({ lat: h.lat, lon: h.lon, zoom: 5.5 })}>
            Fly to
          </button>
          <button
            className="btn sm"
            title="Places a hypothetical hurricane at this location in the simulator"
            onClick={() => {
              st.setSim({ landfallLat: Math.max(-60, Math.min(60, +h.lat.toFixed(2))), landfallLon: +h.lon.toFixed(2) });
              st.setSimPos(0);
              st.setTab("sim");
            }}
          >
            Run a hypothetical hurricane here
          </button>
        </div>
        <p className="tiny muted">Economic exposure is not estimated for observed events yet. Only the hypothetical hurricane scenario has a tested exposure model.</p>
      </div>
    );
  }
  if (sel.type === "refinery") {
    const r = refineries.find((x) => x.id === sel.id);
    if (!r) return null;
    const l = listingFor(r.corporation);
    const ex = result.refineries.find((x) => x.id === r.id);
    return (
      <div className="kv">
        <FactRow label="Crude distillation capacity" value={r.capacityBpd != null ? fmtBpd(r.capacityBpd) : "Insufficient validated data"} evidence="OBSERVED" source={EIA} note="Atmospheric crude distillation, barrels per calendar day, as of 1 January 2026." />
        <FactRow label="Operator" value={niceName(r.company)} evidence="OBSERVED" source={EIA} />
        <FactRow label="Corporate owner" value={`${niceName(r.corporation ?? r.company)}${l?.ticker ? ` (${l.ticker})` : l ? ` · ${l.status}` : ""}`} evidence="OBSERVED" note={l?.note} />
        <FactRow label="Location" value={`${r.city ? niceName(r.city) + ", " : ""}${r.state ?? ""}`} note={`${r.lat.toFixed(4)}°, ${r.lon.toFixed(4)}° (EIA map layer, 2021)`} />
        <FactRow label="Related products" value="Gasoline, diesel and distillate, jet fuel" evidence="OBSERVED" source={{ label: "EIA, Refining crude oil", url: "https://www.eia.gov/energyexplained/oil-and-petroleum-products/refining-crude-oil.php" }} />
        {tab === "sim" && ex && (
          <>
            <FactRow label="Scenario: modelled peak wind" value={`${ex.peakWindKt.toFixed(0)} kt (${ex.exposureClass.replace(/-/g, " ")})`} evidence="MODELED" note={`Centre passes within ${ex.closestApproachKm.toFixed(0)} km. Open-water wind, no decay over land.`} />
            <FactRow label={`Scenario: reaches ${result.params.exposureThresholdKt} kt`} value={fmtH(ex.tOnsetThresholdH)} evidence="MODELED" note={ex.inFootprint ? "Inside the exposure footprint. Exposure is not damage or shutdown." : "Outside the exposure footprint."} />
            <FactRow label="Scenario: storm rainfall, R-CLIPER climatology (experimental)" value={<span data-testid="rcliper-rain">{`${scenarioRainfallMm(result.params, r.lat, r.lon).toFixed(0)} mm (${(scenarioRainfallMm(result.params, r.lat, r.lon) / 25.4).toFixed(1)} in)`}</span>} evidence="MODELED" note="Context only: not used in any count. The published operational baseline (Tuleya et al. 2007) is symmetric and has no rainbands or terrain. Run on Hurricane Harvey it gave about one sixth of the observed rainfall where more than 750 mm fell. No flood depth is implied." />
          </>
        )}
        <div className="row wrap">
          <button className="btn sm" onClick={() => st.flyTo({ lat: r.lat, lon: r.lon, zoom: 9 })}>
            Fly to
          </button>
        </div>
      </div>
    );
  }
  if (sel.type === "port") {
    const p = ports.find((x) => x.id === sel.id);
    if (!p) return null;
    const ex = result.ports.find((x) => x.id === p.id);
    return (
      <div className="kv">
        <FactRow label="Cargo handled" value={p.totalTons != null ? `${(p.totalTons / 1e6).toFixed(1)} million short tons` : "Insufficient validated data"} evidence="OBSERVED" source={USACE} note={`Calendar year ${p.year ?? "n/a"}${p.rank ? `; rank ${p.rank} of the principal ports` : ""}.`} />
        <FactRow label="Location" value={`${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}°`} note="Centroid of the port polygon." />
        {tab === "sim" && ex && <FactRow label="Scenario: modelled peak wind" value={`${ex.peakWindKt.toFixed(0)} kt`} evidence="MODELED" note={ex.inFootprint ? `Reaches ${result.params.exposureThresholdKt} kt ${fmtH(ex.tOnsetThresholdH)}.` : "Outside the exposure footprint."} />}
        {tab === "sim" && ex && <FactRow label="Scenario: storm rainfall, R-CLIPER climatology (experimental)" value={`${scenarioRainfallMm(result.params, p.lat, p.lon).toFixed(0)} mm (${(scenarioRainfallMm(result.params, p.lat, p.lon) / 25.4).toFixed(1)} in)`} evidence="MODELED" note="Context only: not used in any count. The published operational baseline (Tuleya et al. 2007) is symmetric and has no rainbands or terrain. Run on Hurricane Harvey it gave about one sixth of the observed rainfall where more than 750 mm fell. No flood depth is implied." />}
        <button className="btn sm" onClick={() => st.flyTo({ lat: p.lat, lon: p.lon, zoom: 9 })}>
          Fly to
        </button>
      </div>
    );
  }
  if (sel.type === "region") {
    const r = cat?.regions.find((x) => x.id === sel.id);
    const o = ov?.regions.find((x) => x.region === sel.id);
    if (!r) return null;
    const [w, s, e, n] = r.bbox;
    const near = (a: { lat: number; lon: number }) => a.lon >= w - 3 && a.lon <= e + 3 && a.lat >= s - 3 && a.lat <= n + 3;
    const nr = refineries.filter(near);
    const np = ports.filter(near);
    return (
      <div className="kv">
        <p>{r.setting}</p>
        {o && ov && (
          <FactRow
            label={`${ov.variable.name} trend, ${ov.period[0]}–${ov.period[1]}`}
            value={`${o.slope_per_decade >= 0 ? "+" : ""}${o.slope_per_decade.toFixed(ov.variable.decimals)} ${ov.variable.units} per decade`}
            evidence="OBSERVED"
            note={`${o.verdict_title}. 95% range ${o.ci_low.toFixed(ov.variable.decimals)} to ${o.ci_high.toFixed(ov.variable.decimals)}.`}
          />
        )}
        <FactRow label="Infrastructure in or near the box" value={nr.length + np.length ? `${nr.length} U.S. refineries, ${np.length} U.S. principal ports` : "Insufficient validated data"} note={nr.length + np.length ? "Within 3° of the box." : "Infrastructure datasets currently cover the United States only."} />
        <button
          className="btn primary sm"
          onClick={() => {
            st.setTrend({ regionId: r.id });
            st.setTrendOpen(true);
          }}
        >
          Open trend explorer
        </button>
      </div>
    );
  }
  if (sel.type === "node") {
    const node = graph.nodes.find((x) => x.id === sel.id);
    if (!node) return <p className="muted">This node is not part of the current scenario.</p>;
    return (
      <div className="kv">
        {node.sub && <p className="muted">{node.sub}</p>}
        {node.facts.map((f, i) => (
          <FactRow key={i} label={f.label} value={f.value} evidence={f.evidence} source={f.source} note={f.note} />
        ))}
        {node.assetId && (
          <button
            className="btn sm"
            onClick={() => {
              const a = [...refineries, ...ports].find((x) => x.id === node.assetId);
              if (a) st.flyTo({ lat: a.lat, lon: a.lon, zoom: 8.5 });
            }}
          >
            Show on the globe
          </button>
        )}
      </div>
    );
  }
  if (sel.type === "edge") {
    const e = graph.edges.find((x) => x.id === sel.id);
    if (!e) return null;
    const from = graph.nodes.find((n) => n.id === e.from);
    const to = graph.nodes.find((n) => n.id === e.to);
    return (
      <div className="kv">
        <p>
          <strong>{from?.label}</strong> <span className="muted">— {e.kind} →</span> <strong>{to?.label}</strong>
        </p>
        <div className="row">
          <Badge kind={e.basis === "SOURCED" ? "SOURCED" : e.basis === "MODELED" ? "MODELED" : "RESEARCH HYPOTHESIS"} />
        </div>
        <FactRow label="What this link means" value={<span style={{ fontSize: 13, fontWeight: 500 }}>{e.meaning}</span>} source={e.source} />
        {e.basis === "RESEARCH HYPOTHESIS" && <div className="callout warn">A plausible dependency. No size, timing or price effect is claimed.</div>}
      </div>
    );
  }
  return null;
}

/** Context-aware panel: adapts to whatever is selected; items can be pinned and compared. */
export function Inspector({ embedded = false }: { embedded?: boolean }) {
  const selection = useStore((s) => s.selection);
  const pinned = useStore((s) => s.pinned);
  const hazards = useHazards();
  const refineries = useStore((s) => s.refineries);
  const ports = useStore((s) => s.ports);
  const { graph } = useScenario();
  const cat = useCatalog().data;
  const st = useStore.getState();
  const ctx = { hazards, refineries, ports, graph, regions: cat?.regions ?? [] };
  const isPinned = !!selection && pinned.some((p) => sameSel(p, selection));
  const others = pinned.filter((p) => !sameSel(p, selection));

  const body = (
    <>
      {pinned.length > 0 && (
        <div className="section">
          <h4>Pinned ({pinned.length})</h4>
          <div className="pinbar">
            {pinned.map((p) => (
              <span className="pin" key={`${p.type}:${p.id}`}>
                <button style={{ padding: 0, color: "inherit", fontSize: 12, fontWeight: 560 }} onClick={() => st.select(p)}>
                  {selectionTitle(p, ctx).slice(0, 28)}
                </button>
                <button aria-label="Unpin" onClick={() => st.togglePin(p)}>
                  ×
                </button>
              </span>
            ))}
            <button className="btn ghost sm" onClick={() => st.clearPins()}>
              Clear
            </button>
          </div>
        </div>
      )}
      {selection ? (
        <div className="section" data-testid="inspector-detail">
          <Detail sel={selection} />
        </div>
      ) : (
        <div className="section">
          <p className="muted small">Select something on the globe{embedded ? " or in the network" : ""} to see its figures, sources and limits.</p>
        </div>
      )}
      {others.length > 0 && selection && (
        <div className="section">
          <h4>Compare with pinned</h4>
          {others.map((p) => (
            <details key={`${p.type}:${p.id}`} style={{ marginBottom: 6 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--navy)" }}>{selectionTitle(p, ctx)}</summary>
              <div style={{ paddingTop: 8 }}>
                <Detail sel={p} />
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );

  const head = (
    <div className="panel-head" style={embedded ? { padding: "10px 0 6px" } : undefined}>
      <h2 style={{ fontSize: embedded ? 14 : 16 }} data-testid="inspector-title">
        {selection ? selectionTitle(selection, ctx) : "Details"}
      </h2>
      {selection && (
        <>
          <button className="btn sm icon-btn" aria-pressed={isPinned} title={isPinned ? "Unpin" : "Pin to compare"} aria-label={isPinned ? "Unpin" : "Pin"} onClick={() => st.togglePin(selection)} data-testid="pin-btn">
            {Icon.pin}
          </button>
          <button className="btn ghost sm icon-btn" aria-label="Close details" onClick={() => st.select(null)}>
            {Icon.close}
          </button>
        </>
      )}
    </div>
  );

  if (embedded)
    return (
      <div>
        {head}
        {body}
      </div>
    );
  return (
    <aside className="panel panel-right" aria-label="Details">
      {head}
      <div className="panel-body">{body}</div>
    </aside>
  );
}
