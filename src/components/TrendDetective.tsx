import { useStore } from "../state/store";
import { useCatalog } from "../data/trends";
import { CASES, fmtBounds, useTrendWindow, type CaseId } from "../state/trendWindow";
import { MIN_WINDOW_YEARS } from "../science/stats";
import { SCENARIO_001 } from "../sim/hurricane";
import { Badge, Icon } from "./ui";

const signed = (v: number, d: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
const fmtP = (p: number) => (p < 0.0001 ? "< 0.0001" : p < 0.001 ? p.toFixed(4) : p.toFixed(3));

export const TOUR = [
  { title: "What is changing, and where?", text: "Rainfall in one study box in the south-western Amazon, 1981–2025, from NASA's MERRA-2.", apply: (s: any) => { s.setCase(null); s.setTrend({ variableId: "PRECTOTCORR", regionId: "rondonia", startYear: 1900, endYear: 2100 }); } },
  { title: "How much, and is it significant?", text: "Read the four answers on the left: a rate per decade with its 95% range, and two tests corrected for month-to-month persistence.", apply: (s: any) => { s.setCase(null); } },
  { title: "Should we believe the size?", text: "The Amazon Rainfall Mystery: a second record agrees on the direction but not on the rate, and the gap opens in 2005.", apply: (s: any) => s.setCase("amazon") },
  { title: "A trend that holds up", text: "Northern Alaska warming: two independent records agree. Compare it with the Amazon.", apply: (s: any) => s.setCase("alaska") },
  { title: "From trends to hazards and the economy", text: "A different kind of evidence: a hypothetical hurricane over real infrastructure. Open the simulator from the panel below.", apply: (s: any) => s.setCase(null) },
] as const;

function Answer({ id, q, children }: { id: string; q: string; children: React.ReactNode }) {
  return (
    <div className="answer" data-testid={`answer-${id}`}>
      <div className="answer-q">{q}</div>
      <div className="answer-a">{children}</div>
    </div>
  );
}

export function TrendDetective() {
  const trend = useStore((s) => s.trend);
  const setTrend = useStore((s) => s.setTrend);
  const caseId = useStore((s) => s.caseId);
  const tourStep = useStore((s) => s.tourStep);
  const cat = useCatalog().data;
  const { a, error, rec, start, end, result: r, isFullRecord } = useTrendWindow();
  const st = useStore.getState();
  const v = a?.variable;
  const dec = v ? Math.max(v.decimals, 2) : 2;
  const cc = a?.crosscheck ?? null;
  const ws = a?.windows_summary;
  const goTour = (i: number | null) => {
    st.setTourStep(i);
    if (i !== null) TOUR[i].apply(useStore.getState());
  };
  const openHouston = () => {
    st.setSim({ ...SCENARIO_001 });
    st.setSimPos(0);
    st.setHazard("hurricane");
    st.setTab("sim");
  };

  return (
    <aside className="panel panel-left detective" aria-label="Earth-system trend detective" data-testid="detective">
      <div className="panel-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4>Be an Earth System Trend Detective</h4>
          <h2 data-testid="trends-entry">Explore Earth's Changing Systems</h2>
        </div>
      </div>
      <div className="panel-body">
        <div className="section">
          <p className="small">Decades of NASA data, four questions: <strong>what</strong> is changing, <strong>where</strong>, <strong>how much</strong>, and <strong>is it significant?</strong></p>
          <div className="cases">
            {(Object.keys(CASES) as CaseId[]).map((id) => (
              <button key={id} className={`case-card ${id}`} aria-pressed={caseId === id} onClick={() => st.setCase(id)} data-testid={`case-${id}`}>
                <span className="case-kicker">{CASES[id].kicker}</span>
                <span className="case-title">{CASES[id].title}</span>
              </button>
            ))}
          </div>
          {tourStep === null ? (
            <button className="btn primary sm" style={{ marginTop: 8, width: "100%", justifyContent: "center" }} onClick={() => goTour(0)} data-testid="tour-start">
              {Icon.play} Guided tour: the four questions in five steps
            </button>
          ) : (
            <div className="callout info" style={{ marginTop: 8 }} data-testid="tour">
              <div className="tiny" style={{ fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Step {tourStep + 1} of {TOUR.length}
              </div>
              <strong>{TOUR[tourStep].title}</strong>
              <div className="small">{TOUR[tourStep].text}</div>
              <div className="row" style={{ marginTop: 6 }}>
                <button className="btn sm" disabled={tourStep === 0} onClick={() => goTour(tourStep - 1)}>
                  Back
                </button>
                {tourStep < TOUR.length - 1 ? (
                  <button className="btn primary sm" onClick={() => goTour(tourStep + 1)} data-testid="tour-next">
                    Next
                  </button>
                ) : (
                  <button className="btn primary sm" onClick={openHouston} data-testid="tour-finish">
                    Open the simulator
                  </button>
                )}
                <span className="spacer" />
                <button className="btn ghost sm" onClick={() => goTour(null)}>
                  End tour
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="section">
          <h4>Choose a variable, a region and dates</h4>
          <div className="stack">
            <div className="grid2 tight">
            <div className="field">
              <label htmlFor="tv">Variable</label>
              <select id="tv" value={trend.variableId} onChange={(e) => { st.setCase(null); setTrend({ variableId: e.target.value, startYear: 1900, endYear: 2100 }); }} data-testid="trend-variable">
                {cat?.variables.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({x.units})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tr">Study region</label>
              <select id="tr" value={trend.regionId} onChange={(e) => { st.setCase(null); setTrend({ regionId: e.target.value }); }} data-testid="trend-region">
                {cat?.regions.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            </div>
            {rec && (
              <div className="grid2">
                <div className="field">
                  <div className="field-head">
                    <label htmlFor="ts">From</label>
                    <span className="field-val">{start}</span>
                  </div>
                  <input id="ts" type="range" min={rec[0]} max={rec[1] - MIN_WINDOW_YEARS + 1} step={1} value={start} style={{ ["--fill" as any]: `${((start - rec[0]) / Math.max(1, rec[1] - MIN_WINDOW_YEARS + 1 - rec[0])) * 100}%` }} onChange={(e) => setTrend({ startYear: Number(e.target.value), endYear: Math.max(end, Number(e.target.value) + MIN_WINDOW_YEARS - 1) })} data-testid="trend-start" />
                </div>
                <div className="field">
                  <div className="field-head">
                    <label htmlFor="te">To</label>
                    <span className="field-val">{end}</span>
                  </div>
                  <input id="te" type="range" min={rec[0] + MIN_WINDOW_YEARS - 1} max={rec[1]} step={1} value={end} style={{ ["--fill" as any]: `${((end - rec[0] - MIN_WINDOW_YEARS + 1) / Math.max(1, rec[1] - rec[0] - MIN_WINDOW_YEARS + 1)) * 100}%` }} onChange={(e) => setTrend({ endYear: Number(e.target.value), startYear: Math.min(start, Number(e.target.value) - MIN_WINDOW_YEARS + 1) })} data-testid="trend-end" />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="section" data-testid="four-answers">
          <h4>The four answers</h4>
          {error && <div className="callout danger">Insufficient validated data: {error}</div>}
          {a && v && (
            <div className="answers">
              <Answer id="what" q="What is changing?">
                <strong>{v.name}</strong> <span className="muted">({v.units})</span>
                <div className="tiny muted">
                  {v.definition.split(". ")[0].replace(/\.$/, "")}. Source: {a.provenance.source?.short_name ?? "NASA"}.
                </div>
              </Answer>
              <Answer id="where" q="Where?">
                <strong>{a.region.name}</strong>
                <div className="tiny muted">
                  Study box {fmtBounds(a.region.bbox)}, {a.region.country}. A rectangle{a.quality.grid_cells ? ` averaged over ${a.quality.grid_cells} grid cells` : ""}, not a basin or a country{a.region.land_share < 0.99 ? `; ${Math.round(a.region.land_share * 100)}% land` : ""}.
                </div>
              </Answer>
              <Answer id="howmuch" q="How much?">
                {r ? (
                  <>
                    <strong className="num" style={{ fontSize: 17 }}>
                      {signed(r.slopePerDecade, dec)} {v.units}
                    </strong>{" "}
                    per decade
                    <div className="tiny muted">
                      95% range {signed(r.ciLow, dec)} to {signed(r.ciHigh, dec)} · {start}–{end} · {r.nMonths} months · computed in your browser
                    </div>
                  </>
                ) : (
                  <span>Insufficient validated data for this window.</span>
                )}
              </Answer>
              <Answer id="significant" q="Is it significant?">
                {r ? (
                  <>
                    <strong style={{ color: r.significant ? "var(--blue-deep)" : "var(--amber)" }}>{r.significant ? "Yes, in both corrected tests" : r.olsSignificant || r.mkSignificant ? "The two tests disagree" : "No significant trend detected"}</strong>
                    <div className="tiny muted">
                      Adjusted t-test p {fmtP(r.pValue)}; Mann–Kendall p {fmtP(r.mkPValue)} ({start}–{end}).
                    </div>
                    {ws && (
                      <div className="tiny muted">
                        Robustness: {(100 * ws.share_same_direction).toFixed(0)}% of {ws.n_windows} date windows point the same way; {(100 * ws.share_significant_same_direction).toFixed(0)}% are significant.
                      </div>
                    )}
                    <div className="tiny" style={{ marginTop: 3 }} data-testid="second-opinion-line">
                      {cc ? (
                        <>
                          <strong>Independent check ({cc.dataset.name}):</strong> {cc.label.toLowerCase()}.{" "}
                          <span className="tag-full" data-testid="full-record-tag">
                            Full record {cc.period[0]}–{cc.period[1]} only
                          </span>
                          {!isFullRecord && <span style={{ color: "var(--amber)" }}> It was not recomputed for {start}–{end} and does not apply to that window.</span>}
                        </>
                      ) : (
                        <span style={{ color: "var(--amber)" }}>No independent dataset has been checked for this variable.</span>
                      )}
                    </div>
                    {cc?.known_issue && (
                      <button className="btn sm" style={{ marginTop: 5 }} onClick={() => st.setCase("amazon")}>
                        Known data issue (2005): open the investigation
                      </button>
                    )}
                  </>
                ) : (
                  <span>Not tested.</span>
                )}
              </Answer>
            </div>
          )}
          {!a && !error && <p className="muted">Loading series…</p>}
          <div className="stack" style={{ marginTop: 10 }}>
            <div className="field">
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
            <div className="tiny muted">Six variables, eight study regions, any window of {MIN_WINDOW_YEARS} years or more. Results exist only for these region boxes; no global map is drawn from eight regions.</div>
          </div>
        </div>

        <div className="section" data-testid="evidence-bridge">
          <h4>From trends to hazards and the economy</h4>
          <p className="small">TerraPulse keeps four kinds of evidence apart:</p>
          <table className="tbl" style={{ marginTop: 4 }}>
            <tbody>
              <tr>
                <td><Badge kind="OBSERVED" /></td>
                <td className="small">Decades of Earth-system records and their trends (this page).</td>
              </tr>
              <tr>
                <td><Badge kind="HYPOTHETICAL" /></td>
                <td className="small">A what-if hazard you choose, such as a Category 5 hurricane.</td>
              </tr>
              <tr>
                <td><Badge kind="MODELED" /></td>
                <td className="small">Which real facilities that hazard would reach.</td>
              </tr>
              <tr>
                <td><Badge kind="RESEARCH HYPOTHESIS" /></td>
                <td className="small">Economic and market effects, never given as a forecast.</td>
              </tr>
            </tbody>
          </table>
          <p className="tiny muted" style={{ marginTop: 6 }}>The trends on this page did not cause the simulated storm, and no financial forecast is derived from them. The simulator answers a different question with a different kind of evidence.</p>
          <button className="btn sm" style={{ marginTop: 6 }} onClick={openHouston} data-testid="to-simulator">
            Open the Disaster Simulator: Houston scenario
          </button>
        </div>
      </div>
    </aside>
  );
}
