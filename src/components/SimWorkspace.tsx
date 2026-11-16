import { useEffect, useMemo, useState } from "react";
import { useStore } from "../state/store";
import { useScenario } from "../state/derived";
import { loadHarveyPrices, type HarveyPrices, type PriceSeries } from "../data/infrastructure";
import { parseHoldings, stressPortfolio } from "../sim/portfolio";
import { ImpactGraph } from "./ImpactGraph";
import { Inspector } from "./Inspector";
import { Badge, FactRow, Src } from "./ui";

type Pane = "network" | "markets" | "portfolio";

/* ---------- Historical record: Hurricane Harvey (2017) ---------- */

const LANDFALL = "2017-08-25";

function valueOnOrBefore(s: PriceSeries, date: string): [string, number] | null {
  let out: [string, number] | null = null;
  for (const p of s.points) if (p[0] <= date) out = p;
  return out;
}

function Spark({ s }: { s: PriceSeries }) {
  const W = 400;
  const H = 74;
  const m = { l: 4, r: 4, t: 6, b: 14 };
  const ts = s.points.map((p) => Date.parse(p[0]));
  const vs = s.points.map((p) => p[1]);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const x = (t: number) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo || 1)) * (H - m.t - m.b);
  const pts = s.points.map((p, i) => `${x(ts[i]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const lf = x(Date.parse(LANDFALL));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={s.name}>
      <line x1={lf} x2={lf} y1={m.t} y2={H - m.b} stroke="#d93a3f" strokeWidth={1.2} strokeDasharray="3 3" />
      <text x={lf + 4} y={m.t + 8} style={{ fill: "#d93a3f" }}>
        landfall 25 Aug
      </text>
      <polyline points={pts} fill="none" stroke="#1d6bff" strokeWidth={1.8} strokeLinejoin="round" />
      <text x={m.l} y={H - 2}>
        {s.points[0][0]}
      </text>
      <text x={W - m.r} y={H - 2} textAnchor="end">
        {s.points[s.points.length - 1][0]}
      </text>
    </svg>
  );
}

const SERIES_LABEL: Record<string, { label: string; dec: number; unit: string }> = {
  WGIRIP32: { label: "Gulf Coast refinery gross inputs", dec: 0, unit: "thousand b/d" },
  W_NA_YUP_R30_PER: { label: "Gulf Coast refinery utilization", dec: 1, unit: "%" },
  EER_EPMRU_PF4_RGC_DPG: { label: "Gulf Coast gasoline spot price", dec: 3, unit: "$/gal" },
  EMM_EPMR_PTE_NUS_DPG: { label: "U.S. regular retail gasoline", dec: 3, unit: "$/gal" },
  RWTC: { label: "WTI crude oil spot price", dec: 2, unit: "$/bbl" },
};

function Markets() {
  const [data, setData] = useState<HarveyPrices | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    loadHarveyPrices().then(setData, (e: Error) => setErr(e.message));
  }, []);
  const rows = useMemo(
    () =>
      (data?.series ?? []).map((s) => {
        const before = valueOnOrBefore(s, "2017-08-25");
        const after = s.points.filter((p) => p[0] > "2017-08-25" && p[0] <= "2017-09-15");
        const lo = after.reduce<[string, number] | null>((a, p) => (!a || p[1] < a[1] ? p : a), null);
        const hi = after.reduce<[string, number] | null>((a, p) => (!a || p[1] > a[1] ? p : a), null);
        return { s, before, lo, hi };
      }),
    [data],
  );
  return (
    <div data-testid="markets-pane">
      <div className="section">
        <div className="callout danger">
          <strong>Price impact of the hypothetical scenario: cannot be estimated.</strong> TerraPulse has no validated model linking wind exposure to outages or prices, so it shows no forecast. Below is what was actually recorded in one past storm.
        </div>
      </div>
      <div className="section">
        <div className="row">
          <h4 style={{ flex: 1 }}>Historical record · Hurricane Harvey, 2017</h4>
          <Badge kind="HISTORICAL" />
        </div>
        <div className="kv" style={{ marginTop: 8 }}>
          <FactRow label="Landfall" value="Category 4, 115 kt, near Rockport, Texas" evidence="HISTORICAL" source={{ label: "NHC Tropical Cyclone Report AL092017", url: "https://www.nhc.noaa.gov/data/tcr/AL092017_Harvey.pdf" }} note="0300 UTC 26 August 2017 (the evening of 25 August local time). The storm then stalled for four days and dropped more than 60 inches of rain over southeastern Texas." />
          <FactRow label="Refineries shut or shutting down, as of 30 Aug 2017" value="3,871,449 b/d of capacity" evidence="HISTORICAL" source={{ label: "U.S. DOE Harvey Event Report, Update #9", url: "https://www.energy.gov/documents/hurricane-harvey-event-summary-august-30-2017-morningpdf-0" }} note="39.9% of Gulf Coast and 20.9% of U.S. refining capacity, per public reports. Nameplate capacity of affected refineries, not measured lost output. Highest figure among the DOE updates read (#8–14, #22); a true peak is not established." />
          <FactRow label="Gulf Coast refinery inputs, week ending 1 Sep 2017" value="Down 3.2 million b/d (34%)" evidence="HISTORICAL" source={{ label: "EIA Today in Energy, 11 Sep 2017", url: "https://www.eia.gov/todayinenergy/detail.php?id=32852" }} note="Utilization fell from 96% to 63%; the largest drop since Hurricanes Gustav and Ike in 2008." />
          <FactRow label="U.S. average regular gasoline" value="+28 cents/gal in one week" evidence="HISTORICAL" source={{ label: "EIA Today in Energy, 11 Sep 2017", url: "https://www.eia.gov/todayinenergy/detail.php?id=32852" }} note="$2.40 on 28 August to $2.68 on 4 September 2017." />
        </div>
      </div>
      <div className="section">
        <h4>EIA series around the storm</h4>
        {err && <div className="callout warn">Insufficient validated data: {err}</div>}
        {rows.map(({ s, before, lo, hi }) => {
          const meta = SERIES_LABEL[s.id] ?? { label: s.name, dec: 2, unit: s.units };
          const isPrice = /\$/.test(meta.unit);
          const ext = isPrice ? hi : lo;
          return (
            <div key={s.id} style={{ marginBottom: 12 }}>
              <div className="row">
                <strong style={{ color: "var(--navy)", flex: 1 }}>{meta.label}</strong>
                <span className="tiny muted">{s.frequency.toLowerCase()}</span>
              </div>
              <Spark s={s} />
              {before && ext && (
                <div className="small num">
                  {before[1].toFixed(meta.dec)} {meta.unit} ({before[0]}) → {isPrice ? "high" : "low"} {ext[1].toFixed(meta.dec)} ({ext[0]}): <strong>{ext[1] - before[1] >= 0 ? "+" : "−"}{Math.abs(((ext[1] - before[1]) / before[1]) * 100).toFixed(1)}%</strong>
                </div>
              )}
              <Src label={`EIA series ${s.id}`} url={s.sourceUrl} />
            </div>
          );
        })}
        <p className="tiny muted">
          Changes are computed from the EIA values shown (last value on or before 25 August 2017 against the extreme of the next three weeks). They describe 2017 market conditions and co-occurring events. They are an association in one case, not proof of cause, and must not be read as the response to a different storm.
        </p>
      </div>
      <div className="section">
        <h4>Why this is not a forecast</h4>
        <ul className="prose" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Harvey made landfall as a Category 4 on the middle Texas coast near Rockport, then stalled and dropped more than 60 inches of rain on southeastern Texas (NHC). The scenario here is a wind-only screen of a different storm on a different part of the coast.</li>
          <li>Run backwards on Harvey itself, the wind-only screen finds only the Corpus Christi refineries: about a quarter to a third of the capacity DOE reported shut. It misses Houston and Beaumont–Port Arthur, where the cause was flooding (see Methods, hindcast).</li>
          <li>Refining capacity, inventories, exports and crude prices in 2017 differ from today.</li>
          <li>Share prices: Insufficient validated data. No redistributable equity price history has been verified, so none is shown.</li>
        </ul>
      </div>
    </div>
  );
}

/* ---------- Portfolio exposure screen ---------- */

const SAMPLE = "XOM 25\nMPC 15\nVLO 10\nXLE 20\nDAL 10\nAAPL 20";

function Portfolio() {
  const { companies, result } = useScenario();
  const [text, setText] = useState<string>(() => {
    try {
      return localStorage.getItem("terrapulse.portfolio") ?? SAMPLE;
    } catch {
      return SAMPLE;
    }
  });
  const [note, setNote] = useState<string | null>(null);
  const parsed = useMemo(() => parseHoldings(text), [text]);
  const res = useMemo(() => stressPortfolio(parsed.holdings, companies), [parsed, companies]);
  useEffect(() => {
    try {
      localStorage.setItem("terrapulse.portfolio", text);
    } catch {
      /* storage unavailable: the tool still works for this session */
    }
  }, [text]);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: "terrapulse-next", kind: "portfolio", version: 1, savedAt: new Date().toISOString(), holdings: parsed.holdings }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "terrapulse-portfolio.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importJson = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      const hs = Array.isArray(j.holdings) ? j.holdings : [];
      if (!hs.length) throw new Error("no holdings[] in file");
      setText(hs.map((h: any) => `${String(h.ticker).toUpperCase()} ${Number(h.weight)}${h.entryValue ? ` ${Number(h.entryValue)}` : ""}`).join("\n"));
      setNote("Portfolio imported.");
    } catch (e) {
      setNote(`Import failed: ${(e as Error).message}`);
    }
  };
  return (
    <div data-testid="portfolio-pane">
      <div className="section">
        <h4>Holdings</h4>
        <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Holdings, one per line: ticker and weight" spellCheck={false} data-testid="portfolio-input" />
        <div className="tiny muted">One holding per line: <code className="f">TICKER weight [entry value]</code>. Weights are normalised to 100%. Stored only in this browser.</div>
        <div className="row wrap" style={{ marginTop: 6 }}>
          <button className="btn sm" onClick={exportJson}>Export JSON</button>
          <label className="btn sm" style={{ cursor: "pointer" }}>
            Import JSON
            <input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
          <button className="btn ghost sm" onClick={() => setText(SAMPLE)}>Sample</button>
        </div>
        {[...parsed.errors, ...res.warnings, ...(note ? [note] : [])].map((m) => (
          <div key={m} className="tiny" style={{ color: "var(--amber)", marginTop: 4 }}>{m}</div>
        ))}
      </div>
      <div className="section">
        <div className="row">
          <h4 style={{ flex: 1 }}>Scenario exposure screen</h4>
          <Badge kind="MODELED" />
        </div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div>
            <div className="hero-num" data-testid="pf-direct">{pct(res.weightWithDirectExposure)}</div>
            <div className="small muted">of the portfolio is in companies that own refineries inside the footprint</div>
          </div>
          <div>
            <div className="hero-num" data-testid="pf-index">{pct(res.capacityWeightedExposure)}</div>
            <div className="small muted">capacity-weighted exposure index: Σ weight × share of each company's U.S. refining capacity in the footprint</div>
          </div>
        </div>
        <p className="tiny muted" style={{ marginTop: 6 }}>
          An index of physical exposure for the {result.params.exposureThresholdKt}-kt footprint, not a loss, return or price forecast. Funds: {pct(res.weightFunds)} (not quantified). No documented link: {pct(res.weightUnmapped)}.
        </p>
        <table className="tbl" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th>Holding</th>
              <th className="n">Weight</th>
              <th className="n">Exposed share</th>
            </tr>
          </thead>
          <tbody>
            {res.holdings.map((h) => (
              <tr key={h.ticker}>
                <td>
                  <strong>{h.ticker}</strong>
                  <div className="tiny muted">{h.explanation}</div>
                </td>
                <td className="n">{pct(h.weight)}</td>
                <td className="n">{h.exposureShare === null ? "n/a" : pct(h.exposureShare)}</td>
              </tr>
            ))}
            {!res.holdings.length && (
              <tr>
                <td colSpan={3} className="muted">Enter at least one holding.</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="tiny muted" style={{ marginTop: 8 }}>
          Method: ownership and capacity from the EIA Refinery Capacity Report; exposure from the hurricane wind-exposure screen. Only U.S. refining assets are covered. A holding with "n/a" has missing data, which is not the same as no exposure. Nothing here is investment advice.
        </p>
      </div>
    </div>
  );
}

export function SimWorkspace({ hiddenOnMobile }: { hiddenOnMobile: boolean }) {
  const [pane, setPane] = useState<Pane>("network");
  const selection = useStore((s) => s.selection);
  useEffect(() => {
    if (selection && (selection.type === "node" || selection.type === "edge")) setPane("network");
  }, [selection]);
  return (
    <aside className={`panel panel-right ${hiddenOnMobile ? "mobile-hide" : ""}`} aria-label="Impact analysis" data-testid="sim-workspace">
      <div className="panel-head">
        <div className="seg" style={{ flex: 1 }} role="tablist" aria-label="Analysis views">
          <button role="tab" aria-pressed={pane === "network"} aria-selected={pane === "network"} onClick={() => setPane("network")} data-testid="pane-network">Impact network</button>
          <button role="tab" aria-pressed={pane === "markets"} aria-selected={pane === "markets"} onClick={() => setPane("markets")} data-testid="pane-markets">Markets</button>
          <button role="tab" aria-pressed={pane === "portfolio"} aria-selected={pane === "portfolio"} onClick={() => setPane("portfolio")} data-testid="pane-portfolio">Portfolio</button>
        </div>
      </div>
      <div className="panel-body">
        {pane === "network" && (
          <>
            <ImpactGraph />
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 10 }}>
              <Inspector embedded />
            </div>
          </>
        )}
        {pane === "markets" && <Markets />}
        {pane === "portfolio" && <Portfolio />}
      </div>
    </aside>
  );
}
