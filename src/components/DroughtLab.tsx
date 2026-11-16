import { useEffect, useMemo } from "react";
import { useStore } from "../state/store";
import { useAnalysis, useCatalog, type Analysis } from "../data/trends";
import { DROUGHT_CARD, DROUGHT_THRESHOLDS, coOccurringResponse, droughtClass, episodes, hypotheticalDeficit, monthlyZ, standardisedIndex, type MonthlyValue } from "../sim/drought";
import { Badge, FactRow, Slider, Src } from "./ui";
import { HazardSelect } from "./HazardSelect";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const toSeries = (a: Analysis | null): MonthlyValue[] => (a ? a.series.year.map((year, i) => ({ year, month: a.series.month[i], value: a.series.value[i] })) : []);
const CLASS_LABEL = { none: "not in drought", moderate: "moderate drought", severe: "severe drought", extreme: "extreme drought" } as const;
const CLASS_COLOR = { none: "#64728a", moderate: "#b76a00", severe: "#d9541e", extreme: "#b42318" } as const;
const sgn = (v: number, d = 2) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;

function IndexChart({ series, index, whatIf, k }: { series: MonthlyValue[]; index: (number | null)[]; whatIf: number | null; k: number }) {
  const W = 420;
  const H = 190;
  const m = { l: 30, r: 8, t: 8, b: 20 };
  const pts = series.map((s, i) => ({ t: s.year + (s.month - 0.5) / 12, z: index[i] })).filter((p): p is { t: number; z: number } => p.z !== null);
  if (pts.length < 2) return null;
  const t0 = Math.floor(pts[0].t);
  const t1 = Math.ceil(pts[pts.length - 1].t);
  const lo = -2.6;
  const hi = 2.6;
  const x = (t: number) => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (z: number) => m.t + (1 - (Math.max(lo, Math.min(hi, z)) - lo) / (hi - lo)) * (H - m.t - m.b);
  const line = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.z).toFixed(1)}`).join(" ");
  const dry = `M${x(pts[0].t).toFixed(1)},${y(DROUGHT_THRESHOLDS.moderate)} ` + pts.map((p) => `L${x(p.t).toFixed(1)},${y(Math.min(p.z, DROUGHT_THRESHOLDS.moderate)).toFixed(1)}`).join(" ") + ` L${x(pts[pts.length - 1].t).toFixed(1)},${y(DROUGHT_THRESHOLDS.moderate)} Z`;
  const ticks: number[] = [];
  for (let yr = Math.ceil(t0 / 10) * 10; yr <= t1; yr += 10) ticks.push(yr);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${k}-month standardised precipitation index over the record`}>
      {[2, 1, 0, -1, -1.5, -2].map((v) => (
        <g key={v}>
          <line className={v === 0 ? "axis" : "gridline"} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} strokeDasharray={v < 0 ? "3 3" : undefined} stroke={v <= -1 ? "rgba(183,106,0,0.45)" : undefined} />
          <text x={m.l - 5} y={y(v) + 3} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {ticks.map((yr) => (
        <text key={yr} x={x(yr)} y={H - 5} textAnchor="middle">
          {yr}
        </text>
      ))}
      <path d={dry} fill="rgba(217,84,30,0.28)" />
      <polyline points={line} fill="none" stroke="#1d6bff" strokeWidth={1.2} strokeLinejoin="round" />
      {whatIf !== null && (
        <g>
          <line x1={m.l} x2={W - m.r} y1={y(whatIf)} y2={y(whatIf)} stroke="#6941c6" strokeWidth={1.6} />
          <text x={W - m.r - 2} y={y(whatIf) - 4} textAnchor="end" style={{ fill: "#6941c6", fontWeight: 700 }}>
            what-if {sgn(whatIf)}
          </text>
        </g>
      )}
    </svg>
  );
}

export function DroughtLab({ onMethods, pane }: { onMethods: () => void; pane: "controls" | "analysis" }) {
  const d = useStore((s) => s.drought);
  const setDrought = useStore((s) => s.setDrought);
  const cat = useCatalog().data;
  const { data: pa, error } = useAnalysis(d.regionId, "PRECTOTCORR");
  const { data: sa } = useAnalysis(d.regionId, "GWETROOT");
  const { data: na } = useAnalysis(d.regionId, "NDVI");

  const region = cat?.regions.find((r) => r.id === d.regionId);
  useEffect(() => {
    if (!region) return;
    const [w, s, e, n] = region.bbox;
    useStore.getState().flyTo({ lon: (w + e) / 2, lat: (s + n) / 2, zoom: 3.6 });
  }, [region]);

  const calc = useMemo(() => {
    const p = toSeries(pa);
    if (!p.length) return null;
    const si = standardisedIndex(p, d.k);
    const hyp = hypotheticalDeficit(p, d.k, d.endMonth, d.fraction);
    const eps = episodes(p, si.index, DROUGHT_THRESHOLDS.moderate, 3).sort((a, b) => b.months - a.months || a.peak - b.peak);
    const level = hyp ? (hyp.index ?? DROUGHT_THRESHOLDS.severe) : DROUGHT_THRESHOLDS.moderate;
    const soil = toSeries(sa);
    const ndvi = toSeries(na);
    return {
      p,
      si,
      hyp,
      eps,
      level,
      soil: soil.length ? coOccurringResponse(p, si.index, soil, monthlyZ(soil), level) : null,
      ndvi: ndvi.length ? coOccurringResponse(p, si.index, ndvi, monthlyZ(ndvi), level) : null,
      dryMonths: si.index.filter((z) => z !== null && z <= DROUGHT_THRESHOLDS.moderate).length,
      months: si.index.filter((z) => z !== null).length,
    };
  }, [pa, sa, na, d.k, d.endMonth, d.fraction]);

  const ki = pa?.crosscheck?.known_issue;
  const h = calc?.hyp ?? null;
  const cls = h?.cls ?? "none";
  const startMonth = MONTHS[(d.endMonth - d.k + 120) % 12];
  const st = useStore.getState();

  return (
    <>
      <aside className={`panel panel-left ${pane !== "controls" ? "mobile-hide" : ""}`} aria-label="Drought scenario controls" data-testid="drought-panel">
        <div className="panel-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>What-if</h4>
            <h2>Regional drought</h2>
          </div>
          <Badge kind="HYPOTHETICAL" />
        </div>
        <div className="panel-body">
          <div className="section stack">
            <HazardSelect id="dhaz" />
            <div className="field">
              <label htmlFor="dreg">Region</label>
              <select id="dreg" value={d.regionId} onChange={(e) => setDrought({ regionId: e.target.value })} data-testid="drought-region">
                {cat?.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <div className="tiny muted">The eight region boxes with NASA series in this app. Other places: Insufficient validated data.</div>
            </div>
            <div className="field">
              <span className="small" style={{ fontWeight: 600, color: "var(--navy)" }}>Duration (accumulation period)</span>
              <div className="seg" role="group" aria-label="Accumulation period">
                {[3, 6, 12].map((k) => (
                  <button key={k} aria-pressed={d.k === k} onClick={() => setDrought({ k })} data-testid={`dk-${k}`}>
                    {k} months
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="dend">Period ends in</label>
              <select id="dend" value={d.endMonth} onChange={(e) => setDrought({ endMonth: Number(e.target.value) })}>
                {MONTHS.map((mn, i) => (
                  <option key={mn} value={i + 1}>
                    {mn}
                  </option>
                ))}
              </select>
              <div className="tiny muted">
                The what-if covers {d.k} months, {startMonth} to {MONTHS[d.endMonth - 1]}.
              </div>
            </div>
            <Slider label="Rainfall in that period (severity)" unit="% of normal" value={Math.round(d.fraction * 100)} min={10} max={120} step={1} onChange={(v) => setDrought({ fraction: v / 100 })} hint="Every month held at this share of its own long-term average." />
          </div>

          <div className="section" data-testid="drought-result">
            <h4>What-if result</h4>
            {error && <div className="callout danger">Insufficient validated data: {error}</div>}
            {h ? (
              <>
                <div className="hero-num" style={{ color: CLASS_COLOR[cls] }} data-testid="drought-index">
                  {h.index !== null ? sgn(h.index) : `below ${sgn(h.recordFloor)}`}
                  <span className="hero-unit">{d.k}-month precipitation index</span>
                </div>
                <div className="row wrap" style={{ marginTop: 6 }}>
                  <Badge kind="MODELED" />
                  <strong style={{ color: CLASS_COLOR[cls] }} data-testid="drought-class">
                    {h.beyondRecord ? "drier than any year in the record" : CLASS_LABEL[cls]}
                  </strong>
                </div>
                <p className="small" style={{ marginTop: 6 }}>
                  {h.value.toFixed(2)} mm/day against a normal of {h.normal.toFixed(2)} mm/day.{" "}
                  {h.beyondRecord ? (
                    <>
                      None of the {h.nYears} years in the record was this dry in these months. The index cannot be extrapolated beyond the record, so no rarity or return period is given: <em>Insufficient validated data</em>.
                    </>
                  ) : (
                    <>
                      <strong>
                        {h.yearsAtOrBelow} of {h.nYears}
                      </strong>{" "}
                      years in the record were this dry or drier in these months.
                    </>
                  )}
                </p>
              </>
            ) : (
              !error && <p className="muted">Loading series…</p>
            )}
            {ki && (
              <div className="callout warn" style={{ marginTop: 8 }} data-testid="drought-known-issue">
                <strong>{ki.title}.</strong> MERRA-2 rainfall in this box drops against an independent record from 2005 for a documented data reason, so this index is biased dry after 2005. Read dry episodes here with caution.
              </div>
            )}
          </div>

          <div className="section stack">
            <div className="row wrap">
              <button className="btn ghost sm" onClick={onMethods}>
                Model card
              </button>
              <button className="btn ghost sm" onClick={() => setDrought({ k: 12, fraction: 0.6, endMonth: 12 })} data-testid="drought-reset">
                Reset inputs
              </button>
            </div>
            <p className="tiny muted">{DROUGHT_CARD.status}. Deterministic: the same inputs always give the same outputs. Not a forecast.</p>
          </div>
        </div>
      </aside>

      <aside className={`panel panel-right ${pane !== "analysis" ? "mobile-hide" : ""}`} aria-label="Drought analysis" data-testid="drought-analysis">
        <div className="panel-head">
          <h2 style={{ fontSize: 15 }}>{region?.name ?? "Region"}</h2>
          <Badge kind="HISTORICAL" />
        </div>
        <div className="panel-body">
          {calc && (
            <>
              <div className="section">
                <h4>{d.k}-month precipitation index in the record</h4>
                <IndexChart series={calc.p} index={calc.si.index} whatIf={h?.index ?? null} k={d.k} />
                <div className="legend" style={{ marginTop: 4 }}>
                  <span>
                    <i style={{ borderColor: "#1d6bff" }} />
                    index (MERRA-2 rainfall)
                  </span>
                  <span>
                    <i style={{ borderColor: "#d9541e" }} />
                    at or below −1 (drought)
                  </span>
                  <span>
                    <i style={{ borderColor: "#6941c6" }} />
                    what-if
                  </span>
                </div>
                <p className="tiny muted" style={{ marginTop: 4 }}>
                  {calc.dryMonths} of {calc.months} months are at or below −1. By construction about 16% of months are, in any region: the index measures dryness relative to that place's own record.
                </p>
              </div>

              <div className="section">
                <h4>Dry episodes in the record</h4>
                <table className="tbl" data-testid="drought-episodes">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th className="n">Months</th>
                      <th className="n">Lowest index</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calc.eps.slice(0, 6).map((e) => (
                      <tr key={e.start}>
                        <td>
                          {e.start} to {e.end}
                          <div className="tiny" style={{ color: CLASS_COLOR[droughtClass(e.peak)] }}>
                            {CLASS_LABEL[droughtClass(e.peak)]} at its lowest ({e.peakMonth})
                          </div>
                        </td>
                        <td className="n">{e.months}</td>
                        <td className="n">{sgn(e.peak)}</td>
                      </tr>
                    ))}
                    {!calc.eps.length && (
                      <tr>
                        <td colSpan={3} className="muted">
                          No run of 3 or more months at or below −1.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <p className="tiny muted" style={{ marginTop: 4 }}>
                  Runs of 3 or more months with the index at or below −1, longest first ({calc.eps.length} in total). These are episodes in the MERRA-2 reanalysis, not in rain-gauge records.
                </p>
              </div>

              <div className="section">
                <h4>What co-occurred in months this dry</h4>
                <div className="kv">
                  <FactRow
                    label={`Root-zone soil wetness in months with the index at or below ${sgn(calc.level)}`}
                    value={calc.soil?.median != null ? `${sgn(calc.soil.median)} standard deviations (median)` : "Insufficient validated data"}
                    evidence="HISTORICAL"
                    note={calc.soil ? `${calc.soil.n} months, 1981–2025; middle half ${calc.soil.q25 != null ? sgn(calc.soil.q25) : "n/a"} to ${calc.soil.q75 != null ? sgn(calc.soil.q75) : "n/a"}. MERRA-2 soil wetness is driven by the same rainfall, so this is not an independent check.` : undefined}
                  />
                  <FactRow
                    label="Vegetation greenness (MODIS NDVI) in those months"
                    value={calc.ndvi && calc.ndvi.n >= 3 && calc.ndvi.median != null ? `${sgn(calc.ndvi.median)} standard deviations (median)` : "Insufficient validated data"}
                    evidence="HISTORICAL"
                    note={calc.ndvi ? `${calc.ndvi.n} months since 2000${calc.ndvi.n < 3 ? "; too few to summarise" : `; middle half ${calc.ndvi.q25 != null ? sgn(calc.ndvi.q25) : "n/a"} to ${calc.ndvi.q75 != null ? sgn(calc.ndvi.q75) : "n/a"}`}. An independent satellite record.` : undefined}
                  />
                </div>
                <p className="tiny muted" style={{ marginTop: 6 }}>
                  Standardised against each calendar month's own average. This describes what happened alongside dry months in the record: an association, not a cause and not a forecast.{h?.beyondRecord ? ` The what-if is beyond the record, so months at or below ${sgn(DROUGHT_THRESHOLDS.severe)} are used instead.` : ""}
                </p>
              </div>

              <div className="section">
                <h4>From rainfall to the economy</h4>
                <table className="tbl">
                  <tbody>
                    <tr>
                      <td>Rainfall deficit</td>
                      <td>
                        <Badge kind="HYPOTHETICAL" />
                      </td>
                      <td className="small">Your input.</td>
                    </tr>
                    <tr>
                      <td>Soil wetness, vegetation</td>
                      <td>
                        <Badge kind="HISTORICAL" />
                      </td>
                      <td className="small">Co-variation in NASA records, shown above.</td>
                    </tr>
                    <tr>
                      <td>Crop and pasture output</td>
                      <td>
                        <Badge kind="RESEARCH HYPOTHESIS" />
                      </td>
                      <td className="small">Insufficient validated data: no production dataset is linked yet.</td>
                    </tr>
                    <tr>
                      <td>Food and farm commodity prices</td>
                      <td>
                        <Badge kind="RESEARCH HYPOTHESIS" />
                      </td>
                      <td className="small">Cannot be estimated.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="section">
                <h4>Data</h4>
                <div className="stack" style={{ gap: 3 }}>
                  <span className="src">Precipitation and soil wetness: {pa?.provenance.source?.dataset ?? "NASA MERRA-2"}; {pa?.first_month} to {pa?.last_month}; retrieved {String(pa?.provenance.retrieved_utc ?? "").slice(0, 10)}.</span>
                  <span className="src">Vegetation: {na?.provenance.source?.dataset ?? "MODIS MOD13C2"}; {na?.first_month} to {na?.last_month}.</span>
                  {pa?.provenance.request_url && <Src label="Exact NASA POWER request" url={pa.provenance.request_url} />}
                  <span className="src">{pa?.provenance.source?.caveat}</span>
                </div>
              </div>
            </>
          )}
          {!calc && !error && <p className="muted">Loading series…</p>}
        </div>
      </aside>
    </>
  );
}
