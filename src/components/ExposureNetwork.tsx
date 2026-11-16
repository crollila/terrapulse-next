import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import type { RainRecord } from "../state/rainDerived";
import { buildExposureGraph, companyExposuresFrom, fmtBpd, type ImpactGraph as Graph } from "../sim/graph";
import { rainExposureSet } from "../sim/rainGraph";
import { ariFor } from "../sim/rainfall";
import { fmtUtc } from "../sim/rainRecord";
import { parseHoldings, stressPortfolio } from "../sim/portfolio";
import { loadHarveyPrices, type HarveyPrices } from "../data/infrastructure";
import type { DoeRecord } from "../data/doeRecord";
import { ImpactGraph } from "./ImpactGraph";
import { Badge, FactRow, Src } from "./ui";

const HOUR_MS = 3_600_000;
const SAMPLE = "XOM 25\nMPC 15\nVLO 10\nXLE 20\nDAL 10\nAAPL 20";
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Facts of the selected node or the meaning of the selected link, for a graph that is not the wind scenario's. */
function GraphDetail({ graph }: { graph: Graph }) {
  const selection = useStore((s) => s.selection);
  const st = useStore.getState();
  if (!selection || (selection.type !== "node" && selection.type !== "edge")) return <p className="muted small">Click a node to follow its chain, or a line to see what the link means and where it comes from.</p>;
  if (selection.type === "node") {
    const node = graph.nodes.find((n) => n.id === selection.id);
    if (!node) return <p className="muted small">That node is not part of the network at this date and threshold.</p>;
    return (
      <div className="kv" data-testid="rain-node-detail">
        <strong style={{ color: "var(--navy)", fontSize: 14 }}>{node.label}</strong>
        {node.sub && <span className="muted small">{node.sub}</span>}
        {node.facts.map((f, i) => (
          <FactRow key={i} label={f.label} value={f.value} evidence={f.evidence} source={f.source} note={f.note} />
        ))}
        {node.assetId && (
          <button className="btn sm" style={{ justifySelf: "start" }} onClick={() => st.select({ type: node.assetId!.startsWith("usace") ? "port" : "refinery", id: node.assetId! })}>
            Open this site's rainfall and flood evidence
          </button>
        )}
      </div>
    );
  }
  const e = graph.edges.find((x) => x.id === selection.id);
  if (!e) return null;
  const from = graph.nodes.find((n) => n.id === e.from);
  const to = graph.nodes.find((n) => n.id === e.to);
  return (
    <div className="kv" data-testid="rain-edge-detail">
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

/** DOE's shut capacity by report and EIA's weekly Gulf Coast refinery inputs on one time axis. */
function RecordedImpacts({ doe, prices, nowMs }: { doe: DoeRecord | null; prices: HarveyPrices | null; nowMs: number }) {
  const inputs = prices?.series.find((s) => s.id === "WGIRIP32");
  const t0 = Date.parse("2017-08-18T00:00:00Z");
  const t1 = Date.parse("2017-09-16T00:00:00Z");
  const W = 420;
  const H = 150;
  const m = { l: 34, r: 38, t: 10, b: 20 };
  const x = (t: number) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const shut = (doe?.reports ?? []).filter((r) => r.asOfUtc && r.shut.capacityBpd != null).map((r) => ({ t: Date.parse(r.asOfUtc!), v: r.shut.capacityBpd! / 1e6, n: r.report }));
  const weekly = (inputs?.points ?? []).map((p) => ({ t: Date.parse(`${p[0]}T00:00:00Z`), v: p[1] / 1000 })).filter((p) => p.t >= t0 && p.t <= t1);
  const yL = (v: number) => m.t + (1 - v / 4) * (H - m.t - m.b);
  const yR = (v: number) => m.t + (1 - (v - 5) / 5) * (H - m.t - m.b);
  if (!shut.length && !weekly.length) return <div className="callout warn">Insufficient validated data: the DOE and EIA records did not load.</div>;
  const step = shut.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${yL(p.v).toFixed(1)}${i < shut.length - 1 ? ` L${x(shut[i + 1].t).toFixed(1)},${yL(p.v).toFixed(1)}` : ""}`).join(" ");
  const days = [20, 25, 30].map((d) => Date.parse(`2017-08-${d}T00:00:00Z`)).concat([4, 9, 14].map((d) => Date.parse(`2017-09-${String(d).padStart(2, "0")}T00:00:00Z`)));
  return (
    <div data-testid="rain-recorded">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Refining capacity DOE counted as shut, and EIA weekly Gulf Coast refinery inputs">
        {[0, 1, 2, 3, 4].map((v) => (
          <g key={v}>
            <line className={v === 0 ? "axis" : "gridline"} x1={m.l} x2={W - m.r} y1={yL(v)} y2={yL(v)} />
            <text x={m.l - 5} y={yL(v) + 3} textAnchor="end">
              {v}
            </text>
            <text x={W - m.r + 5} y={yL(v) + 3} style={{ fill: "#6941c6" }}>
              {(5 + (v * 5) / 4).toFixed(1).replace(/\.0$/, "")}
            </text>
          </g>
        ))}
        {days.map((t) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor="middle">
            {new Date(t).getUTCDate()} {new Date(t).getUTCMonth() === 7 ? "Aug" : "Sep"}
          </text>
        ))}
        {nowMs >= t0 && nowMs <= t1 && <line x1={x(nowMs)} x2={x(nowMs)} y1={m.t} y2={H - m.b} stroke="#1d6bff" strokeWidth={1} strokeDasharray="3 3" />}
        {step && <path d={step} fill="none" stroke="#0b1f3f" strokeWidth={1.8} />}
        {shut.map((p) => (
          <circle key={p.n} cx={x(p.t)} cy={yL(p.v)} r={2.2} fill="#0b1f3f">
            <title>{`DOE Update #${p.n}: ${p.v.toFixed(2)} million b/d shut`}</title>
          </circle>
        ))}
        {weekly.length > 1 && <polyline points={weekly.map((p) => `${x(p.t).toFixed(1)},${yR(p.v).toFixed(1)}`).join(" ")} fill="none" stroke="#6941c6" strokeWidth={1.6} strokeDasharray="5 3" />}
        {weekly.map((p) => (
          <circle key={p.t} cx={x(p.t)} cy={yR(p.v)} r={2.6} fill="#fff" stroke="#6941c6" strokeWidth={1.5}>
            <title>{`Week ending ${new Date(p.t).toISOString().slice(0, 10)}: ${p.v.toFixed(2)} million b/d`}</title>
          </circle>
        ))}
      </svg>
      <div className="legend">
        <span>
          <i style={{ borderColor: "#0b1f3f" }} />
          DOE: capacity counted as shut (left, million b/d)
        </span>
        <span>
          <i style={{ borderColor: "#6941c6", borderTopStyle: "dashed" }} />
          EIA: Gulf Coast refinery inputs, weekly (right)
        </span>
      </div>
      <p className="tiny muted" style={{ marginTop: 4 }}>
        Two records of what happened. DOE's figure is the nameplate capacity of refineries reported shut; EIA's is measured crude input for the week ending on each date. The dashed blue line is the date on the timeline.
      </p>
      <div className="stack" style={{ gap: 2, marginTop: 4 }}>
        {doe && <Src label="U.S. DOE Hurricane Harvey event reports, Updates #1 to #22" url={doe.meta.landingPage} />}
        {inputs && <Src label="EIA series WGIRIP32, weekly Gulf Coast (PADD 3) gross inputs to refineries" url={inputs.sourceUrl} />}
      </div>
    </div>
  );
}

export function ExposureNetwork({ rec, doe }: { rec: RainRecord; doe: DoeRecord | null }) {
  const rain = useStore((s) => s.rain);
  const refineries = useStore((s) => s.refineries);
  const ports = useStore((s) => s.ports);
  const [prices, setPrices] = useState<HarveyPrices | null>(null);
  const [text, setText] = useState<string>(() => {
    try {
      return localStorage.getItem("terrapulse.portfolio") ?? SAMPLE;
    } catch {
      return SAMPLE;
    }
  });
  useEffect(() => {
    loadHarveyPrices().then(setPrices, () => setPrices(null));
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("terrapulse.portfolio", text);
    } catch {
      /* storage unavailable: the screen still works for this session */
    }
  }, [text]);

  const through = rec.count === 0 ? "before any rainfall day is complete" : `through ${fmtUtc(rec.window.startMs + rec.count * 24 * HOUR_MS)}`;
  const set = useMemo(
    () => rainExposureSet({ exposures: rec.toDate, assets: rec.data.assets.assets, refineries: rec.refineriesInDomain, ports: rec.portsInDomain, allRefineries: refineries, datasetTons: ports.reduce((s, p) => s + (p.totalTons ?? 0), 0), ariYears: rain.ariYears, reading: rain.reading, through }),
    [rec, refineries, ports, rain.ariYears, rain.reading, through],
  );
  const graph = useMemo(() => buildExposureGraph(set), [set]);
  const companies = useMemo(
    () =>
      companyExposuresFrom(
        refineries,
        rec.refineriesInDomain.filter((r) => (ariFor(rec.byId.get(r.id)!, rain.reading) ?? -1) >= rain.ariYears),
      ),
    [refineries, rec, rain.ariYears, rain.reading],
  );
  const parsed = useMemo(() => parseHoldings(text), [text]);
  const pf = useMemo(() => stressPortfolio(parsed.holdings, companies), [parsed, companies]);

  return (
    <div data-testid="rain-network">
      <div className="section">
        <div className="row">
          <h4 style={{ flex: 1 }}>1 · Physical exposure to the economy</h4>
          <Badge kind="MODELED" />
        </div>
        <p className="tiny muted" style={{ margin: "4px 0 8px" }}>
          Sites whose observed rainfall {through} reached NOAA's {rain.ariYears.toLocaleString("en-US")}-year depth, and what depends on them. Solid links are documented or computed; dashed links are research hypotheses and carry no number.
        </p>
        {set.refineries.length + set.ports.length === 0 ? <p className="small muted">No refinery or port is in the screen at this date and threshold. Move the timeline forward or lower the threshold.</p> : <ImpactGraph graph={graph} />}
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 10 }}>
          <GraphDetail graph={graph} />
        </div>
      </div>

      <div className="section" data-testid="rain-operators">
        <div className="row">
          <h4 style={{ flex: 1 }}>Operators: share of U.S. refining capacity in the screen</h4>
          <Badge kind="MODELED" />
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Owner (EIA)</th>
              <th className="n">In screen</th>
              <th className="n">Of its U.S. capacity</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.corporation}>
                <td>
                  <strong>{c.displayName}</strong>
                  {c.ticker ? ` (${c.ticker})` : ""}
                  <div className="tiny muted">{c.ticker ? "U.S.-listed" : c.listingStatus} · {c.refineryIds.length} refiner{c.refineryIds.length === 1 ? "y" : "ies"}</div>
                </td>
                <td className="n">{fmtBpd(c.exposedBpd).replace(" b/d", "")}</td>
                <td className="n">{c.share != null ? pct(c.share) : "n/a"}</td>
              </tr>
            ))}
            {!companies.length && (
              <tr>
                <td colSpan={3} className="muted">No refinery is in the screen at this date and threshold.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          Ownership and capacity from the EIA Refinery Capacity Report as of 1 January 2026, so this is today's ownership set against 2017 rainfall: a way to read exposure, not a statement about who owned what in 2017. Refining outside the U.S. and other business lines are not counted.
        </p>
      </div>

      <div className="section" data-testid="rain-portfolio">
        <div className="row">
          <h4 style={{ flex: 1 }}>Portfolio exposure screen</h4>
          <Badge kind="MODELED" />
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Holdings, one per line: ticker and weight" spellCheck={false} data-testid="rain-portfolio-input" style={{ minHeight: 64 }} />
        <div className="grid2" style={{ marginTop: 8 }}>
          <div>
            <div className="hero-num" data-testid="rain-pf-direct">{pct(pf.weightWithDirectExposure)}</div>
            <div className="small muted">of the portfolio is in companies that own refineries in the rainfall screen</div>
          </div>
          <div>
            <div className="hero-num" data-testid="rain-pf-index">{pct(pf.capacityWeightedExposure)}</div>
            <div className="small muted">capacity-weighted index: Σ weight × share of each company's U.S. refining capacity in the screen</div>
          </div>
        </div>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          The same holdings and method as the wind scenario's portfolio screen. An index of physical exposure to rare rainfall, not a loss, return or price forecast. Funds: {pct(pf.weightFunds)} (not quantified). No documented link: {pct(pf.weightUnmapped)}. Nothing here is investment advice.
        </p>
      </div>

      <div className="section">
        <div className="row">
          <h4 style={{ flex: 1 }}>2 · What was recorded</h4>
          <Badge kind="HISTORICAL" />
        </div>
        <RecordedImpacts doe={doe} prices={prices} nowMs={rec.ms} />
      </div>

      <div className="section" data-testid="rain-layers-of-evidence">
        <h4>3 · What is and is not claimed</h4>
        <table className="tbl">
          <tbody>
            <tr>
              <td>Rainfall, high-water marks, storm track</td>
              <td><Badge kind="OBSERVED" /></td>
              <td className="small">NOAA, NASA and USGS records.</td>
            </tr>
            <tr>
              <td>Sites in the screen, capacity and owner shares</td>
              <td><Badge kind="MODELED" /></td>
              <td className="small">Arithmetic on those records with a threshold you choose.</td>
            </tr>
            <tr>
              <td>Refineries shut, inputs, prices in 2017</td>
              <td><Badge kind="HISTORICAL" /></td>
              <td className="small">DOE and EIA figures, shown as recorded. Membership of DOE's count is reconstructed.</td>
            </tr>
            <tr>
              <td>Rainfall causing a given outage, price or return</td>
              <td><Badge kind="RESEARCH HYPOTHESIS" /></td>
              <td className="small">Not quantified. Cannot be estimated from this evidence.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
