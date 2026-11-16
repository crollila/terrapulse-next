import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { useAnalysis, type Analysis } from "../data/trends";
import { CASES, crosscheckPoints, fmtBounds, toPoints, useCrosscheck, type CaseId } from "../state/trendWindow";
import { analyzeTrend, deseasonalize, type MonthlyPoint } from "../science/stats";
import { SCENARIO_001 } from "../sim/hurricane";
import { Badge, FactRow, Icon, Src } from "./ui";

const signed = (v: number, d: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
const fmtP = (p: number) => (p < 0.0001 ? "< 0.0001" : p < 0.001 ? p.toFixed(4) : p.toFixed(3));
const C_MAIN = "#1d6bff";
const C_SECOND = "#6e56cf";

interface Annual {
  year: number;
  v: number;
}
/** Annual mean of monthly values, for years with at least 9 months. */
function annual(year: number[], vals: (number | null)[]): Annual[] {
  const by = new Map<number, number[]>();
  year.forEach((y, i) => {
    const v = vals[i];
    if (v !== null && Number.isFinite(v)) (by.get(y) ?? by.set(y, []).get(y)!).push(v);
  });
  return [...by.entries()].filter(([, v]) => v.length >= 9).map(([y, v]) => ({ year: y, v: v.reduce((a, b) => a + b, 0) / v.length }));
}

export interface CaseSeries {
  main: Annual[];
  second: Annual[];
  diff: Annual[];
  mainFit: { slope: number; intercept: number } | null;
  secondFit: { slope: number; intercept: number } | null;
  /** Mean of the difference before and from the break year (when one is given). */
  gapBefore: number | null;
  gapAfter: number | null;
}

/** Series for the two-record comparison. Pure, so tests can check it against the published numbers. */
export function buildCaseSeries(mainPts: MonthlyPoint[], secondPts: MonthlyPoint[], diffMode: "raw" | "anomaly", breakYear: number | null): CaseSeries {
  const y0 = mainPts[0].year;
  const y1 = mainPts[mainPts.length - 1].year;
  const dm = deseasonalize(mainPts, y0, y1);
  const sec = secondPts.filter((p) => p.year >= y0 && p.year <= y1);
  const ds = deseasonalize(sec, y0, y1);
  const key = (y: number, m: number) => y * 12 + m;
  const secMap = new Map<number, number>();
  const secSrc = diffMode === "raw" ? sec.map((p) => p.value) : ds.anomaly;
  sec.forEach((p, i) => {
    const v = secSrc[i];
    if (v !== null && Number.isFinite(v)) secMap.set(key(p.year, p.month), v);
  });
  const mainSrc = diffMode === "raw" ? mainPts.map((p) => p.value) : dm.anomaly;
  const diffVals = mainPts.map((p, i) => {
    const a = mainSrc[i];
    const b = secMap.get(key(p.year, p.month));
    return a !== null && Number.isFinite(a) && b !== undefined ? a - b : null;
  });
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const before = breakYear ? diffVals.filter((v, i): v is number => v !== null && mainPts[i].year < breakYear) : [];
  const after = breakYear ? diffVals.filter((v, i): v is number => v !== null && mainPts[i].year >= breakYear) : [];
  const fit = (pts: MonthlyPoint[]) => {
    const r = analyzeTrend(pts, y0, y1);
    return r ? { slope: r.slopePerDecade, intercept: r.intercept } : null;
  };
  return {
    main: annual(dm.year, dm.anomaly),
    second: annual(ds.year, ds.anomaly),
    diff: annual(mainPts.map((p) => p.year), diffVals),
    mainFit: fit(mainPts),
    secondFit: fit(sec),
    gapBefore: breakYear ? mean(before) : null,
    gapAfter: breakYear ? mean(after) : null,
  };
}

export function PairCharts({ s, units, mainName, secondName, breakYear, gaps, hover, setHover }: { s: CaseSeries; units: string; mainName: string; secondName: string; breakYear: number | null; gaps: { before: number; after: number } | null; hover: number | null; setHover: (y: number | null) => void }) {
  const W = 520;
  const m = { l: 44, r: 10, t: 14, b: 20 };
  const t0 = s.main[0].year;
  const t1 = s.main[s.main.length - 1].year + 1;
  const x = (t: number) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const scale = (vals: number[], H: number) => {
    const lo = Math.min(...vals, 0);
    const hi = Math.max(...vals, 0);
    const pad = (hi - lo) * 0.1 || 1;
    return (v: number) => m.t + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - m.t - m.b);
  };
  const H1 = 190;
  const H2 = 150;
  const y1 = scale([...s.main.map((a) => a.v), ...s.second.map((a) => a.v)], H1);
  const y2 = scale([...s.diff.map((a) => a.v), ...(gaps ? [gaps.before, gaps.after] : [])], H2);
  const line = (a: Annual[], y: (v: number) => number) => a.map((p) => `${x(p.year + 0.5).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const trend = (f: { slope: number; intercept: number } | null, color: string) =>
    f ? <line x1={x(t0)} x2={x(t1)} y1={y1(f.intercept + (f.slope / 10) * t0)} y2={y1(f.intercept + (f.slope / 10) * t1)} stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={0.9} /> : null;
  const ticks: number[] = [];
  for (let yr = Math.ceil(t0 / 10) * 10; yr < t1; yr += 10) ticks.push(yr);
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const t = t0 + (((e.clientX - b.left) / b.width) * W - m.l) / (W - m.l - m.r) * (t1 - t0);
    const yr = Math.floor(t);
    setHover(yr >= t0 && yr < t1 ? yr : null);
  };
  const cross = (H: number) => (hover !== null ? <line x1={x(hover + 0.5)} x2={x(hover + 0.5)} y1={m.t} y2={H - m.b} stroke="#0b1f3f" strokeWidth={1} opacity={0.55} /> : null);
  const brk = (H: number, label: boolean) =>
    breakYear ? (
      <g data-testid={label ? "breakpoint-2005" : undefined}>
        <rect x={x(breakYear) - 3} y={m.t} width={6} height={H - m.t - m.b} fill="rgba(183,106,0,0.22)" />
        <line x1={x(breakYear)} x2={x(breakYear)} y1={m.t} y2={H - m.b} stroke="#b76a00" strokeWidth={1.8} />
        {label && (
          <text x={x(breakYear) + 6} y={m.t + 9} style={{ fill: "#8a5200", fontWeight: 700, fontSize: 10.5 }}>
            {breakYear}: the records part
          </text>
        )}
      </g>
    ) : null;
  const at = (a: Annual[], yr: number) => a.find((p) => p.year === yr)?.v;
  return (
    <div data-testid="case-charts">
      <svg className="chart" viewBox={`0 0 ${W} ${H1}`} role="img" aria-label={`Annual anomalies, ${mainName} and ${secondName}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <line className="axis" x1={m.l} x2={W - m.r} y1={y1(0)} y2={y1(0)} strokeDasharray="3 3" />
        {brk(H1, true)}
        <polyline points={line(s.second, y1)} fill="none" stroke={C_SECOND} strokeWidth={1.7} strokeLinejoin="round" />
        <polyline points={line(s.main, y1)} fill="none" stroke={C_MAIN} strokeWidth={1.9} strokeLinejoin="round" />
        {trend(s.secondFit, C_SECOND)}
        {trend(s.mainFit, C_MAIN)}
        {cross(H1)}
        {ticks.map((yr) => (
          <text key={yr} x={x(yr)} y={H1 - 6} textAnchor="middle">
            {yr}
          </text>
        ))}
        <text x={4} y={10} style={{ fontSize: 9 }}>
          yearly anomaly, {units}
        </text>
      </svg>
      <svg className="chart" viewBox={`0 0 ${W} ${H2}`} role="img" aria-label={`Difference, ${mainName} minus ${secondName}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <line className="axis" x1={m.l} x2={W - m.r} y1={y2(0)} y2={y2(0)} strokeDasharray="3 3" />
        {brk(H2, false)}
        {s.diff.map((p) => (
          <rect key={p.year} x={x(p.year) + 1} width={Math.max(1, x(p.year + 1) - x(p.year) - 2)} y={Math.min(y2(0), y2(p.v))} height={Math.abs(y2(p.v) - y2(0))} fill={breakYear && p.year >= breakYear ? "rgba(183,106,0,0.62)" : "rgba(29,107,255,0.45)"} />
        ))}
        {gaps && breakYear && (
          <g>
            <line x1={x(t0)} x2={x(breakYear)} y1={y2(gaps.before)} y2={y2(gaps.before)} stroke="#0b1f3f" strokeWidth={1.8} />
            <line x1={x(breakYear)} x2={x(t1)} y1={y2(gaps.after)} y2={y2(gaps.after)} stroke="#0b1f3f" strokeWidth={1.8} />
            <text x={x(t0) + 4} y={y2(gaps.before) - 5} style={{ fill: "#0b1f3f", fontWeight: 700 }}>
              mean {signed(gaps.before, 2)}
            </text>
            <text x={x(t1) - 4} y={y2(gaps.after) + 12} textAnchor="end" style={{ fill: "#0b1f3f", fontWeight: 700 }}>
              mean {signed(gaps.after, 2)}
            </text>
          </g>
        )}
        {cross(H2)}
        {ticks.map((yr) => (
          <text key={yr} x={x(yr)} y={H2 - 6} textAnchor="middle">
            {yr}
          </text>
        ))}
        <text x={4} y={10} style={{ fontSize: 9 }}>
          {mainName} minus {secondName}, {units}
        </text>
      </svg>
      <div className="legend" style={{ marginTop: 2 }}>
        <span>
          <i style={{ borderColor: C_MAIN }} />
          {mainName}
        </span>
        <span>
          <i style={{ borderColor: C_SECOND }} />
          {secondName}
        </span>
        <span className="num" data-testid="case-readout">
          {hover !== null ? `${hover}: ${mainName} ${at(s.main, hover) !== undefined ? signed(at(s.main, hover)!, 2) : "n/a"}, ${secondName} ${at(s.second, hover) !== undefined ? signed(at(s.second, hover)!, 2) : "n/a"}, difference ${at(s.diff, hover) !== undefined ? signed(at(s.diff, hover)!, 2) : "n/a"}` : "Move over either chart to read a year in both."}
        </span>
      </div>
    </div>
  );
}

function CompareRow({ id, a }: { id: CaseId; a: Analysis | null }) {
  if (!a) return <td className="muted">Loading…</td>;
  const cc = a.crosscheck;
  const d = Math.max(a.variable.decimals, 2);
  const supported = cc?.code === "agrees";
  return (
    <td data-testid={`compare-${id}`}>
      <strong>{CASES[id].title}</strong>
      <div className="tiny muted">
        {a.variable.name}, {a.region.short_name}
      </div>
      <div className="small num" style={{ marginTop: 4 }}>
        {a.provenance.source?.short_name?.replace("NASA ", "").replace(" reanalysis", "") ?? "Primary"}: <strong>{signed(a.trend.ols.slope_per_decade, d)}</strong>
      </div>
      <div className="small num">
        {cc?.dataset.name}: <strong>{cc ? signed(cc.trend.slope_per_decade, d) : "n/a"}</strong>
      </div>
      <div className="tiny muted">{a.variable.units} per decade, 1981–2025</div>
      <div className="small" style={{ marginTop: 4, color: supported ? "var(--green)" : "var(--amber)", fontWeight: 650 }}>{cc?.label}</div>
      <div className="tiny muted">{cc?.known_issue ? "Documented data issue in 2005" : "No documented data issue found"}</div>
      <div className="tiny muted">{a.verdict.title}</div>
    </td>
  );
}

export function CaseStudy({ id }: { id: CaseId }) {
  const c = CASES[id];
  const { data: a, error } = useAnalysis(c.regionId, c.variableId);
  const { data: other } = useAnalysis(CASES[id === "amazon" ? "alaska" : "amazon"].regionId, CASES[id === "amazon" ? "alaska" : "amazon"].variableId);
  const { data: cf, error: cfError } = useCrosscheck(c.second);
  const [hover, setHover] = useState<number | null>(null);
  const st = useStore.getState();
  const cc = a?.crosscheck ?? null;
  const ki = cc?.known_issue as any;
  const breakYear: number | null = ki?.break_year ?? null;
  const series = useMemo(() => (a && cf ? buildCaseSeries(toPoints(a), crosscheckPoints(cf, c.regionId), c.diff, breakYear) : null), [a, cf, c.regionId, c.diff, breakYear]);
  const d = a ? Math.max(a.variable.decimals, 2) : 2;
  const mainName = a?.provenance.source?.short_name?.replace("NASA ", "").replace(" reanalysis", "") ?? "MERRA-2";
  const otherId: CaseId = id === "amazon" ? "alaska" : "amazon";
  const openHouston = () => {
    st.setSim({ ...SCENARIO_001 });
    st.setSimPos(0);
    st.setHazard("hurricane");
    st.setTab("sim");
  };

  return (
    <aside className="panel panel-right wide" aria-label={c.title} data-testid="case-study" data-case={id}>
      <div className="panel-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4>Featured investigation</h4>
          <h2 data-testid="case-title">{c.title}</h2>
        </div>
        <Badge kind="HISTORICAL" />
        <button className="btn ghost sm icon-btn" aria-label="Close the investigation" onClick={() => st.setCase(null)}>
          {Icon.close}
        </button>
      </div>
      <div className="panel-body">
        {(error || cfError) && <div className="callout danger">Insufficient validated data: {error ?? cfError}</div>}
        {a && cc && (
          <>
            <div className="section">
              <p className="tiny muted">
                {a.variable.name} · study box {fmtBounds(a.region.bbox)} ({a.region.name}) · 1981–2025
              </p>
              <div className="grid2" style={{ marginTop: 8 }} data-testid="case-numbers">
                <div>
                  <div className="hero-num" style={{ color: C_MAIN }}>
                    {signed(a.trend.ols.slope_per_decade, d)}
                  </div>
                  <div className="small">
                    <strong>{mainName}</strong>, {a.variable.units} per decade
                  </div>
                  <div className="tiny muted">
                    95% range {signed(a.trend.ols.ci_low, d)} to {signed(a.trend.ols.ci_high, d)}
                  </div>
                </div>
                <div>
                  <div className="hero-num" style={{ color: C_SECOND }}>
                    {signed(cc.trend.slope_per_decade, d)}
                  </div>
                  <div className="small">
                    <strong>{cc.dataset.name}</strong>, {a.variable.units} per decade
                  </div>
                  <div className="tiny muted">
                    95% range {signed(cc.trend.ci_low, d)} to {signed(cc.trend.ci_high, d)}
                  </div>
                </div>
              </div>
              <div className={`callout ${cc.code === "agrees" ? "info" : "warn"}`} style={{ marginTop: 10 }} data-testid="case-verdict">
                <strong>{cc.label}.</strong>{" "}
                {id === "amazon" ? (
                  <>Both records show rainfall declining in this box, so the <strong>direction is supported</strong>. The rates differ by about {(a.trend.ols.slope_per_decade / cc.trend.slope_per_decade).toFixed(1)} times and their ranges do not overlap, so the <strong>size is not independently confirmed</strong>.</>
                ) : (
                  <>Both records show significant warming and their ranges overlap. This is what a trend that holds up looks like: detected in one record and supported by another.</>
                )}
              </div>
              <p className="tiny muted" style={{ marginTop: 6 }}>
                Both trends are the team's published results for the full record 1981–2025. {cc.dataset.caveat}
              </p>
            </div>

            <div className="section">
              <h4>{id === "amazon" ? "Two records of the same rain" : "Two records of the same air"}</h4>
              {series ? <PairCharts s={series} units={a.variable.units} mainName={mainName} secondName={cc.dataset.name} breakYear={breakYear} gaps={ki ? { before: ki.gap_before, after: ki.gap_after } : null} hover={hover} setHover={setHover} /> : <p className="muted">Loading the second record…</p>}
              <p className="small" style={{ marginTop: 6 }}>
                {id === "amazon" ? (
                  <>Top: each record's yearly departure from its own average, with its fitted trend. Bottom: MERRA-2 minus GPCP. Until 2004 the two sit close together. <strong>From {breakYear} MERRA-2 runs about {Math.abs(ki.gap_after - ki.gap_before).toFixed(1)} mm/day lower</strong>, and stays there.</>
                ) : (
                  <>Top: each record's yearly departure from its own average, with its fitted trend. Bottom: the difference between them, which shows no lasting step.</>
                )}
              </p>
            </div>

            {ki && (
              <div className="section" data-testid="issue-2005">
                <h4>What happened in {ki.break_year}?</h4>
                <p className="small">
                  NASA's own evaluation of MERRA-2 rainfall (Reichle et al. 2017) documents its gauge-corrected rainfall dropping against GPCP across the Amazon from 2005, when the number of rain gauges behind the correction falls sharply. The team tested that on this box.
                </p>
                <details style={{ marginTop: 8 }}>
                  <summary className="btn sm" style={{ display: "inline-flex" }} data-testid="inspect-2005">
                    Inspect the 2005 data issue
                  </summary>
                  <div className="kv" style={{ marginTop: 10 }} data-testid="issue-details">
                    <div className="grid2">
                      <FactRow label={`MERRA-2 minus GPCP, 1981–${ki.break_year - 1}`} value={`${signed(ki.gap_before, 2)} mm/day`} evidence="OBSERVED" />
                      <FactRow label={`MERRA-2 minus GPCP, from ${ki.break_year}`} value={`${signed(ki.gap_after, 2)} mm/day`} evidence="OBSERVED" />
                      <FactRow label={`Fitted step in ${ki.break_year}`} value={`${signed(ki.step.value, 2)} mm/day`} evidence="MODELED" note={`95% range ${signed(ki.step.ci_low, 2)} to ${signed(ki.step.ci_high, 2)}; p ${fmtP(ki.step.p_value)}. A steady drift between the records was allowed and is not significant.`} />
                      <FactRow label="Best-fitting break year" value={String(ki.best_fit_break_year)} evidence="MODELED" note="Found by trying each candidate year." />
                    </div>
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Period</th>
                          <th className="n">MERRA-2</th>
                          <th className="n">GPCP</th>
                          <th>Ranges overlap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ki.periods.map((p: any) => (
                          <tr key={p.start}>
                            <td>
                              {p.start}–{p.end}
                            </td>
                            <td className="n">
                              {signed(p.main.slope_per_decade, 2)}
                              {p.main.significant ? "" : " (n.s.)"}
                            </td>
                            <td className="n">
                              {signed(p.independent.slope_per_decade, 2)}
                              {p.independent.significant ? "" : " (n.s.)"}
                            </td>
                            <td>{p.ranges_overlap ? "yes" : "no"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="tiny muted">Trends in mm/day per decade inside each period; n.s. = not significant. Within each period the two records agree. The disagreement is the step between the periods.</p>
                    <p className="tiny muted">Method: the difference between the two deseasonalised records is fitted with a step at the break year plus a linear drift, using the same persistence-adjusted test as the trends. Published output of the team's pipeline; the before and after means are also recomputed from the shipped series by this app's tests.</p>
                    <div className="stack" style={{ gap: 2 }}>
                      {ki.sources.map((s: { label: string; url: string }) => (
                        <Src key={s.url} label={s.label} url={s.url} />
                      ))}
                      <Src label="The team's validation review and methodology" url="https://github.com/crollila/terrapulse/blob/main/SCIENTIFIC_VALIDATION.md" />
                      {ki.credit && <span className="src">{ki.credit}</span>}
                    </div>
                  </div>
                </details>
              </div>
            )}

            <div className="section" data-testid="case-warning">
              <h4>{id === "amazon" ? "How sure can we be?" : "What this does and does not show"}</h4>
              {id === "amazon" ? (
                <div className="callout warn">
                  <strong>Detected is not validated.</strong> The −0.541 figure is statistically significant inside MERRA-2, yet much of it probably comes from how the dataset was built. Do not quote it as the rate at which rainfall is falling.
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    <li>This is one study box ({fmtBounds(a.region.bbox)}). It does not describe rainfall across the Amazon.</li>
                    <li>The data issue does not explain every change. GPCP, which is independent of it, also shows a decline, and both records fall after 2005.</li>
                    <li>No third rainfall record has been checked, and no cause is identified.</li>
                  </ul>
                </div>
              ) : (
                <div className="callout">
                  Agreement between two records is support, not proof: GISTEMP smooths over up to 1200 km, far coarser than this box. A significant trend says the series changed; it does not say why. MERRA-2 shows the faster rate ({signed(a.trend.ols.slope_per_decade, 2)} against {signed(cc.trend.slope_per_decade, 2)} °C per decade).
                </div>
              )}
            </div>

            <div className="section">
              <h4>Compare the two investigations</h4>
              <table className="tbl" data-testid="case-compare">
                <tbody>
                  <tr>
                    {id === "amazon" ? (
                      <>
                        <CompareRow id="amazon" a={a} />
                        <CompareRow id="alaska" a={other} />
                      </>
                    ) : (
                      <>
                        <CompareRow id="alaska" a={a} />
                        <CompareRow id="amazon" a={other} />
                      </>
                    )}
                  </tr>
                </tbody>
              </table>
              <p className="small" style={{ marginTop: 6 }}>Same method, same tests, two different answers to "should you believe it?". One trend is supported by a second record. The other needs further investigation before its size can be used.</p>
              <div className="row wrap" style={{ marginTop: 8 }}>
                <button className="btn primary sm" onClick={() => st.setCase(otherId)} data-testid="switch-case">
                  Switch to {CASES[otherId].title}
                </button>
                <button className="btn sm" onClick={() => st.setCase(null)} data-testid="case-to-detective">
                  Test other dates and regions
                </button>
                <button className="btn sm" onClick={openHouston} data-testid="case-to-simulator">
                  Next: hazards and the economy
                </button>
              </div>
            </div>

            <div className="section">
              <h4>Sources and method</h4>
              <div className="stack" style={{ gap: 3 }}>
                <span className="src">
                  {a.provenance.source?.dataset}. {a.provenance.source?.kind}
                </span>
                <span className="src">{cc.dataset.citation}</span>
                {cf && (
                  <span className="src">
                    Second record: {String(cf.meta.regional_mean ?? "regional mean")}; grid {String(cf.meta.grid ?? "n/a")}; retrieved {String(cf.meta.retrieved_utc ?? "").slice(0, 10)}. Values copied unchanged from the team's repository.
                  </span>
                )}
                <Src label="Methodology: trends, persistence correction, second opinions" url="https://github.com/crollila/terrapulse/blob/main/docs/METHODOLOGY.md" />
                {a.provenance.request_url && <Src label="Exact NASA POWER request for this series" url={a.provenance.request_url} />}
              </div>
              <p className="tiny muted" style={{ marginTop: 6 }}>Trend method: least squares on deseasonalised monthly values with an AR(1)-adjusted t-test, cross-checked with Sen's slope and a Hamed–Rao Mann–Kendall test. See Methods &amp; sources for limitations.</p>
            </div>
          </>
        )}
        {!a && !error && <p className="muted">Loading the investigation…</p>}
      </div>
    </aside>
  );
}
