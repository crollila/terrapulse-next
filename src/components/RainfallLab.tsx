import { useEffect, useMemo, useState } from "react";
import { useStore, type RainView } from "../state/store";
import { RAIN_SENSITIVITY, useRainRecord, type RainRecord } from "../state/rainDerived";
import { DURATIONS, MM_PER_INCH, RAINFALL_CARD, RAIN_STOPS, SCREEN_ARIS, ariColor, ariFor, fmtMm, total, type AssetRain, type RainExposure } from "../sim/rainfall";
import { fmtUtc, windClassBy } from "../sim/rainRecord";
import { loadDoeRecord, loadFleet2017, peakReport, shutIds, shutIn, type DoeRecord, type DoeRefinery, type FleetFile } from "../data/doeRecord";
import { harveyHindcast } from "../sim/harveyHindcast";
import { fmtBpd } from "../sim/graph";
import { niceName } from "../data/companies";
import type { Port, Refinery } from "../data/types";
import { Badge, FactRow, Src } from "./ui";
import { HazardSelect } from "./HazardSelect";
import { RainTimeline, type RecordMarker } from "./RainTimeline";
import { ExposureNetwork } from "./ExposureNetwork";

const HOUR_MS = 3_600_000;
const NHC = { label: "NHC Tropical Cyclone Report AL092017", url: "https://www.nhc.noaa.gov/data/tcr/AL092017_Harvey.pdf" };
const mbd = (bpd: number) => (bpd / 1e6).toFixed(2);
const READING_LABEL: Record<RainView["reading"], string> = { estimate: "NOAA estimate", conservative: "Upper bound", liberal: "Lower bound" };

function DailyChart({ a, count, days }: { a: AssetRain; count: number; days: string[] }) {
  const W = 420;
  const H = 150;
  const m = { l: 34, r: 6, t: 8, b: 22 };
  const s4 = a.stage4.dailyMm;
  const im = a.nasa?.imergDailyMm ?? [];
  const hi = Math.max(50, ...s4.map((v) => v ?? 0), ...im.map((v) => v ?? 0));
  const bw = (W - m.l - m.r) / s4.length;
  const y = (v: number) => m.t + (1 - v / hi) * (H - m.t - m.b);
  const ticks = [0, hi / 2, hi].map((v) => Math.round(v / 10) * 10);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily rainfall at the site">
      {ticks.map((v) => (
        <g key={v}>
          <line className={v === 0 ? "axis" : "gridline"} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} />
          <text x={m.l - 5} y={y(v) + 3} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      {s4.map((v, i) => v !== null && <rect key={i} x={m.l + i * bw + 3} width={bw - 6} y={y(v)} height={Math.max(0, y(0) - y(v))} rx={2} fill={i < count ? "#1d6bff" : "rgba(29,107,255,0.22)"} />)}
      {im.map((v, i) => v !== null && <circle key={i} cx={m.l + (i + 0.5) * bw} cy={y(v)} r={3} fill="#fff" stroke="#6941c6" strokeWidth={1.6} />)}
      {days.map((d, i) => (
        <text key={d} x={m.l + (i + 0.5) * bw} y={H - 7} textAnchor="middle">
          {Number(d.slice(8))} {d.slice(5, 7) === "08" ? "Aug" : "Sep"}
        </text>
      ))}
      <text x={m.l} y={m.t + 2} style={{ fontSize: 9 }}>
        mm per day
      </text>
    </svg>
  );
}

/** DOE refineries (2017 names) that correspond to a site of the current fleet: same EIA site number. */
function doeFor(doe: DoeRecord | null, fleet: FleetFile | null, id: string): DoeRefinery[] {
  if (!doe) return [];
  const siteNo = (x: string) => x.split("-")[1];
  const plants = new Map<string, string[]>();
  for (const f of fleet?.facilities ?? []) plants.set(f.id, [siteNo(f.id), ...(f.plants ?? []).map((p) => String((p as { eiaSiteId?: number }).eiaSiteId ?? ""))]);
  return doe.refineries.filter((r) => r.eiaId && (r.eiaId === id || (plants.get(r.eiaId) ?? [siteNo(r.eiaId)]).includes(siteNo(id))));
}

function SiteEvidence({ rec, id, doe, fleet }: { rec: RainRecord; id: string; doe: DoeRecord | null; fleet: FleetFile | null }) {
  const a = rec.data.assets.assets.find((x) => x.id === id);
  const src = rec.data.assets.meta.sources;
  const refinery = rec.refineriesInDomain.find((r) => r.id === id);
  const port = rec.portsInDomain.find((p) => p.id === id);
  const st = useStore.getState();
  if (!a) return <div className="callout warn">Insufficient validated data: this site is outside the area of the rainfall record (Texas and Louisiana Gulf Coast).</div>;
  const full = rec.fullById.get(id)!;
  const toDate = rec.byId.get(id)!;
  const site = (refinery ?? port) as Refinery | Port;
  const imerg = a.nasa ? total(a.nasa.imergDailyMm) : null;
  const merra = a.nasa ? total(a.nasa.merra2DailyMm) : null;
  const windEver = windClassBy(rec.wind, id, Number.POSITIVE_INFINITY);
  const t = (m: Map<string, number>) => (m.has(id) ? fmtUtc(m.get(id)!) : null);
  const doeRows = doeFor(doe, fleet, id);
  const lastResolved = doe ? Math.max(...doe.meta.resolvedReports) : null;
  const repBy = new Map((doe?.reports ?? []).map((r) => [r.report, r]));
  return (
    <div className="kv" data-testid="rain-site">
      <div className="row wrap">
        <strong style={{ color: "var(--navy)", fontSize: 14, flex: 1 }}>{refinery ? `${niceName(refinery.name)} refinery` : port!.name}</strong>
        <button className="btn sm" onClick={() => st.flyTo({ lat: site.lat, lon: site.lon, zoom: 9.5 })}>
          Fly to
        </button>
        <button className="btn ghost sm" onClick={() => st.select(null)}>
          Close
        </button>
      </div>
      {refinery && <div className="small muted">{niceName(refinery.company)} · {refinery.capacityBpd != null ? fmtBpd(refinery.capacityBpd) : "capacity not reported"} (EIA, 1 January 2026)</div>}
      <DailyChart a={a} count={rec.count} days={rec.data.assets.meta.days} />
      <div className="legend">
        <span><i style={{ borderColor: "#1d6bff", borderTopWidth: 6 }} />NOAA Stage IV (radar and gauges)</span>
        <span><i style={{ borderColor: "#6941c6" }} />NASA GPM IMERG</span>
      </div>
      <FactRow
        label="Rainfall, 24 August to 2 September 2017"
        value={<span data-testid="rain-site-total">{fmtMm(full.totalMm)}</span>}
        evidence="OBSERVED"
        source={{ label: "NOAA Stage IV daily analysis", url: src.stage4.landingPage ?? src.stage4.sourceUrl }}
        note={`Value of the 4-km analysis cell containing the site point${a.stage4.block3x3TotalMm ? `; the nine cells around it range from ${a.stage4.block3x3TotalMm.min.toFixed(0)} to ${a.stage4.block3x3TotalMm.max.toFixed(0)} mm` : ""}. Through the date on the timeline: ${fmtMm(toDate.totalMm)}.`}
      />
      <FactRow
        label="Same period, NASA estimates"
        value={`IMERG ${imerg !== null ? `${imerg.toFixed(0)} mm` : "n/a"} · MERRA-2 ${merra !== null ? `${merra.toFixed(0)} mm` : "n/a"}`}
        evidence="OBSERVED"
        source={{ label: "NASA POWER (GPM IMERG; MERRA-2)", url: src.nasa.landingPage ?? src.nasa.sourceUrl }}
        note="Satellite (IMERG, about 10 km) and reanalysis (MERRA-2, about 50 km) estimates for UTC days. The spread between the three figures is a guide to how well the rainfall at one site is known."
      />
      <div>
        <div className="fact-label">
          <span>Largest totals against NOAA Atlas 14 at this point</span>
          <Badge kind="MODELED" />
        </div>
        <table className="tbl" style={{ marginTop: 4 }} data-testid="rain-site-table">
          <thead>
            <tr>
              <th>Over</th>
              <th className="n">Observed</th>
              <th className="n">100-year depth</th>
              <th className="n">Reached</th>
            </tr>
          </thead>
          <tbody>
            {full.durations.map((d) => {
              const i100 = a.atlas14 ? a.atlas14.ariYears.indexOf(100) : -1;
              return (
                <tr key={d.key}>
                  <td>{DURATIONS.find((x) => x.key === d.key)!.label}</td>
                  <td className="n">{d.observedMm !== null ? `${d.observedMm.toFixed(0)} mm` : "n/a"}</td>
                  <td className="n">{a.atlas14 && i100 >= 0 ? `${a.atlas14.mm[d.key][i100].toFixed(0)} (${a.atlas14.lower90[d.key][i100].toFixed(0)}–${a.atlas14.upper90[d.key][i100].toFixed(0)})` : "n/a"}</td>
                  <td className="n" style={{ color: ariColor(d.ari), fontWeight: 650 }}>{d.ari === null ? "n/a" : d.ari === 0 ? "< 1 yr" : `≥ ${d.ari.toLocaleString("en-US")} yr`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="fact-note">
          Depths in mm with NOAA's 90% interval. "Reached" is the largest tabulated recurrence interval whose depth the observed total equals or exceeds; nothing is extrapolated past 1,000 years. Daily totals in fixed 12:00 UTC windows can only understate the true largest 24-hour amount.
        </div>
        <Src label={`NOAA Atlas 14${a.atlas14?.volume ? ` (${a.atlas14.volume.replace("NOAA Atlas 14 ", "")})` : ""}`} url={src.atlas14.landingPage ?? src.atlas14.sourceUrl} />
      </div>
      <FactRow
        label="Ground elevation at the site point"
        value={a.elevationM !== null ? `${a.elevationM.toFixed(1)} m (${(a.elevationM / 0.3048).toFixed(0)} ft)` : "Insufficient validated data"}
        evidence="OBSERVED"
        source={{ label: "USGS 3DEP Elevation Point Query Service", url: src.elevation.landingPage ?? src.elevation.sourceUrl }}
        note="One point of a facility that can cover several square kilometres. Elevation alone does not say whether a site floods."
      />
      <FactRow
        label="FEMA flood zone at the site point"
        value={!a.nfhl ? "Insufficient validated data" : !a.nfhl.mapped ? "No mapped zone at this point" : `Zone ${a.nfhl.zone}${a.nfhl.sfha ? " · Special Flood Hazard Area" : ""}`}
        evidence="OBSERVED"
        source={{ label: "FEMA National Flood Hazard Layer", url: src.nfhl.landingPage ?? src.nfhl.sourceUrl }}
        note={`${a.nfhl?.subtype ? `${a.nfhl.subtype.charAt(0)}${a.nfhl.subtype.slice(1).toLowerCase()}. ` : ""}The map in force when this file was built, not the 2017 map; a regulatory zone, not an observation of flooding.`}
      />
      <FactRow
        label="USGS high-water marks within 5 km"
        value={a.hwm.within5km ? `${a.hwm.within5km} mark${a.hwm.within5km === 1 ? "" : "s"}${a.hwm.maxHeightFtWithin5km !== null ? `; highest ${a.hwm.maxHeightFtWithin5km.toFixed(1)} ft above ground` : ""}` : "None"}
        evidence="OBSERVED"
        source={{ label: "USGS Flood Event Data, 2017 Harvey", url: src.hwm.landingPage ?? src.hwm.sourceUrl }}
        note={`Nearest mark ${a.hwm.nearestKm.toFixed(1)} km away; ${a.hwm.within2km} within 2 km. Marks show where survey crews recorded water, mostly along rivers, bayous and the coast. They are not measurements inside the facility, and no marks nearby does not mean no flooding.`}
      />
      <FactRow
        label="Wind: inside the observed best-track radii"
        value={windEver ? `${windEver}-kt radius${windEver === 34 ? " (tropical-storm force)" : ""}` : "Never inside the 34-kt radius"}
        evidence="OBSERVED"
        source={{ label: "NOAA NHC HURDAT2 best track", url: String(rec.data.trackMeta.landingPage ?? rec.data.trackMeta.sourceUrl) }}
        note={[t(rec.wind.t34) && `34 kt from ${t(rec.wind.t34)}`, t(rec.wind.t50) && `50 kt from ${t(rec.wind.t50)}`, t(rec.wind.t64) && `64 kt from ${t(rec.wind.t64)}`].filter(Boolean).join("; ") || "Best-track radii are maximum extents per quadrant, so membership is an upper bound."}
      />
      {refinery && (
        <FactRow
          label="DOE event reports, 2017 (membership reconstructed)"
          value={
            <span data-testid="rain-site-doe">
              {!doe
                ? "Insufficient validated data"
                : doeRows.length
                  ? doeRows.map((r) => `Counted as shut from Update #${Math.min(...r.shutInReports)} (${repBy.get(Math.min(...r.shutInReports))?.sectionAsOf ?? ""})`).join("; ")
                  : `Not in DOE's shut count through Update #${lastResolved}`}
            </span>
          }
          evidence="HISTORICAL"
          source={doe ? { label: "U.S. DOE Hurricane Harvey event reports", url: doe.meta.landingPage } : undefined}
          note={
            !doe
              ? "The DOE record file did not load."
              : doeRows.length
                ? `${doeRows.map((r) => `${r.doeName}, ${r.capacityBpd2017.toLocaleString("en-US")} b/d in 2017`).join("; ")}. DOE names no refinery: membership is reconstructed from its regional counts and combined capacities (see Limits & data). DOE gives no cause for individual shutdowns.`
                : `Reconstructed from DOE's counts for Updates #1 to #${lastResolved} (26 to 30 August). Not counted as shut is not the same as running normally: DOE also reported refineries at reduced rates without naming them, and membership after Update #${lastResolved} cannot be reconstructed.`
          }
        />
      )}
      <FactRow label="Flood depth, damage or shutdown at this site" value="Not estimated" evidence="RESEARCH HYPOTHESIS" note="Rare rainfall is a hazard indicator. Turning it into water depth needs drainage, river stage, levee and site-level elevation data that are not modelled here." />
    </div>
  );
}

function Overview({ rec, doe, fleet }: { rec: RainRecord; doe: DoeRecord | null; fleet: FleetFile | null }) {
  const rain = useStore((s) => s.rain);
  const gridMeta = rec.data.grid.meta as { nativeGridMaximumInDomain?: { mm: number; inches: number; lat: number; lon: number } };
  const peak = doe ? peakReport(doe) : null;
  const hc = useMemo(() => {
    if (!doe || !peak || !fleet || !peak.asOfUtc) return null;
    return harveyHindcast({ fleet: fleet.facilities, rain: rec.data.assets.assets, days: rec.data.assets.meta.days, storm: rec.data.track, recordedIds: shutIds(doe, peak.report), asOfUtc: peak.asOfUtc, ariYears: rain.ariYears, reading: rain.reading });
  }, [doe, peak, fleet, rec, rain.ariYears, rain.reading]);
  const noPosition = doe && peak ? shutIn(doe, peak.report).filter((r) => !r.eiaId) : [];
  const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 100)}%`);

  return (
    <>
      <div className="section">
        <h4>What was recorded</h4>
        <div className="kv">
          <FactRow label="The storm" value="Category 4 landfall, then four days stalled" evidence="HISTORICAL" source={NHC} note={`"The storm then stalled, with its center over or near the Texas coast for four days, dropping historic amounts of rainfall of more than 60 inches over southeastern Texas." (NHC)`} />
          {gridMeta.nativeGridMaximumInDomain && (
            <FactRow
              label="Largest 10-day total of any 4-km analysis cell"
              value={`${gridMeta.nativeGridMaximumInDomain.mm.toFixed(0)} mm (${gridMeta.nativeGridMaximumInDomain.inches.toFixed(1)} in)`}
              evidence="OBSERVED"
              source={{ label: "NOAA Stage IV daily analysis", url: rec.data.assets.meta.sources.stage4.landingPage ?? rec.data.assets.meta.sources.stage4.sourceUrl }}
              note={`Near ${gridMeta.nativeGridMaximumInDomain.lat.toFixed(2)}°N, ${Math.abs(gridMeta.nativeGridMaximumInDomain.lon).toFixed(2)}°W. A cell average, so lower than the largest single gauge.`}
            />
          )}
          <FactRow label="High-water marks surveyed" value={`${rec.data.hwms.meta.count.toLocaleString("en-US")} marks in Texas and Louisiana`} evidence="OBSERVED" source={{ label: "USGS Flood Event Data, 2017 Harvey", url: rec.data.hwms.meta.landingPage ?? rec.data.hwms.meta.sourceUrl }} note="Shown as small dots on the map; click one for its height above ground and quality class." />
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Select a refinery or port on the map for its rainfall, terrain and flood evidence.</p>
      </div>

      <div className="section" data-testid="rain-hindcast">
        <div className="row">
          <h4 style={{ flex: 1 }}>Hindcast: screens against the DOE count</h4>
          <Badge kind="HISTORICAL" />
        </div>
        {!doe || !peak || !hc ? (
          <div className="callout warn" style={{ marginTop: 6 }}>Insufficient validated data: the DOE record or the 2017 refinery fleet did not load.</div>
        ) : (
          <>
            <p className="small" style={{ margin: "6px 0" }}>
              DOE Update #{peak.report} (as of {peak.sectionAsOf}) counted <strong>{peak.shut.count}</strong> refineries shut or shutting down, {(peak.shut.capacityBpd ?? 0).toLocaleString("en-US")} b/d. DOE names none of them; they are reconstructed from its regional counts and the EIA capacities of January 2017 (one set fits). <strong>{hc.recorded.length}</strong> have a position and rainfall data{noPosition.length ? `; ${noPosition.map((r) => r.doeName).join(", ")} ${noPosition.length === 1 ? "does" : "do"} not` : ""}.
            </p>
            <table className="tbl" data-testid="rain-hindcast-table">
              <thead>
                <tr>
                  <th>Screen, data up to the report</th>
                  <th className="n">Sites</th>
                  <th className="n">Found</th>
                  <th className="n">Missed</th>
                  <th className="n">Extra</th>
                </tr>
              </thead>
              <tbody>
                {hc.screens
                  .filter((s) => s.key !== "wind64orRain")
                  .map((s) => (
                    <tr key={s.key} data-testid={`hc-${s.key}`}>
                      <td>
                        {s.label}
                        <div className="tiny muted">
                          finds {pct(s.score.hitRate)} of DOE's count · {pct(s.score.falseAlarmRatio)} of the screen is extra
                        </div>
                      </td>
                      <td className="n">{s.ids.length}</td>
                      <td className="n">{s.score.hits.length}</td>
                      <td className="n">{s.score.misses.length}</td>
                      <td className="n">{s.score.falseAlarms.length}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="tiny muted" style={{ marginTop: 6 }}>
              Found = in the screen and in DOE's count; Missed = in DOE's count only; Extra = in the screen only. Scored over the {hc.universe.length} refineries of the EIA fleet of 1 January 2017 inside the record area, using wind radii and the {hc.rainDays} rainfall days observed by the report time. One storm; DOE's count mixes precautionary shutdowns with flooding, power, port and crude-supply causes; refineries at reduced rates are not in the count. The thresholds were not tuned to this result. This describes Harvey: it does not validate a predictor.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Limits({ rec, doe }: { rec: RainRecord; doe: DoeRecord | null }) {
  const s = rec.data.assets.meta.sources;
  const rows: [string, (typeof s)[keyof typeof s]][] = [["Rainfall field and site rainfall", s.stage4], ["Rainfall rarity", s.atlas14], ["NASA rainfall estimates", s.nasa], ["Elevation", s.elevation], ["Flood zones", s.nfhl], ["High-water marks", s.hwm]];
  return (
    <>
      <div className="section">
        <h4>{RAINFALL_CARD.name}</h4>
        <p className="small"><strong>Status:</strong> {RAINFALL_CARD.status}</p>
        <p className="small" style={{ marginTop: 6 }}><strong>What is computed</strong></p>
        <pre className="formula">{RAINFALL_CARD.formula.join("\n")}</pre>
        <p className="small"><strong>Limits</strong></p>
        <ul className="prose" style={{ margin: 0, paddingLeft: 18 }}>{RAINFALL_CARD.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="small" style={{ marginTop: 6 }}><strong>Uncertainty:</strong> {RAINFALL_CARD.uncertainty}</p>
      </div>
      {doe && (
        <div className="section" data-testid="doe-method">
          <h4>How the DOE refinery list was reconstructed</h4>
          <ul className="prose" style={{ margin: 0, paddingLeft: 18 }}>{[...doe.meta.method, ...doe.meta.assumptions.map((a) => `Assumption: ${a}`), ...doe.meta.caveats].map((x) => <li key={x}>{x}</li>)}</ul>
          <Src label="U.S. DOE Hurricane Harvey event reports" url={doe.meta.landingPage} />
        </div>
      )}
      <div className="section">
        <h4>Data in this view</h4>
        <table className="tbl">
          <tbody>
            {rows.map(([use, b]) => (
              <tr key={use}>
                <td>
                  <strong>{use}</strong>
                  <div className="tiny muted">{b.provider}. {b.dataset}.</div>
                  <div className="tiny muted">Retrieved {String(b.retrievedAt ?? "n/a").slice(0, 10)} · {b.license ?? "terms: see source"}</div>
                  <Src label="Source" url={b.landingPage ?? b.sourceUrl} />
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <strong>Storm track and wind radii</strong>
                <div className="tiny muted">{rec.data.trackMeta.provider}. {rec.data.trackMeta.dataset}.</div>
                <Src label="Source" url={String(rec.data.trackMeta.landingPage ?? rec.data.trackMeta.sourceUrl)} />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

type Pane = "evidence" | "network" | "limits";

export function RainfallLab({ onMethods, pane }: { onMethods: () => void; pane: "controls" | "analysis" }) {
  const { rec, error } = useRainRecord();
  const rain = useStore((s) => s.rain);
  const setRain = useStore((s) => s.setRain);
  const selection = useStore((s) => s.selection);
  const [tab, setTab] = useState<Pane>("evidence");
  const [doe, setDoe] = useState<DoeRecord | null>(null);
  const [fleet, setFleet] = useState<FleetFile | null>(null);
  const st = useStore.getState();

  useEffect(() => {
    loadDoeRecord().then(setDoe, () => setDoe(null));
    loadFleet2017().then(setFleet, () => setFleet(null));
  }, []);
  useEffect(() => {
    if (selection && (selection.type === "refinery" || selection.type === "port")) setTab("evidence");
    if (selection && (selection.type === "node" || selection.type === "edge")) setTab("network");
  }, [selection]);

  const markers = useMemo<RecordMarker[]>(() => {
    const out: RecordMarker[] = [];
    const lf = rec?.data.track.fixes.find((f) => f.recordId === "L");
    if (lf) out.push({ ms: Date.parse(lf.time), label: `Landfall, ${fmtUtc(Date.parse(lf.time))} (NHC best track)`, color: "#d93a3f" });
    for (const r of doe?.reports ?? []) if (r.asOfUtc) out.push({ ms: Date.parse(r.asOfUtc), label: `DOE Update #${r.report}: ${r.shut.count ?? "n/a"} refineries shut or shutting down (as of ${r.sectionAsOf})`, color: "#0b1f3f" });
    return out;
  }, [rec, doe]);

  const top = useMemo(() => {
    if (!rec) return [];
    const refById = new Map(rec.refineriesInDomain.map((r) => [r.id, r]));
    return rec.toDate
      .filter((e): e is RainExposure => e.kind === "refinery" && refById.has(e.id) && (ariFor(e, rain.reading) ?? -1) >= rain.ariYears)
      .sort((a, b) => (refById.get(b.id)!.capacityBpd ?? 0) - (refById.get(a.id)!.capacityBpd ?? 0) || a.id.localeCompare(b.id))
      .map((e) => ({ e, r: refById.get(e.id)! }));
  }, [rec, rain.reading, rain.ariYears]);

  const portsIn = rec ? rec.summary.inside.filter((id) => rec.portsInDomain.some((p) => p.id === id)).length : 0;
  const refsIn = rec ? rec.summary.inside.length - portsIn : 0;
  const peak = doe ? peakReport(doe) : null;
  const siteSel = selection && (selection.type === "refinery" || selection.type === "port") ? selection.id : null;
  const through = rec ? (rec.count === 0 ? "before any rainfall day is complete" : `through ${fmtUtc(rec.window.startMs + rec.count * 24 * HOUR_MS)}`) : "";
  const capRange = rec ? [rec.bounds.conservative.capacityBpd, rec.bounds.liberal.capacityBpd] : [0, 0];

  return (
    <>
      <RainTimeline rec={rec} markers={markers} />
      <aside className={`panel panel-left ${pane !== "controls" ? "mobile-hide" : ""}`} aria-label="Rainfall record controls" data-testid="rain-panel">
        <div className="panel-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4>Observed record</h4>
            <h2>Harvey rainfall, 2017</h2>
          </div>
          <Badge kind="OBSERVED" />
        </div>
        <div className="panel-body">
          <div className="section stack">
            <HazardSelect id="rhaz" />
            {error && <div className="callout danger">Insufficient validated data: the rainfall record failed to load ({error}).</div>}
          </div>

          <div className="section" data-testid="rain-summary">
            <h4>Rainfall screen</h4>
            {rec ? (
              <>
                <div className="hero-num" data-testid="rain-capacity">
                  {mbd(rec.summary.capacityBpd)}
                  <span className="hero-unit">million b/d of today's refining capacity got NOAA's {rain.ariYears.toLocaleString("en-US")}-year rainfall or more</span>
                </div>
                <div className="row wrap" style={{ marginTop: 6 }}>
                  <Badge kind="MODELED" />
                  <span className="small muted" data-testid="rain-counts">
                    {refsIn} refineries · {portsIn} ports · {((rec.summary.capacityBpd / rec.datasetCapacityBpd) * 100).toFixed(1)}% of U.S. capacity · {through}
                  </span>
                </div>
                <p className="tiny muted" style={{ marginTop: 6 }}>
                  Observed rainfall compared with NOAA Atlas 14 at each site. Rare rainfall is <strong>not</strong> flood depth, damage, shutdown or lost production, and capacity is as of 1 January 2026, not 2017.
                  {rec.summary.capacityUnknown > 0 && ` ${rec.summary.capacityUnknown} site(s) in the screen have no capacity in the EIA file and add nothing to the sum.`}
                  {rec.summary.unclassified.length > 0 && ` ${rec.summary.unclassified.length} site(s) could not be classified.`}
                </p>
                <div style={{ marginTop: 8 }}>
                  {top.slice(0, 7).map(({ e, r }) => (
                    <button key={e.id} className="list-btn" onClick={() => st.select({ type: "refinery", id: e.id })}>
                      <span className="grow">
                        {niceName(r.name)} <span className="muted">· {niceName(r.company).slice(0, 20)}</span>
                      </span>
                      <span className="num small">{e.totalMm !== null ? `${(e.totalMm / MM_PER_INCH).toFixed(0)} in` : "n/a"}</span>
                      <span className="num tiny" style={{ color: ariColor(ariFor(e, rain.reading)), fontWeight: 700 }}>≥{(ariFor(e, rain.reading) ?? 0).toLocaleString("en-US")} yr</span>
                    </button>
                  ))}
                  {top.length > 7 && <p className="tiny muted">and {top.length - 7} more refineries.</p>}
                  {top.length === 0 && <p className="small muted">No refinery has reached this depth {through}.</p>}
                </div>
              </>
            ) : (
              !error && <p className="muted">Loading the record…</p>
            )}
          </div>

          <div className="section stack">
            <h4>Threshold and uncertainty</h4>
            <div className="field">
              <span className="small" style={{ fontWeight: 600, color: "var(--navy)" }}>Count a site when its rainfall reaches the depth expected once in</span>
              <div className="seg" role="group" aria-label="Recurrence interval">
                {SCREEN_ARIS.map((a) => (
                  <button key={a} aria-pressed={rain.ariYears === a} onClick={() => setRain({ ariYears: a })} data-testid={`ari-${a}`}>
                    {a.toLocaleString("en-US")} yr
                  </button>
                ))}
              </div>
              <div className="tiny muted">Average recurrence interval from NOAA Atlas 14, for the same place and for 1, 2, 3, 4 or 7 days, whichever is rarest. An assumption you choose: no damage threshold is validated.</div>
            </div>
            <div className="field">
              <span className="small" style={{ fontWeight: 600, color: "var(--navy)" }}>Atlas 14 value used</span>
              <div className="seg" role="group" aria-label="Atlas 14 reading">
                {(Object.keys(READING_LABEL) as RainView["reading"][]).map((k) => (
                  <button key={k} aria-pressed={rain.reading === k} onClick={() => setRain({ reading: k })} data-testid={`reading-${k}`}>
                    {READING_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            {rec && (
              <div className="callout info" data-testid="rain-uncertainty">
                <strong>How firm is the count?</strong> With NOAA's 90% interval on the {rain.ariYears.toLocaleString("en-US")}-year depth it is {mbd(Math.min(...capRange))} to {mbd(Math.max(...capRange))} million b/d. If the rainfall analysis were {Math.round(RAIN_SENSITIVITY * 100)}% too high or too low it would be {mbd(rec.rainLow.capacityBpd)} to {mbd(rec.rainHigh.capacityBpd)} million b/d.
              </div>
            )}
          </div>

          <div className="section" data-testid="rain-compare">
            <div className="row">
              <h4 style={{ flex: 1 }}>Wind and rainfall {through}</h4>
            </div>
            {rec && (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Refineries inside</th>
                    <th className="n">Sites</th>
                    <th className="n">Million b/d</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rec.windScreens].reverse().map((w) => (
                    <tr key={w.thresholdKt}>
                      <td>Observed {w.thresholdKt}-kt wind radii</td>
                      <td className="n">{w.inside.length}</td>
                      <td className="n" data-testid={`wind-${w.thresholdKt}-cap`}>{mbd(w.capacityBpd)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>Rainfall at the {rain.ariYears.toLocaleString("en-US")}-year depth</td>
                    <td className="n">{refsIn}</td>
                    <td className="n">{mbd(rec.summary.capacityBpd)}</td>
                  </tr>
                  <tr>
                    <td>64-kt wind or that rainfall</td>
                    <td className="n">{rec.either.inside.length}</td>
                    <td className="n" data-testid="either-cap">{mbd(rec.either.capacityBpd)}</td>
                  </tr>
                  {peak && (
                    <tr>
                      <td>
                        DOE: shut or shutting down <Badge kind="HISTORICAL" />
                        <div className="tiny muted">Update #{peak.report}, as of {peak.sectionAsOf}; 2017 capacities</div>
                      </td>
                      <td className="n">{peak.shut.count}</td>
                      <td className="n" data-testid="doe-cap">{peak.shut.capacityBpd != null ? mbd(peak.shut.capacityBpd) : "n/a"}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
            <p className="tiny muted" style={{ marginTop: 6 }}>Screens use the 2026 refinery fleet; the DOE row uses 2017 capacities. Compare the pattern, not the totals.</p>
          </div>

          <div className="section stack">
            <h4>Map layers</h4>
            {([["showField", "Accumulated rainfall (NOAA Stage IV)"], ["showMarks", "High-water marks (USGS)"], ["showWind", "Wind radii (NHC best track)"]] as const).map(([k, label]) => (
              <div className="row" key={k}>
                <span className="small" style={{ flex: 1, color: "var(--navy)", fontWeight: 560 }}>{label}</span>
                <button type="button" role="switch" aria-checked={rain[k]} aria-label={label} className="switch" data-testid={`rain-${k}`} onClick={() => setRain({ [k]: !rain[k] })} />
              </div>
            ))}
            <div data-testid="rain-legend">
              <div className="rain-ramp">
                {RAIN_STOPS.map((s) => (
                  <span key={s.mm} style={{ background: `rgb(${s.rgb.join(",")})` }} title={`${s.mm} mm or more`} />
                ))}
              </div>
              <div className="rain-ramp-labels tiny muted">
                {RAIN_STOPS.map((s) => (
                  <span key={s.mm}>{s.mm >= 1000 ? `${s.mm / 1000}k` : s.mm}</span>
                ))}
              </div>
              <div className="tiny muted">Accumulated rainfall, mm (lower edge of each class). Site colour: rarest depth reached, from grey (below 10-year) to violet (1,000-year); a dark ring marks sites in the screen.</div>
            </div>
          </div>

          <div className="section stack">
            <div className="row wrap">
              <button className="btn ghost sm" onClick={onMethods}>
                Model card
              </button>
              <button className="btn ghost sm" onClick={() => setRain({ ariYears: 100, reading: "estimate", hours: rec?.window.hours ?? rain.hours, playing: false })} data-testid="rain-reset">
                Reset view
              </button>
            </div>
            <p className="tiny muted">{RAINFALL_CARD.status} Deterministic: the same files always give the same figures.</p>
          </div>
        </div>
      </aside>

      <aside className={`panel panel-right ${pane !== "analysis" ? "mobile-hide" : ""}`} aria-label="Rainfall evidence" data-testid="rain-analysis">
        <div className="panel-head">
          <div className="seg" style={{ flex: 1 }} role="tablist" aria-label="Evidence views">
            <button role="tab" aria-pressed={tab === "evidence"} aria-selected={tab === "evidence"} onClick={() => setTab("evidence")} data-testid="rain-tab-evidence">Evidence</button>
            <button role="tab" aria-pressed={tab === "network"} aria-selected={tab === "network"} onClick={() => setTab("network")} data-testid="rain-tab-network">Economic network</button>
            <button role="tab" aria-pressed={tab === "limits"} aria-selected={tab === "limits"} onClick={() => setTab("limits")} data-testid="rain-tab-limits">Limits &amp; data</button>
          </div>
        </div>
        <div className="panel-body">
          {!rec && !error && <p className="muted">Loading the record…</p>}
          {rec && tab === "evidence" && (siteSel ? <div className="section"><SiteEvidence rec={rec} id={siteSel} doe={doe} fleet={fleet} /></div> : <Overview rec={rec} doe={doe} fleet={fleet} />)}
          {rec && tab === "network" && <ExposureNetwork rec={rec} />}
          {rec && tab === "limits" && <Limits rec={rec} doe={doe} />}
        </div>
      </aside>
    </>
  );
}
