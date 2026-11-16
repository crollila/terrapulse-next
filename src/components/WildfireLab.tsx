import { useEffect, useMemo, useState } from "react";
import { useStore, type FireView } from "../state/store";
import { useFire, useFireIndex } from "../data/wildfire";
import { buildExposureGraph } from "../sim/graph";
import { FIRE_BUFFERS_KM, VIIRS_PIXEL_KM, WILDFIRE_CARD, agreementAt, detectionsBy, fireExposureSet, fireScreen, fireTime, fireWindow, overpassAt, perimeterAt, type FireEvent, type FireSource } from "../sim/wildfire";
import { fmtUtc, fmtUtcMinutes } from "../sim/rainRecord";
import { fmtBpd } from "../sim/graph";
import { niceName } from "../data/companies";
import { Badge, FactRow, Icon, Src } from "./ui";
import { HazardSelect } from "./HazardSelect";
import { ImpactGraph } from "./ImpactGraph";
import { GraphDetail } from "./ExposureNetwork";

const HOUR_MS = 3_600_000;
const DURATION_S = 24;
const acres = (a: number) => `${Math.round(a).toLocaleString("en-US")} acres`;
const km2 = (a: number) => `${Math.round(a / 247.105381).toLocaleString("en-US")} km²`;
const whereTxt = (km: number) => (km === 0 ? "inside the mapped perimeter" : `within ${km} km of the mapped perimeter`);

function FireTimeline({ ev, hours, total }: { ev: FireEvent | null; hours: number; total: number }) {
  const playing = useStore((s) => s.fire.playing);
  const setFire = useStore((s) => s.setFire);
  useEffect(() => {
    if (!playing || !total) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.75, (now - last) / 1000);
      last = now;
      const st = useStore.getState();
      const cur = st.fire.hours < 0 ? total : st.fire.hours;
      const next = cur + (dt / DURATION_S) * total;
      if (next >= total) {
        st.setFire({ hours: total, playing: false });
        return;
      }
      st.setFire({ hours: next });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, total]);

  const w = ev ? fireWindow(ev) : null;
  const ms = w ? fireTime(w, hours) : 0;
  const n = ev ? detectionsBy(ev, ms) : 0;
  const pass = ev ? overpassAt(ev, ms) : null;
  const frac = (t: number) => (w ? (t - w.startMs) / (w.hours * HOUR_MS) : 0);
  const marks = ev ? [{ t: Date.parse(ev.meta.start), label: `Start on the record, ${fmtUtcMinutes(Date.parse(ev.meta.start))}`, color: "#d93a3f" }, ...ev.progression.map((p) => ({ t: Date.parse(p.time), label: `Perimeter mapped ${fmtUtcMinutes(Date.parse(p.time))}: ${p.acres != null ? acres(p.acres) : "size n/a"} (${p.method ?? "method n/a"})`, color: "#0b1f3f" }))] : [];
  return (
    <section className="timeline" aria-label="Fire record timeline" data-testid="fire-timeline">
      <div className="tl-top rain-top">
        <button className="btn primary sm icon-btn" aria-label={playing ? "Pause" : hours >= total ? "Replay" : "Play"} data-testid="fire-play" onClick={() => (playing ? setFire({ playing: false }) : setFire({ hours: hours >= total - 0.01 ? 0 : hours, playing: true }))}>
          {playing ? Icon.pause : Icon.play}
        </button>
        <button className="btn sm icon-btn" aria-label="Rewind to start" data-testid="fire-rewind" onClick={() => setFire({ hours: 0, playing: false })}>
          {Icon.rewind}
        </button>
        <span className="tl-stage" data-testid="fire-stage">
          {ev ? `${n.toLocaleString("en-US")} of ${ev.detections.count.toLocaleString("en-US")} satellite detections` : "Loading the record…"}
        </span>
        <Badge kind="OBSERVED" />
        <span className="spacer" />
        {ev && (
          <span className="tl-clock" data-testid="fire-clock">
            {fmtUtc(ms)}
            {pass ? ` · last overpass ${pass.satellite}` : ""}
          </span>
        )}
      </div>
      <div className="tl-track">
        <div className="tl-seg" style={{ left: 0, right: 0, background: "rgba(247,104,8,0.16)" }} />
        {marks.map((m) => (
          <div key={`${m.t}${m.label}`} className="tl-seg" style={{ left: `${Math.max(0, Math.min(1, frac(m.t))) * 100}%`, width: 2, top: 4, height: 18, background: m.color, borderRadius: 1 }} title={m.label} />
        ))}
        <input type="range" min={0} max={Math.max(1, total)} step={1} value={Math.round(hours)} aria-label="Scrub the fire record timeline" data-testid="fire-scrub" style={{ ["--fill" as any]: `${total ? (hours / total) * 100 : 0}%` }} onChange={(e) => setFire({ hours: Number(e.target.value), playing: false })} />
      </div>
      <div className="tiny muted" style={{ marginTop: 4 }}>
        A replay of what was observed: satellite detections at each overpass{ev && ev.progression.length ? " and the perimeters mapped on the dates marked" : ""}. Nothing between observations is filled in, and no spread is simulated.
      </div>
    </section>
  );
}

function ConditionsChart({ ev }: { ev: FireEvent }) {
  const g = ev.conditions.gridmet;
  const erc = g.erc;
  const vs = g.vs;
  const rmin = g.rmin;
  if (!erc || !vs) return <div className="callout warn">Insufficient validated data: fire-weather series were not retrieved.</div>;
  const W = 420;
  const H = 150;
  const m = { l: 30, r: 34, t: 10, b: 20 };
  const n = erc.dates.length;
  const x = (i: number) => m.l + (i / (n - 1)) * (W - m.l - m.r);
  const ercMax = Math.max(100, ...erc.values.map((v) => v ?? 0));
  const yL = (v: number) => m.t + (1 - v / ercMax) * (H - m.t - m.b);
  const wMax = Math.max(15, ...vs.values.map((v) => v ?? 0));
  const yR = (v: number) => m.t + (1 - v / wMax) * (H - m.t - m.b);
  const line = (vals: (number | null)[], y: (v: number) => number) => vals.map((v, i) => (v === null ? "" : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
  const i0 = erc.dates.indexOf(ev.meta.start.slice(0, 10));
  const ticks = [0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1];
  return (
    <div data-testid="fire-conditions">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Energy release component and wind speed around the fire's start">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className={f === 0 ? "axis" : "gridline"} x1={m.l} x2={W - m.r} y1={yL(ercMax * f)} y2={yL(ercMax * f)} />
            <text x={m.l - 5} y={yL(ercMax * f) + 3} textAnchor="end">{Math.round(ercMax * f)}</text>
            <text x={W - m.r + 5} y={yL(ercMax * f) + 3} style={{ fill: "#0b7fd6" }}>{(wMax * f).toFixed(0)}</text>
          </g>
        ))}
        {i0 >= 0 && (
          <g>
            <line x1={x(i0)} x2={x(i0)} y1={m.t} y2={H - m.b} stroke="#d93a3f" strokeWidth={1.2} strokeDasharray="3 3" />
            <text x={x(i0) + 4} y={m.t + 8} style={{ fill: "#d93a3f" }}>fire starts</text>
          </g>
        )}
        <polyline points={line(erc.values, yL)} fill="none" stroke="#d9541e" strokeWidth={1.8} strokeLinejoin="round" />
        <polyline points={line(vs.values, yR)} fill="none" stroke="#0b7fd6" strokeWidth={1.5} strokeDasharray="5 3" />
        {ticks.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{erc.dates[i].slice(5)}</text>
        ))}
      </svg>
      <div className="legend">
        <span><i style={{ borderColor: "#d9541e" }} />Energy release component (left)</span>
        <span><i style={{ borderColor: "#0b7fd6", borderTopStyle: "dashed" }} />Daily mean wind, m/s (right)</span>
      </div>
      {i0 >= 0 && (
        <p className="small" style={{ marginTop: 6 }} data-testid="fire-conditions-day">
          gridMET estimate for {erc.dates[i0]}: energy release component <strong>{erc.values[i0]}</strong>, burning index <strong>{g.bi?.values[i0] ?? "n/a"}</strong>, mean wind <strong>{vs.values[i0]} m/s</strong>, minimum relative humidity <strong>{rmin?.values[i0] ?? "n/a"}%</strong>, 100-hour fuel moisture <strong>{g.fm100?.values[i0] ?? "n/a"}%</strong>.
        </p>
      )}
    </div>
  );
}

function Evidence({ ev, hours }: { ev: FireEvent; hours: number }) {
  const selection = useStore((s) => s.selection);
  const st = useStore.getState();
  const src = ev.meta.sources;
  const agreement = useMemo(() => ev.progression.map((p) => ({ p, a: agreementAt(ev, p) })), [ev]);
  const plant = selection?.type === "plant" ? ev.infrastructure.powerPlants.find((p) => p.id === selection.id) : null;
  const d = ev.conditions.drought;
  const w = fireWindow(ev);
  const nowP = perimeterAt(ev, fireTime(w, hours));
  if (plant)
    return (
      <div className="section">
        <div className="kv" data-testid="fire-plant">
          <div className="row wrap">
            <strong style={{ color: "var(--navy)", fontSize: 14, flex: 1 }}>{plant.name} power plant</strong>
            <button className="btn sm" onClick={() => st.flyTo({ lat: plant.lat, lon: plant.lon, zoom: 11 })}>Fly to</button>
            <button className="btn ghost sm" onClick={() => st.select(null)}>Close</button>
          </div>
          <FactRow label="Nameplate capacity" value={plant.capacityMw != null ? `${plant.capacityMw.toLocaleString("en-US")} MW` : "Insufficient validated data"} evidence="OBSERVED" source={{ label: "EIA power plants map layer", url: String(src.plants?.landingPage ?? src.plants?.sourceUrl) }} />
          <FactRow label="Operator" value={plant.operator ?? "not stated"} evidence="OBSERVED" />
          <FactRow label="Primary source" value={`${plant.primarySource ?? "not stated"}${plant.technology ? ` · ${plant.technology}` : ""}`} evidence="OBSERVED" />
          <FactRow label="Distance from the mapped final perimeter" value={plant.inside ? "Inside the perimeter" : `${plant.kmFromPerimeter.toFixed(1)} km`} evidence="MODELED" note="Straight-line distance from the plant's point to the simplified perimeter. EIA's list is the current one, not the plants operating on the day of the fire." />
          <FactRow label="Damage or outage from this fire" value="Not estimated" evidence="RESEARCH HYPOTHESIS" note="Being inside or near a perimeter is not damage. Nothing retrieved for this build documents this plant's status during the fire." />
        </div>
      </div>
    );
  return (
    <>
      <div className="section" data-testid="fire-facts">
        <h4>What is on the record</h4>
        <div className="kv">
          <FactRow label="Size" value={`${acres(ev.perimeter.reportedAcres)} (${km2(ev.perimeter.reportedAcres)})`} evidence="OBSERVED" source={{ label: `${src.perimeter?.provider}`, url: String(src.perimeter?.landingPage) }} note={`Final perimeter${ev.perimeter.mapped.method ? `, mapped by ${ev.perimeter.mapped.method.toLowerCase()}` : ""}. The shape drawn here is simplified and covers ${acres(ev.perimeter.areaOfDisplayedShapeAcres)}.`} />
          <FactRow label="Start and containment on the record" value={<span data-testid="fire-start">{`${fmtUtcMinutes(Date.parse(ev.meta.start))}${ev.meta.contained ? ` to ${fmtUtc(Date.parse(ev.meta.contained), false)}` : ""}`}</span>} evidence="OBSERVED" source={{ label: ev.meta.admin.provider, url: String(ev.meta.admin.landingPage ?? ev.meta.admin.sourceUrl) }} note={ev.meta.admin.location ? `Origin: ${ev.meta.admin.location}.` : undefined} />
          {ev.facts.map((f) => (
            <FactRow key={f.label} label={f.label} value={f.value} evidence={f.evidence} source={{ label: f.source, url: f.url }} note={f.quote ? `"${f.quote}."${f.note ? ` ${f.note}` : ""}` : f.note} />
          ))}
        </div>
      </div>

      <div className="section">
        <div className="row">
          <h4 style={{ flex: 1 }}>Conditions at the point of origin</h4>
          <Badge kind="MODELED" />
        </div>
        <ConditionsChart ev={ev} />
        <p className="tiny muted" style={{ marginTop: 4 }}>
          gridMET: a 4-km gridded estimate, not a station reading; its wind comes from a 32-km analysis and cannot show terrain-driven gusts.{" "}
          {d ? `U.S. Drought Monitor, ${d.county}, map of ${d.mapDate}: ${d.percentNone === 100 ? "no part of the county in any drought class" : `${d.percentOfCountyAtOrAbove.D0}% of the county abnormally dry or worse, ${d.percentOfCountyAtOrAbove.D2}% in severe drought or worse`}.` : "Drought class: Insufficient validated data."}
        </p>
        <div className="stack" style={{ gap: 2, marginTop: 4 }}>
          <Src label="gridMET (Abatzoglou 2013)" url={String(src.gridmet?.landingPage)} />
          <Src label="U.S. Drought Monitor (NDMC, USDA, NOAA, NASA)" url={String(src.drought?.landingPage)} />
        </div>
      </div>

      <div className="section" data-testid="fire-agreement">
        <div className="row">
          <h4 style={{ flex: 1 }}>Do the two records agree?</h4>
          <Badge kind="OBSERVED" />
        </div>
        <p className="small" style={{ margin: "6px 0" }}>
          <strong>{ev.detections.withinOnePixelOfFinalPerimeter.toLocaleString("en-US")}</strong> of {ev.detections.count.toLocaleString("en-US")} satellite detections ({((ev.detections.withinOnePixelOfFinalPerimeter / Math.max(1, ev.detections.count)) * 100).toFixed(1)}%) lie within one pixel ({VIIRS_PIXEL_KM * 1000} m) of the final perimeter, which was mapped separately on the ground and from aircraft.
        </p>
        {agreement.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Perimeter mapped</th>
                <th className="n">Acres</th>
                <th className="n">Detections so far</th>
                <th className="n">Inside it</th>
              </tr>
            </thead>
            <tbody>
              {agreement.filter((_, i) => i % Math.ceil(agreement.length / 8) === 0 || i === agreement.length - 1).map(({ p, a }) => (
                <tr key={p.time} style={nowP?.time === p.time ? { background: "rgba(247,104,8,0.08)" } : undefined}>
                  <td>
                    {fmtUtcMinutes(Date.parse(p.time)).replace(` ${ev.meta.year}`, "")}
                    <div className="tiny muted">{p.method ?? "method not stated"}</div>
                  </td>
                  <td className="n">{p.acres != null ? Math.round(p.acres).toLocaleString("en-US") : "n/a"}</td>
                  <td className="n">{a.detections.toLocaleString("en-US")}</td>
                  <td className="n">{a.share === null ? "n/a" : `${(a.share * 100).toFixed(0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="tiny muted" style={{ marginTop: 6 }}>
          A check that two independent observations describe the same fire. It is not a test of a forecast: nothing here is forecast. Early perimeters lag the satellites because mapping takes hours; detections outside a perimeter can also be heat seen through smoke at a slant.
        </p>
      </div>

      {ev.meta.gaps.length > 0 && (
        <div className="section" data-testid="fire-gaps">
          <h4>Known gaps in this record</h4>
          <ul className="prose" style={{ margin: 0, paddingLeft: 18 }}>
            {ev.meta.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function Limits({ ev }: { ev: FireEvent }) {
  const rows = Object.entries(ev.meta.sources).filter((kv): kv is [string, FireSource] => !!kv[1]);
  return (
    <>
      <div className="section">
        <h4>{WILDFIRE_CARD.name}</h4>
        <p className="small"><strong>Status:</strong> {WILDFIRE_CARD.status}</p>
        <p className="small" style={{ marginTop: 6 }}><strong>What is computed</strong></p>
        <pre className="formula">{WILDFIRE_CARD.formula.join("\n")}</pre>
        <p className="small"><strong>Limits</strong></p>
        <ul className="prose" style={{ margin: 0, paddingLeft: 18 }}>{WILDFIRE_CARD.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
      <div className="section">
        <h4>Data in this view</h4>
        <table className="tbl">
          <tbody>
            {rows.map(([k, b]) => (
              <tr key={k}>
                <td>
                  <strong>{b.provider}</strong>
                  <div className="tiny muted">{b.dataset}</div>
                  <div className="tiny muted">Retrieved {String(b.retrievedAt ?? (b as { files?: { retrievedAt?: string }[] }).files?.[0]?.retrievedAt ?? "n/a").slice(0, 10)} · {b.license ?? "terms: see source"}</div>
                  {b.caveat && <div className="tiny muted">{b.caveat}</div>}
                  <Src label="Source" url={String(b.landingPage ?? b.sourceUrl ?? "#")} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

type Pane = "evidence" | "network" | "limits";

export function WildfireLab({ onMethods, pane }: { onMethods: () => void; pane: "controls" | "analysis" }) {
  const fire = useStore((s) => s.fire);
  const setFire = useStore((s) => s.setFire);
  const refineries = useStore((s) => s.refineries);
  const ports = useStore((s) => s.ports);
  const selection = useStore((s) => s.selection);
  const { data: index, error: indexError } = useFireIndex();
  const { data: ev, error } = useFire(fire.eventId);
  const [tab, setTab] = useState<Pane>("evidence");
  const st = useStore.getState();

  const w = useMemo(() => (ev ? fireWindow(ev) : null), [ev]);
  const total = w?.hours ?? 0;
  const hours = fire.hours < 0 ? total : Math.min(fire.hours, total);
  const ms = w ? fireTime(w, hours) : 0;
  const scr = useMemo(() => (ev ? fireScreen(ev, fire.bufferKm) : null), [ev, fire.bufferKm]);
  const graph = useMemo(() => (ev ? buildExposureGraph(fireExposureSet({ ev, bufferKm: fire.bufferKm, refineries, ports, datasetTons: ports.reduce((s, p) => s + (p.totalTons ?? 0), 0) })) : null), [ev, fire.bufferKm, refineries, ports]);
  const nowP = ev ? perimeterAt(ev, ms) : null;
  useEffect(() => {
    if (selection && selection.type === "plant") setTab("evidence");
    if (selection && (selection.type === "node" || selection.type === "edge")) setTab("network");
  }, [selection]);

  return (
    <>
      <FireTimeline ev={ev} hours={hours} total={total} />
      <aside className={`panel panel-left ${pane !== "controls" ? "mobile-hide" : ""}`} aria-label="Wildfire record controls" data-testid="fire-panel">
        <div className="panel-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>Observed record</h4>
            <h2>{ev?.meta.name ?? "Wildfire"}</h2>
          </div>
          <Badge kind="OBSERVED" />
        </div>
        <div className="panel-body">
          <div className="section stack">
            <HazardSelect id="fhaz" />
            <div className="field">
              <label htmlFor="fev">Fire</label>
              <select id="fev" value={fire.eventId} onChange={(e) => setFire({ eventId: e.target.value })} data-testid="fire-event">
                {(index?.events ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.place.split(",")[0]}, {e.year}
                  </option>
                ))}
              </select>
              <div className="tiny muted">Three fires with public perimeters and satellite records. Other fires: Insufficient validated data.</div>
            </div>
            {(error || indexError) && <div className="callout danger">Insufficient validated data: the wildfire record failed to load ({error ?? indexError}).</div>}
          </div>

          <div className="section" data-testid="fire-summary">
            <h4>Burned area on the record</h4>
            {ev ? (
              <>
                <div className="hero-num" data-testid="fire-acres">
                  {Math.round(ev.perimeter.reportedAcres).toLocaleString("en-US")}
                  <span className="hero-unit">acres inside the mapped final perimeter</span>
                </div>
                <div className="row wrap" style={{ marginTop: 6 }}>
                  <Badge kind="OBSERVED" />
                  <span className="small muted">{ev.meta.place} · {km2(ev.perimeter.reportedAcres)}</span>
                </div>
                <p className="small" style={{ marginTop: 8 }} data-testid="fire-now">
                  At {fmtUtc(ms)}: <strong>{detectionsBy(ev, ms).toLocaleString("en-US")}</strong> satellite detections so far
                  {ev.progression.length > 0 && (nowP ? <>; latest mapped perimeter <strong>{nowP.acres != null ? acres(nowP.acres) : "size n/a"}</strong> ({fmtUtcMinutes(Date.parse(nowP.time)).replace(` ${ev.meta.year}`, "")})</> : <>; no perimeter mapped yet</>)}.
                </p>
                <p className="tiny muted" style={{ marginTop: 6 }}>
                  Observed, not simulated. The dashed outline is the final perimeter; {ev.progression.length ? "the orange area is the perimeter mapped by the time shown; " : ""}dots are 375 m satellite pixels flagged as fire, not the fire's edge.
                </p>
              </>
            ) : (
              !error && <p className="muted">Loading the record…</p>
            )}
          </div>

          <div className="section stack" data-testid="fire-screen">
            <h4>Infrastructure near the fire</h4>
            <div className="field">
              <span className="small" style={{ fontWeight: 600, color: "var(--navy)" }}>List a site when it is</span>
              <div className="seg" role="group" aria-label="Distance from the final perimeter">
                {FIRE_BUFFERS_KM.map((k) => (
                  <button key={k} aria-pressed={fire.bufferKm === k} onClick={() => setFire({ bufferKm: k as FireView["bufferKm"] })} data-testid={`fire-buf-${k}`}>
                    {k === 0 ? "inside" : `${k} km`}
                  </button>
                ))}
              </div>
              <div className="tiny muted">Distance from the mapped final perimeter. An assumption you choose: distance is not damage, and no spread is simulated.</div>
            </div>
            {scr && ev && (
              <>
                <div className="grid2">
                  <div>
                    <div className="hero-num" style={{ fontSize: 24 }} data-testid="fire-mw">{Math.round(scr.plantMw).toLocaleString("en-US")}</div>
                    <div className="small muted">MW of generating capacity at {scr.plants.length} plant{scr.plants.length === 1 ? "" : "s"} {whereTxt(fire.bufferKm)}</div>
                  </div>
                  <div>
                    <div className="hero-num" style={{ fontSize: 24 }} data-testid="fire-tx">{scr.transmissionKmInside != null ? scr.transmissionKmInside.toFixed(0) : "n/a"}</div>
                    <div className="small muted">km of transmission line inside the perimeter{scr.gasKmInside > 0 ? `; ${scr.gasKmInside.toFixed(0)} km of gas pipeline` : ""}</div>
                  </div>
                </div>
                <div className="row wrap">
                  <Badge kind="MODELED" />
                  <span className="small muted">geometry on published asset layers; capacity near the fire, not capacity lost</span>
                </div>
                <div>
                  {scr.plants.slice(0, 5).map((p) => (
                    <button key={p.id} className="list-btn" onClick={() => st.select({ type: "plant", id: p.id })}>
                      <span className="grow">{p.name} <span className="muted">· {(p.operator ?? "").slice(0, 22)}</span></span>
                      <span className="num small">{p.capacityMw != null ? `${p.capacityMw.toLocaleString("en-US")} MW` : "n/a"}</span>
                      <span className="num tiny muted">{p.inside ? "inside" : `${p.kmFromPerimeter.toFixed(0)} km`}</span>
                    </button>
                  ))}
                  {scr.plants.length > 5 && <p className="tiny muted">and {scr.plants.length - 5} more plants.</p>}
                  {scr.plants.length === 0 && <p className="small muted">No power plant in EIA's layer is {whereTxt(fire.bufferKm)}.</p>}
                </div>
                <div data-testid="fire-refineries">
                  {scr.sites.length ? (
                    scr.sites.map((s) => (
                      <div key={s.id} className="small" style={{ padding: "3px 0" }}>
                        <strong>{s.kind === "refinery" ? `${niceName(s.name)} refinery` : s.name}</strong> <span className="muted">· {s.kind === "refinery" && s.capacityBpd != null ? `${fmtBpd(s.capacityBpd)} · ` : ""}{s.kmFromPerimeter.toFixed(1)} km from the perimeter</span>
                      </div>
                    ))
                  ) : (
                    <p className="small muted">No refinery or principal port is {whereTxt(fire.bufferKm)}{ev.infrastructure.refineriesAndPorts.length ? `; the nearest is ${ev.infrastructure.refineriesAndPorts[0].kmFromPerimeter.toFixed(0)} km away` : ""}.</p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="section stack">
            <h4>Map layers</h4>
            {([["showPerimeters", "Perimeters (NIFC)"], ["showDetections", "Satellite fire detections (NASA FIRMS)"], ["showInfra", "Power plants and gas pipelines (EIA)"]] as const).map(([k, label]) => (
              <div className="row" key={k}>
                <span className="small" style={{ flex: 1, color: "var(--navy)", fontWeight: 560 }}>{label}</span>
                <button type="button" role="switch" aria-checked={fire[k]} aria-label={label} className="switch" data-testid={`fire-${k}`} onClick={() => setFire({ [k]: !fire[k] })} />
              </div>
            ))}
            <div className="legend" data-testid="fire-legend">
              <span><i style={{ borderColor: "#ffb224", borderTopWidth: 6, width: 6 }} />detected in the last 12 h</span>
              <span><i style={{ borderColor: "#f76808", borderTopWidth: 6, width: 6 }} />12 to 48 h</span>
              <span><i style={{ borderColor: "#b42318", borderTopWidth: 6, width: 6 }} />older</span>
              <span><i style={{ borderColor: "#8b97a8", borderTopWidth: 6, width: 6 }} />other fires nearby</span>
              <span><i style={{ borderColor: "#6941c6", borderTopWidth: 6, width: 6 }} />plant in the screen</span>
            </div>
          </div>

          <div className="section stack">
            <div className="row wrap">
              <button className="btn ghost sm" onClick={onMethods}>Model card</button>
              <button className="btn ghost sm" onClick={() => setFire({ hours: -1, bufferKm: 0, playing: false })} data-testid="fire-reset">Reset view</button>
            </div>
            <p className="tiny muted">{WILDFIRE_CARD.status}</p>
          </div>
        </div>
      </aside>

      <aside className={`panel panel-right ${pane !== "analysis" ? "mobile-hide" : ""}`} aria-label="Wildfire evidence" data-testid="fire-analysis">
        <div className="panel-head">
          <div className="seg" style={{ flex: 1 }} role="tablist" aria-label="Evidence views">
            <button role="tab" aria-pressed={tab === "evidence"} aria-selected={tab === "evidence"} onClick={() => setTab("evidence")} data-testid="fire-tab-evidence">Evidence</button>
            <button role="tab" aria-pressed={tab === "network"} aria-selected={tab === "network"} onClick={() => setTab("network")} data-testid="fire-tab-network">Economic network</button>
            <button role="tab" aria-pressed={tab === "limits"} aria-selected={tab === "limits"} onClick={() => setTab("limits")} data-testid="fire-tab-limits">Limits &amp; data</button>
          </div>
        </div>
        <div className="panel-body">
          {!ev && !error && <p className="muted">Loading the record…</p>}
          {ev && tab === "evidence" && <Evidence ev={ev} hours={hours} />}
          {ev && graph && tab === "network" && (
            <div data-testid="fire-network">
              <div className="section">
                <div className="row">
                  <h4 style={{ flex: 1 }}>Physical proximity to the economy</h4>
                  <Badge kind="MODELED" />
                </div>
                <p className="tiny muted" style={{ margin: "4px 0 8px" }}>
                  Assets {whereTxt(fire.bufferKm)} and what depends on them. Solid links are documented or computed; dashed links are research hypotheses and carry no number. Proximity is not damage.
                </p>
                {graph.nodes.length > 1 ? <ImpactGraph graph={graph} /> : <p className="small muted">No power plant, transmission line, pipeline, refinery or port in the published layers is {whereTxt(fire.bufferKm)}. Widen the distance to see what is near.</p>}
                <div style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 10 }}>
                  <GraphDetail graph={graph} />
                </div>
              </div>
              <div className="section" data-testid="fire-claims">
                <h4>What is and is not claimed</h4>
                <table className="tbl">
                  <tbody>
                    <tr><td>Perimeters, satellite detections</td><td><Badge kind="OBSERVED" /></td><td className="small">NIFC and NASA records.</td></tr>
                    <tr><td>Assets inside or near the perimeter</td><td><Badge kind="MODELED" /></td><td className="small">Geometry on published layers with a distance you choose.</td></tr>
                    <tr><td>Causes, losses, structures destroyed</td><td><Badge kind="HISTORICAL" /></td><td className="small">Only where an official document says so, quoted in the Evidence tab.</td></tr>
                    <tr><td>Outages, prices, company or portfolio effects</td><td><Badge kind="RESEARCH HYPOTHESIS" /></td><td className="small">Not quantified. Utilities have no verified listing table here, so the portfolio screen shows Insufficient validated data for wildfire.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {ev && tab === "limits" && <Limits ev={ev} />}
        </div>
      </aside>
    </>
  );
}
