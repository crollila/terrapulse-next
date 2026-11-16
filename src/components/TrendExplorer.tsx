import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { useAnalysis, useCatalog, type Analysis } from "../data/trends";
import { analyzeTrend, deseasonalize, MIN_WINDOW_YEARS, TREND_METHOD, type MonthlyPoint, type TrendResult } from "../science/stats";
import { Badge, FactRow, Icon, Src } from "./ui";

function toPoints(a: Analysis): MonthlyPoint[] {
  return a.series.year.map((year, i) => ({ year, month: a.series.month[i], value: a.series.value[i] }));
}

const fmtP = (p: number) => (p < 0.0001 ? "< 0.0001" : p < 0.001 ? p.toFixed(4) : p.toFixed(3));
const signed = (v: number, d: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;

interface SeriesView {
  t: number[];
  anomaly: (number | null)[];
  annual: { year: number; mean: number }[];
  trend: TrendResult | null;
  color: string;
  label: string;
}

function annualMeans(year: number[], anomaly: (number | null)[]): { year: number; mean: number }[] {
  const by = new Map<number, number[]>();
  year.forEach((y, i) => {
    const v = anomaly[i];
    if (v !== null && Number.isFinite(v)) (by.get(y) ?? by.set(y, []).get(y)!).push(v);
  });
  return [...by.entries()].filter(([, v]) => v.length >= 6).map(([y, v]) => ({ year: y, mean: v.reduce((a, b) => a + b, 0) / v.length }));
}

function Chart({ main, compare, start, end, units, breakYear }: { main: SeriesView; compare: SeriesView | null; start: number; end: number; units: string; breakYear: number | null }) {
  const W = 520;
  const H = 230;
  const m = { l: 44, r: 10, t: 12, b: 24 };
  const t0 = Math.floor(main.t[0]);
  const t1 = Math.ceil(main.t[main.t.length - 1]);
  const vals = [...main.annual.map((a) => a.mean), ...(compare?.annual.map((a) => a.mean) ?? []), ...main.anomaly.filter((v): v is number => v !== null)];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.06 || 1;
  const x = (t: number) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (H - m.t - m.b);
  const monthly = main.t.map((t, i) => (main.anomaly[i] === null ? null : `${x(t).toFixed(1)},${y(main.anomaly[i] as number).toFixed(1)}`)).filter(Boolean).join(" ");
  const line = (s: SeriesView) => s.annual.map((a) => `${x(a.year + 0.5).toFixed(1)},${y(a.mean).toFixed(1)}`).join(" ");
  const trendLine = (s: SeriesView) => {
    if (!s.trend) return null;
    const f = (t: number) => s.trend!.intercept + (s.trend!.slopePerDecade / 10) * t;
    return <line x1={x(start)} y1={y(f(start))} x2={x(end + 1)} y2={y(f(end + 1))} stroke={s.color} strokeWidth={2.4} strokeLinecap="round" />;
  };
  const ticks: number[] = [];
  for (let yr = Math.ceil(t0 / 10) * 10; yr <= t1; yr += 10) ticks.push(yr);
  const yt = [lo, (lo + hi) / 2, hi];
  const dec = Math.abs(hi - lo) < 0.5 ? 3 : Math.abs(hi - lo) < 5 ? 2 : 1;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly anomalies and fitted trend for ${main.label}`}>
      <rect x={m.l} y={m.t} width={Math.max(0, x(start) - m.l)} height={H - m.t - m.b} fill="rgba(13,42,91,0.05)" />
      <rect x={x(end + 1)} y={m.t} width={Math.max(0, W - m.r - x(end + 1))} height={H - m.t - m.b} fill="rgba(13,42,91,0.05)" />
      {yt.map((v, i) => (
        <g key={i}>
          <line className="gridline" x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />
          <text x={m.l - 6} y={y(v) + 3} textAnchor="end">
            {v.toFixed(dec)}
          </text>
        </g>
      ))}
      <line className="axis" x1={m.l} x2={W - m.r} y1={y(0)} y2={y(0)} strokeDasharray="3 3" />
      {ticks.map((yr) => (
        <text key={yr} x={x(yr)} y={H - 7} textAnchor="middle">
          {yr}
        </text>
      ))}
      <polyline points={monthly} fill="none" stroke="rgba(29,107,255,0.22)" strokeWidth={0.8} />
      {compare && <polyline points={line(compare)} fill="none" stroke={compare.color} strokeWidth={1.6} strokeLinejoin="round" opacity={0.9} />}
      <polyline points={line(main)} fill="none" stroke={main.color} strokeWidth={1.8} strokeLinejoin="round" />
      {main.annual.map((a) => (
        <circle key={a.year} cx={x(a.year + 0.5)} cy={y(a.mean)} r={1.9} fill="#fff" stroke={main.color} strokeWidth={1.2} />
      ))}
      {compare && trendLine(compare)}
      {trendLine(main)}
      {breakYear && (
        <g>
          <line x1={x(breakYear)} x2={x(breakYear)} y1={m.t} y2={H - m.b} stroke="#b76a00" strokeWidth={1.4} strokeDasharray="4 3" />
          <text x={x(breakYear) + 4} y={m.t + 10} style={{ fill: "#b76a00", fontWeight: 700 }}>
            {breakYear}: documented data change
          </text>
        </g>
      )}
      <text x={6} y={m.t + 4} style={{ fontSize: 9 }}>
        anomaly, {units}
      </text>
    </svg>
  );
}

/** Every start/end-year window of 15+ years, from the published pipeline output. Click a cell to analyse that window. */
function WindowMap({ a, start, end, onPick }: { a: Analysis; start: number; end: number; onPick: (s: number, e: number) => void }) {
  const ws = a.windows ?? [];
  if (!ws.length) return null;
  const y0 = Math.min(...ws.map((w) => w.start));
  const y1 = Math.max(...ws.map((w) => w.end));
  const minLen = Math.min(...ws.map((w) => w.end - w.start));
  const nx = y1 - minLen - y0 + 1;
  const W = 520;
  const m = { l: 40, r: 8, t: 6, b: 22 };
  const cell = (W - m.l - m.r) / nx;
  const H = m.t + m.b + cell * nx;
  const maxAbs = Math.max(...ws.map((w) => Math.abs(w.slope_per_decade))) || 1;
  const x = (s: number) => m.l + (s - y0) * cell;
  const y = (e: number) => m.t + (y1 - e) * cell;
  const sum = a.windows_summary;
  const ticks = [y0, y0 + 10, y0 + 20, y0 + 30].filter((t) => t <= y1 - minLen);
  return (
    <div data-testid="window-map">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend for every start and end year">
        {ws.map((w) => {
          const up = w.slope_per_decade >= 0;
          const k = Math.min(1, Math.abs(w.slope_per_decade) / maxAbs);
          const sel = w.start === start && w.end === end;
          return (
            <rect
              key={`${w.start}-${w.end}`}
              x={x(w.start)}
              y={y(w.end)}
              width={cell + 0.3}
              height={cell + 0.3}
              fill={up ? "#1d6bff" : "#f76808"}
              opacity={(w.significant ? 0.35 : 0.08) + (w.significant ? 0.65 : 0.22) * k}
              stroke={sel ? "#0b1f3f" : "none"}
              strokeWidth={sel ? 1.6 : 0}
              style={{ cursor: "pointer" }}
              onClick={() => onPick(w.start, w.end)}
            >
              <title>{`${w.start}–${w.end}: ${w.slope_per_decade >= 0 ? "+" : "−"}${Math.abs(w.slope_per_decade).toFixed(3)} per decade, ${w.significant ? "significant" : "not significant"} (adjusted t-test)`}</title>
            </rect>
          );
        })}
        {ticks.map((t) => (
          <text key={t} x={x(t) + cell / 2} y={H - 8} textAnchor="middle">
            {t}
          </text>
        ))}
        <text x={m.l + (W - m.l - m.r) / 2} y={H - 0.5} textAnchor="middle" style={{ fontSize: 9 }}>
          start year
        </text>
        {[y1, y1 - 10, y1 - 20, y1 - 30].filter((t) => t >= y0 + minLen).map((t) => (
          <text key={t} x={m.l - 5} y={y(t) + cell / 2 + 3} textAnchor="end">
            {t}
          </text>
        ))}
        <text x={9} y={m.t + (H - m.t - m.b) / 2} textAnchor="middle" transform={`rotate(-90 9 ${m.t + (H - m.t - m.b) / 2})`} style={{ fontSize: 9 }}>
          end year
        </text>
      </svg>
      <div className="legend" style={{ marginTop: 4 }}>
        <span>
          <i style={{ borderColor: "#1d6bff" }} />
          rising
        </span>
        <span>
          <i style={{ borderColor: "#f76808" }} />
          falling
        </span>
        <span>Strong colour: significant. Faint: not significant. Click a cell to analyse that window.</span>
      </div>
      {sum && (
        <p className="small" style={{ marginTop: 6 }}>
          Of {sum.n_windows} windows of {sum.min_years}+ years, <strong>{(100 * sum.share_same_direction).toFixed(0)}%</strong> point the same way as the full record and{" "}
          <strong>{(100 * sum.share_significant_same_direction).toFixed(0)}%</strong> are significant in that direction; {(100 * sum.share_significant_opposite_direction).toFixed(0)}% are significant in the opposite direction.
          {sum.share_significant_opposite_direction > 0 ? " The answer depends on the dates chosen." : ""}
        </p>
      )}
      <p className="tiny muted">Published output of the team's Python pipeline. Windows overlap heavily and are not independent tests; cells are marked with the adjusted t-test alone.</p>
    </div>
  );
}

function Verdict({ r, units, dec }: { r: TrendResult; units: string; dec: number }) {
  const sig = r.significant;
  const partial = !sig && (r.olsSignificant || r.mkSignificant);
  return (
    <div className={`callout ${sig ? "info" : partial ? "warn" : ""}`} data-testid="trend-verdict">
      <div className="hero-num">
        {signed(r.slopePerDecade, dec)}
        <span className="hero-unit">{units} per decade</span>
      </div>
      <div className="small" style={{ marginTop: 4 }}>
        95% range {signed(r.ciLow, dec)} to {signed(r.ciHigh, dec)} · {r.startYear}–{r.endYear} · {r.nMonths} months
      </div>
      <div style={{ marginTop: 6, fontWeight: 600 }}>
        {sig ? `Statistically significant ${r.slopePerDecade > 0 ? "rise" : "fall"}: both tests give p < 0.05.` : partial ? "The two tests disagree. Treat this as not established." : "No significant trend detected in this window."}
      </div>
      {!sig && <div className="small">Not significant does not mean nothing changed; it means the change cannot be told apart from natural variability.{r.yearsNeeded ? ` A trend this size would need about ${Math.round(r.yearsNeeded)} years of data to detect.` : ""}</div>}
    </div>
  );
}

export function TrendExplorer() {
  const trend = useStore((s) => s.trend);
  const setTrend = useStore((s) => s.setTrend);
  const cat = useCatalog().data;
  const { data: a, error } = useAnalysis(trend.regionId, trend.variableId);
  const { data: b } = useAnalysis(trend.compareRegionId, trend.variableId);
  const [showMethod, setShowMethod] = useState(false);

  const rec = a ? ([a.series.year[0], a.series.year[a.series.year.length - 1]] as const) : null;
  const start = rec ? Math.max(rec[0], Math.min(trend.startYear, rec[1] - MIN_WINDOW_YEARS + 1)) : trend.startYear;
  const end = rec ? Math.min(rec[1], Math.max(trend.endYear, start + MIN_WINDOW_YEARS - 1)) : trend.endYear;

  const view = (an: Analysis | null, color: string): SeriesView | null => {
    if (!an) return null;
    const pts = toPoints(an);
    const y0 = an.series.year[0];
    const y1 = an.series.year[an.series.year.length - 1];
    const d = deseasonalize(pts, y0, y1);
    const s = Math.max(y0, start);
    const e = Math.min(y1, end);
    return { t: d.t, anomaly: d.anomaly, annual: annualMeans(d.year, d.anomaly), trend: analyzeTrend(pts, s, e), color, label: an.region.short_name };
  };
  const main = useMemo(() => view(a, "#1d6bff"), [a, start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const comp = useMemo(() => view(b, "#6e56cf"), [b, start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const full = useMemo(() => (a ? analyzeTrend(toPoints(a), a.trend.start, a.trend.end) : null), [a]);

  const v = a?.variable;
  const dec = v ? Math.max(v.decimals, 2) : 2;
  const isFull = !!a && start === a.trend.start && end === a.trend.end;
  const ki = a?.crosscheck?.known_issue as any;
  const r = main?.trend ?? null;
  const reproErr = a && full ? Math.abs(full.slopePerDecade - a.trend.ols.slope_per_decade) : null;

  return (
    <aside className="panel panel-right wide" aria-label="Trend explorer" data-testid="trend-explorer">
      <div className="panel-head">
        <h2>Trend explorer</h2>
        <Badge kind="HISTORICAL" />
        <button className="btn ghost sm icon-btn" aria-label="Close trend explorer" onClick={() => useStore.getState().setTrendOpen(false)}>
          {Icon.close}
        </button>
      </div>
      <div className="panel-body">
        <div className="section">
          <div className="grid2">
            <div className="field">
              <label htmlFor="tv">Earth-system variable</label>
              <select id="tv" value={trend.variableId} onChange={(e) => setTrend({ variableId: e.target.value, startYear: 1900, endYear: 2100 })} data-testid="trend-variable">
                {cat?.variables.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.units})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tr">Region</label>
              <select id="tr" value={trend.regionId} onChange={(e) => { setTrend({ regionId: e.target.value }); useStore.getState().select({ type: "region", id: e.target.value }); }} data-testid="trend-region">
                {cat?.regions.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            {rec && (
              <>
                <div className="field">
                  <div className="field-head">
                    <label htmlFor="ts">Start year</label>
                    <span className="field-val">{start}</span>
                  </div>
                  <input id="ts" type="range" min={rec[0]} max={rec[1] - MIN_WINDOW_YEARS + 1} step={1} value={start} style={{ ["--fill" as any]: `${((start - rec[0]) / Math.max(1, rec[1] - MIN_WINDOW_YEARS + 1 - rec[0])) * 100}%` }} onChange={(e) => setTrend({ startYear: Number(e.target.value), endYear: Math.max(end, Number(e.target.value) + MIN_WINDOW_YEARS - 1) })} data-testid="trend-start" />
                </div>
                <div className="field">
                  <div className="field-head">
                    <label htmlFor="te">End year</label>
                    <span className="field-val">{end}</span>
                  </div>
                  <input id="te" type="range" min={rec[0] + MIN_WINDOW_YEARS - 1} max={rec[1]} step={1} value={end} style={{ ["--fill" as any]: `${((end - rec[0] - MIN_WINDOW_YEARS + 1) / Math.max(1, rec[1] - rec[0] - MIN_WINDOW_YEARS + 1)) * 100}%` }} onChange={(e) => setTrend({ endYear: Number(e.target.value), startYear: Math.min(start, Number(e.target.value) - MIN_WINDOW_YEARS + 1) })} data-testid="trend-end" />
                </div>
              </>
            )}
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="tc">Compare with another region</label>
            <select id="tc" value={trend.compareRegionId ?? ""} onChange={(e) => setTrend({ compareRegionId: e.target.value || null })}>
              <option value="">No comparison</option>
              {cat?.regions.filter((x) => x.id !== trend.regionId).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            Windows shorter than {MIN_WINDOW_YEARS} years are not analysed. {v?.definition}
          </p>
        </div>

        {error && <div className="callout danger">Insufficient validated data: {error}</div>}
        {!a && !error && <p className="muted">Loading series…</p>}

        {a && main && v && (
          <>
            <div className="section">
              <Chart main={main} compare={comp} start={start} end={end} units={v.units} breakYear={ki?.break_year && trend.variableId === "PRECTOTCORR" ? ki.break_year : null} />
              <div className="legend" style={{ marginTop: 4 }}>
                <span>
                  <i style={{ borderColor: "#1d6bff" }} />
                  {main.label}: annual mean of monthly anomalies, with fitted trend
                </span>
                {comp && (
                  <span>
                    <i style={{ borderColor: "#6e56cf" }} />
                    {comp.label}
                  </span>
                )}
                <span>Faint line: monthly anomalies. Grey: outside the chosen window.</span>
              </div>
            </div>

            <div className="section stack">
              {r ? <Verdict r={r} units={v.units} dec={dec} /> : <div className="callout warn">Insufficient validated data for this window (too short or too few valid months).</div>}
              {comp?.trend && (
                <div className="callout">
                  <strong>{comp.label}:</strong> {signed(comp.trend.slopePerDecade, dec)} {v.units} per decade (95% range {signed(comp.trend.ciLow, dec)} to {signed(comp.trend.ciHigh, dec)}), {comp.trend.significant ? "significant in both tests" : "not significant in both tests"}.
                </div>
              )}
            </div>

            {r && (
              <div className="section">
                <h4>Is it statistically significant?</h4>
                <table className="tbl">
                  <tbody>
                    <tr>
                      <td>Adjusted t-test p-value (allows for month-to-month persistence)</td>
                      <td className="n">{fmtP(r.pValue)}</td>
                    </tr>
                    <tr>
                      <td>Mann–Kendall p-value (Hamed–Rao corrected)</td>
                      <td className="n">{fmtP(r.mkPValue)}</td>
                    </tr>
                    <tr>
                      <td className="muted">Naive p-value that ignores persistence, for contrast</td>
                      <td className="n muted">{fmtP(r.naivePValue)}</td>
                    </tr>
                    <tr>
                      <td>Sen's slope (robust rate)</td>
                      <td className="n">
                        {signed(r.senSlopePerDecade, dec)} / decade
                      </td>
                    </tr>
                    <tr>
                      <td>Lag-1 autocorrelation · effective sample size</td>
                      <td className="n">
                        {r.lag1.toFixed(2)} · {Math.round(r.nEffective)} of {r.nMonths}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="tiny muted" style={{ marginTop: 6 }}>
                  Null hypothesis: {TREND_METHOD.nullHypothesis} Statistical significance is not physical importance, and neither identifies a cause.
                </p>
              </div>
            )}

            {a.windows && a.windows.length > 0 && (
              <div className="section">
                <h4>Did you just pick good dates?</h4>
                <WindowMap a={a} start={start} end={end} onPick={(s, e) => setTrend({ startYear: s, endYear: e })} />
              </div>
            )}

            {a.crosscheck ? (
              <div className="section">
                <h4>Second opinion: {a.crosscheck.dataset.name}</h4>
                <div className={`callout ${a.crosscheck.code === "supported" ? "info" : "warn"}`}>
                  <strong>{a.crosscheck.label}.</strong> {a.crosscheck.text}
                </div>
                <p className="tiny muted" style={{ marginTop: 6 }}>
                  Computed by the team's pipeline for the full record {a.crosscheck.period[0]}–{a.crosscheck.period[1]}{isFull ? "" : "; it does not change with the window chosen above"}. {a.crosscheck.dataset.caveat}{" "}
                  <a href={a.crosscheck.dataset.url} target="_blank" rel="noopener noreferrer">
                    Dataset
                  </a>
                </p>
              </div>
            ) : (
              <div className="section">
                <h4>Second opinion</h4>
                <div className="callout warn">No independent dataset has been checked for this variable. The result describes one dataset only.</div>
              </div>
            )}

            {ki && (
              <div className="section" data-testid="known-issue">
                <h4>Data-quality investigation</h4>
                <div className="callout warn">
                  <strong>{ki.title}.</strong> {ki.text}
                </div>
                <div className="grid2" style={{ marginTop: 10 }}>
                  <FactRow label={`MERRA-2 minus ${ki.independent_dataset}, before ${ki.break_year}`} value={`${signed(ki.gap_before, 2)} mm/day`} evidence="OBSERVED" />
                  <FactRow label={`MERRA-2 minus ${ki.independent_dataset}, from ${ki.break_year}`} value={`${signed(ki.gap_after, 2)} mm/day`} evidence="OBSERVED" />
                  <FactRow label={`Fitted step in ${ki.break_year}`} value={`${signed(ki.step.value, 2)} mm/day`} evidence="MODELED" note={`95% range ${signed(ki.step.ci_low, 2)} to ${signed(ki.step.ci_high, 2)}; p ${fmtP(ki.step.p_value)}`} />
                  <FactRow label="Best-fitting break year" value={String(ki.best_fit_break_year)} evidence="MODELED" />
                </div>
                <p className="small" style={{ marginTop: 8 }}>
                  <strong>Earth intelligence must tell a change in the environment from a change in the measurement system.</strong> Try the window 2005–2025 and then 1981–2004 above to see the trend inside each period.
                </p>
                <div className="stack" style={{ marginTop: 6, gap: 2 }}>
                  {ki.sources.map((s: { label: string; url: string }) => (
                    <Src key={s.url} label={s.label} url={s.url} />
                  ))}
                  {ki.credit && <span className="src">{ki.credit}</span>}
                </div>
              </div>
            )}

            <div className="section">
              <h4>Data and provenance</h4>
              <div className="kv">
                <FactRow label="Dataset" value={a.provenance.source?.dataset ?? "n/a"} note={`${a.provenance.source?.kind ?? ""} Native grid ${a.provenance.source?.native_grid ?? "n/a"}.`} />
                <FactRow label="Record · completeness" value={`${a.first_month} to ${a.last_month} · ${a.quality.months_total - a.quality.months_missing} of ${a.quality.months_total} months`} note={`Region box ${a.region.bbox[1]}° to ${a.region.bbox[3]}° latitude, ${a.region.bbox[0]}° to ${a.region.bbox[2]}° longitude; area-weighted mean${a.quality.grid_cells ? ` of ${a.quality.grid_cells} grid cells` : ""}.`} />
                <FactRow label="Retrieved" value={String(a.provenance.retrieved_utc ?? "n/a").replace("T", " ").slice(0, 16) + " UTC"} />
                {reproErr !== null && full && (
                  <FactRow
                    label="Reproducibility check"
                    value={`Browser ${signed(full.slopePerDecade, 4)} vs published ${signed(a.trend.ols.slope_per_decade, 4)}`}
                    evidence="MODELED"
                    note={`Full-record slope recomputed in your browser against the team's Python pipeline (difference ${reproErr.toExponential(1)}; the published series is rounded to ${v.decimals + 1 > 4 ? 4 : 4} decimals).`}
                  />
                )}
                {a.provenance.source?.caveat && <div className="callout">{a.provenance.source.caveat}</div>}
                {a.provenance.request_url && <Src label="Exact NASA POWER request" url={a.provenance.request_url} />}
                <Src label="Original TerraPulse analysis and methodology" url="https://github.com/crollila/terrapulse" />
              </div>
            </div>

            <div className="section">
              <button className="btn sm" onClick={() => setShowMethod((s) => !s)} aria-expanded={showMethod}>
                {showMethod ? "Hide" : "Show"} method and limitations
              </button>
              {showMethod && (
                <div className="prose" style={{ marginTop: 8 }}>
                  <p>{TREND_METHOD.name}</p>
                  <h3>Persistence</h3>
                  <p>{TREND_METHOD.autocorrelation}</p>
                  <h3>Significance rule</h3>
                  <p>{TREND_METHOD.significanceRule}</p>
                  <h3>Limitations</h3>
                  <ul>
                    {TREND_METHOD.limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <h3>References</h3>
                  <ul>
                    {TREND_METHOD.references.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
