import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../state/store";
import { useScenario } from "../state/derived";
import { useAnalysis, useCatalog, type Analysis } from "../data/trends";
import { CASES, crosscheckPoints, fmtBounds, toPoints, useCrosscheck, type CaseId } from "../state/trendWindow";
import { analyzeTrend, TREND_METHOD } from "../science/stats";
import { MODEL_CARD, SCENARIO_001 } from "../sim/hurricane";
import { buildCaseSeries, PairCharts } from "./CaseStudy";
import { SOURCES } from "./Methods";
import { Badge, Icon, Src } from "./ui";

const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "./";
export const DEMO_VIDEO = `${BASE}media/terrapulse-demo-final.mp4`;
const REPO = "https://github.com/crollila/terrapulse-next";
const ORIGINAL = "https://github.com/crollila/terrapulse";
const METHODOLOGY = `${ORIGINAL}/blob/main/docs/METHODOLOGY.md`;

const signed = (v: number, d: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`;
const fmtP = (p: number) => (p < 0.0001 ? "< 0.0001" : p < 0.001 ? p.toFixed(4) : p.toFixed(3));

/**
 * Contributors and what each one delivered, as recorded in the original project's README and
 * merged pull requests. Names appear as they do in that public record.
 */
const TEAM = [
  {
    name: "Case Ollila",
    role: "Team lead · product direction and engineering integration",
    did: "Directed the project, decided what was merged, reviewed and integrated every contribution, and specified this extension.",
    proof: { label: "Commit history and merges", url: `${ORIGINAL}/commits/main` },
    github: "crollila",
  },
  {
    name: "Kawtar Ag",
    role: "Remote sensing · NASA MODIS data engineering",
    did: "Selected, downloaded and processed the MODIS MOD13C2 vegetation data into the regional NDVI files used for the sixth variable.",
    proof: { label: "Pull request #8", url: `${ORIGINAL}/pull/8` },
    github: "kawtarAg",
  },
  {
    name: "Muhammad Rehan Farooq",
    role: "Dashboard visualization · regional comparison",
    did: "Built the side-by-side region comparison and the CSV download in the analytics dashboard.",
    proof: { label: "Pull request #11", url: `${ORIGINAL}/pull/11` },
    github: "rehanfarooq1911",
  },
  {
    name: "Derek",
    role: "Scientific research · independent validation",
    did: "Wrote the independent validation review that pointed to the documented 2005 discontinuity in MERRA-2 rainfall over the Amazon.",
    proof: { label: "Pull request #12", url: `${ORIGINAL}/pull/12` },
    github: "DerekKered044",
  },
] as const;

const NAV = [
  ["challenge", "The NASA challenge"],
  ["amazon", "Amazon rainfall"],
  ["alaska", "Northern Alaska"],
  ["live", "Live Earth"],
  ["simulation", "Disaster to economy"],
  ["team", "Orbital Alpha"],
  ["transparency", "Transparency"],
] as const;

function useCase(id: CaseId) {
  const c = CASES[id];
  const { data: a } = useAnalysis(c.regionId, c.variableId);
  const { data: cf } = useCrosscheck(c.second);
  const ki = a?.crosscheck?.known_issue as any;
  const series = useMemo(() => (a && cf ? buildCaseSeries(toPoints(a), crosscheckPoints(cf, c.regionId), c.diff, ki?.break_year ?? null) : null), [a, cf, c.regionId, c.diff, ki]);
  return { a, series, ki };
}

function Two({ a, mainName }: { a: Analysis; mainName: string }) {
  const cc = a.crosscheck!;
  const d = Math.max(a.variable.decimals, 2);
  return (
    <div className="sc-two" data-testid={`sc-numbers-${a.region.id}`}>
      <div>
        <div className="hero-num" style={{ color: "#1d6bff" }}>{signed(a.trend.ols.slope_per_decade, d)}</div>
        <div className="small"><strong>{mainName}</strong>, {a.variable.units} per decade</div>
        <div className="tiny muted">95% range {signed(a.trend.ols.ci_low, d)} to {signed(a.trend.ols.ci_high, d)}</div>
      </div>
      <div>
        <div className="hero-num" style={{ color: "#6e56cf" }}>{signed(cc.trend.slope_per_decade, d)}</div>
        <div className="small"><strong>{cc.dataset.name}</strong>, {a.variable.units} per decade</div>
        <div className="tiny muted">95% range {signed(cc.trend.ci_low, d)} to {signed(cc.trend.ci_high, d)}</div>
      </div>
    </div>
  );
}

export function Showcase() {
  const st = useStore.getState();
  const cat = useCatalog().data;
  const feeds = useStore((s) => s.feeds);
  const { result } = useScenario();
  const amazon = useCase("amazon");
  const alaska = useCase("alaska");
  const [video, setVideo] = useState(false);
  const [hoverA, setHoverA] = useState<number | null>(null);
  const [hoverB, setHoverB] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // the four answers, computed in the browser for the Amazon rainfall example
  const a = amazon.a;
  const r = useMemo(() => (a ? analyzeTrend(toPoints(a), a.trend.start, a.trend.end) : null), [a]);
  const ws = a?.windows_summary;

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && setVideo(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const go = (id: string) => root.current?.querySelector(`#sc-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const explore = () => st.setTab("trends");
  const openCase = (id: CaseId) => st.setCase(id);
  const houston = () => {
    st.setSim({ ...SCENARIO_001 });
    st.setSimPos(0);
    st.setHazard("hurricane");
    st.setTab("sim");
  };
  const events = (feeds.usgs?.events.length ?? 0) + (feeds.eonet?.events.length ?? 0);
  const anyCache = !!feeds.usgs?.meta.fromCache || !!feeds.eonet?.meta.fromCache;

  return (
    <div className="showcase" ref={root} data-testid="showcase">
      {/* ---------- 1. Hero ---------- */}
      <header className="sc-hero" aria-labelledby="sc-title">
        <div className="sc-hero-text">
          <div className="sc-kicker">Team Orbital Alpha · NASA Space Apps Challenge 2026</div>
          <h1 id="sc-title">TerraPulse</h1>
          <p className="sc-sub">Earth Intelligence. Economic Foresight.</p>
          <p className="sc-tag">See the change. Trace the impact.</p>
          <p className="sc-lead">
            Find a trend in decades of NASA Earth-system data, test whether to believe it, then explore what a hazard could reach on the ground. Every figure carries its source.
          </p>
          <div className="row wrap" style={{ gap: 10, marginTop: 18 }}>
            <button className="btn primary sc-btn" onClick={explore} data-testid="sc-explore">
              Explore TerraPulse
            </button>
            <button className="btn sc-btn" onClick={() => setVideo(true)} data-testid="sc-watch">
              {Icon.play} Watch 30-Second Demonstration
            </button>
          </div>
          <p className="tiny muted" style={{ marginTop: 14 }}>Challenge: Be an Earth System Trend Detective! · Not an official NASA product and not endorsed by NASA.</p>
        </div>
      </header>

      <nav className="sc-nav" aria-label="Sections">
        {NAV.map(([id, label]) => (
          <button key={id} className="btn sm" onClick={() => go(id)}>
            {label}
          </button>
        ))}
      </nav>

      {/* ---------- 2. The NASA challenge ---------- */}
      <section className="sc-section glass" id="sc-challenge" aria-labelledby="h-challenge">
        <div className="sc-eyebrow">The NASA challenge</div>
        <h2 id="h-challenge">Four questions, answered with real calculations</h2>
        <p className="sc-p">
          The challenge asks what is changing in the Earth system, where, how much, and whether the change is statistically significant. TerraPulse answers each one for six variables in eight study regions. The example below is computed in your browser right now, from the team's NASA series.
        </p>
        <div className="sc-grid4" data-testid="sc-four">
          <div className="answer">
            <div className="answer-q">What is changing?</div>
            <div className="answer-a"><strong>{a ? a.variable.name : "…"}</strong> <span className="muted">{a ? `(${a.variable.units})` : ""}</span></div>
            <p className="tiny muted">One of six variables: {cat ? cat.variables.map((v) => v.name.toLowerCase()).join(", ") : "…"}. Monthly values from NASA MERRA-2 (1981–2025) and MODIS NDVI (2000–2026).</p>
          </div>
          <div className="answer">
            <div className="answer-q">Where?</div>
            <div className="answer-a"><strong>{a ? a.region.name : "…"}</strong></div>
            <p className="tiny muted">{a ? `Study box ${fmtBounds(a.region.bbox)}.` : ""} One of eight region boxes on six continents. Results exist for these boxes only; no global surface is drawn from eight regions.</p>
          </div>
          <div className="answer">
            <div className="answer-q">How much?</div>
            <div className="answer-a"><strong className="num">{r && a ? `${signed(r.slopePerDecade, 3)} ${a.variable.units}` : "…"}</strong> per decade</div>
            <p className="tiny muted">{r ? `95% range ${signed(r.ciLow, 3)} to ${signed(r.ciHigh, 3)}, ${r.nMonths} months.` : ""} Least squares on deseasonalised monthly values, with Sen's slope as a robust check{r ? ` (${signed(r.senSlopePerDecade, 3)})` : ""}.</p>
          </div>
          <div className="answer">
            <div className="answer-q">Is it statistically significant?</div>
            <div className="answer-a"><strong style={{ color: "var(--blue-deep)" }}>{r ? (r.significant ? "Yes, in both corrected tests" : "Not in both tests") : "…"}</strong></div>
            <p className="tiny muted">{r ? `Adjusted t-test p ${fmtP(r.pValue)}; Mann–Kendall p ${fmtP(r.mkPValue)}.` : ""} Both tests are corrected for month-to-month persistence{ws ? `, and ${(100 * ws.share_same_direction).toFixed(0)}% of ${ws.n_windows} date windows point the same way` : ""}.</p>
          </div>
        </div>
        <p className="sc-p" style={{ marginTop: 14 }}>
          Then a fifth question the challenge implies: <strong>should you believe it?</strong> For rainfall and temperature the same trend is computed from an independent record, and the app says plainly whether the two agree.
        </p>
        <button className="btn primary sm" onClick={explore} data-testid="sc-open-detective">Open the Trend Detective</button>
      </section>

      {/* ---------- 3. Amazon ---------- */}
      <section className="sc-section glass" id="sc-amazon" aria-labelledby="h-amazon">
        <div className="sc-eyebrow">Featured investigation</div>
        <h2 id="h-amazon">The Amazon Rainfall Investigation</h2>
        <p className="sc-p">
          In one study box in the south-western Amazon, NASA's MERRA-2 shows rainfall falling steeply, and the result passes both significance tests. An independent record, GPCP, also shows a decline, at about half the rate. The team asked why.
        </p>
        {a && a.crosscheck && (
          <div className="sc-split">
            <div>
              <Two a={a} mainName="MERRA-2" />
              <div className="callout warn" style={{ marginTop: 12 }} data-testid="sc-amazon-verdict">
                <strong>{a.crosscheck.label}.</strong> The direction is supported by two records. The size is not independently confirmed.
              </div>
              {amazon.ki && (
                <div className="sc-facts" data-testid="sc-2005">
                  <div><span className="tiny muted">MERRA-2 minus GPCP, 1981–{amazon.ki.break_year - 1}</span><strong>{signed(amazon.ki.gap_before, 2)} mm/day</strong></div>
                  <div><span className="tiny muted">From {amazon.ki.break_year}</span><strong>{signed(amazon.ki.gap_after, 2)} mm/day</strong></div>
                  <div><span className="tiny muted">Fitted step in {amazon.ki.break_year}</span><strong>{signed(amazon.ki.step.value, 2)} mm/day</strong></div>
                  <div><span className="tiny muted">95% range of the step</span><strong>{signed(amazon.ki.step.ci_low, 2)} to {signed(amazon.ki.step.ci_high, 2)}</strong></div>
                </div>
              )}
              <h3 className="sc-h3">The documented 2005 discontinuity</h3>
              <p className="sc-p">NASA's own evaluation of MERRA-2 rainfall (Reichle et al. 2017) documents its gauge-corrected rainfall dropping against GPCP across the Amazon from 2005, when the number of rain gauges behind the correction falls sharply.</p>
              <h3 className="sc-h3">The team's investigation</h3>
              <p className="sc-p">A team member's validation review pointed to that paper. The team then tested it on this box: the two records agree within their ranges before 2005 and after it, and differ by a single step in 2005, which is also the best-fitting break year. So much of MERRA-2's faster decline probably comes from how the dataset was built.</p>
              <h3 className="sc-h3">Uncertainty and limits</h3>
              <ul className="sc-list">
                <li>One study box ({fmtBounds(a.region.bbox)}), not the Amazon as a whole.</li>
                <li>The data issue does not explain every change: GPCP also declines, and both records fall after 2005.</li>
                <li>No third rainfall record has been checked, and no cause is identified.</li>
                <li>Both trends are published full-record results, 1981–2025.</li>
              </ul>
              <div className="row wrap" style={{ marginTop: 10 }}>
                <button className="btn primary sm" onClick={() => openCase("amazon")} data-testid="sc-open-amazon">Open the interactive investigation</button>
                <a className="btn sm" href={`${ORIGINAL}/blob/main/SCIENTIFIC_VALIDATION.md`} target="_blank" rel="noopener noreferrer">Read the validation review</a>
              </div>
            </div>
            <div>
              {amazon.series ? <PairCharts s={amazon.series} units={a.variable.units} mainName="MERRA-2" secondName={a.crosscheck.dataset.name} breakYear={amazon.ki?.break_year ?? null} gaps={amazon.ki ? { before: amazon.ki.gap_before, after: amazon.ki.gap_after } : null} hover={hoverA} setHover={setHoverA} /> : <p className="muted">Loading the two records…</p>}
              <p className="tiny muted" style={{ marginTop: 6 }}>Top: each record's yearly departure from its own average, with its fitted trend. Bottom: MERRA-2 minus GPCP, with the mean before and from 2005. Move over a chart to read a year. Data: NASA MERRA-2 via NASA POWER; GPCP v2.3 via NOAA PSL.</p>
            </div>
          </div>
        )}
      </section>

      {/* ---------- 4. Alaska ---------- */}
      <section className="sc-section glass" id="sc-alaska" aria-labelledby="h-alaska">
        <div className="sc-eyebrow">The contrast</div>
        <h2 id="h-alaska">Northern Alaska: a trend that holds up</h2>
        <p className="sc-p">Same method, same tests, a different answer. In the northern Alaska box, MERRA-2 and NASA GISTEMP both show significant warming and their ranges overlap. It is the fastest warming of the eight regions in both records.</p>
        {alaska.a && alaska.a.crosscheck && (
          <div className="sc-split">
            <div>
              <Two a={alaska.a} mainName="MERRA-2" />
              <div className="callout info" style={{ marginTop: 12 }} data-testid="sc-alaska-verdict">
                <strong>{alaska.a.crosscheck.label}.</strong> Detected in one record and supported by another, with no documented data issue found.
              </div>
              <p className="sc-p" style={{ marginTop: 10 }}>Agreement is support, not proof: GISTEMP smooths over up to 1200 km, far coarser than the study box, and a significant trend says nothing about its cause.</p>
              <button className="btn primary sm" onClick={() => openCase("alaska")} data-testid="sc-open-alaska">Open the Alaska case</button>
            </div>
            <div>{alaska.series ? <PairCharts s={alaska.series} units={alaska.a.variable.units} mainName="MERRA-2" secondName={alaska.a.crosscheck.dataset.name} breakYear={null} gaps={null} hover={hoverB} setHover={setHoverB} /> : <p className="muted">Loading the two records…</p>}</div>
          </div>
        )}
      </section>

      {/* ---------- 5. Live Earth ---------- */}
      <section className="sc-section glass" id="sc-live" aria-labelledby="h-live">
        <div className="sc-eyebrow">Live World</div>
        <h2 id="h-live">Live Earth intelligence</h2>
        <div className="sc-split">
          <div>
            <p className="sc-p">An interactive 3D globe you can turn, zoom and search, with switchable layers in four groups. Every layer names its provider and shows when its newest observation was made.</p>
            <ul className="sc-list">
              <li><strong>Environmental events:</strong> earthquakes from the USGS and open wildfires, storms, ice and volcanoes from NASA EONET, fetched in your browser. {events > 0 ? `${events} events are loaded right now${anyCache ? " (from a saved snapshot, labelled as cached)" : ""}.` : ""}</li>
              <li><strong>NASA satellite imagery (GIBS):</strong> IMERG precipitation, MODIS land surface temperature and vegetation greenness, MUR sea surface temperature, and true colour.</li>
              <li><strong>Geographic layers:</strong> the eight trend study regions, U.S. refineries (EIA) and principal ports (USACE).</li>
              <li><strong>Source tracking:</strong> honest freshness labels. "Live feed" is reserved for data under one hour old; a snapshot is always labelled cached.</li>
            </ul>
            <button className="btn primary sm" onClick={() => st.setTab("world")} data-testid="sc-open-world">Open Live World</button>
          </div>
          <figure className="sc-fig">
            <img src={`${BASE}showcase/live-world.jpg`} alt="TerraPulse Live World: the globe with NASA sea-surface-temperature imagery and live event markers" loading="lazy" />
            <figcaption className="tiny muted">Screenshot of the application: sea surface temperature from NASA GIBS with live event markers.</figcaption>
          </figure>
        </div>
      </section>

      {/* ---------- 6. Simulation ---------- */}
      <section className="sc-section glass" id="sc-simulation" aria-labelledby="h-sim">
        <div className="sc-eyebrow">Disaster Simulator</div>
        <h2 id="h-sim">From a hazard to the economy, one evidence class at a time</h2>
        <ol className="sc-chain" aria-label="Chain from event to financial exposure">
          <li><span>Environmental event</span><Badge kind="HYPOTHETICAL" /></li>
          <li><span>Infrastructure exposure</span><Badge kind="MODELED" /></li>
          <li><span>Supply chains</span><Badge kind="SOURCED" /></li>
          <li><span>Commodities</span><Badge kind="SOURCED" /></li>
          <li><span>Financial exposure</span><Badge kind="RESEARCH HYPOTHESIS" /></li>
        </ol>
        <div className="sc-split">
          <div>
            <h3 className="sc-h3">Scenario 001: Houston Energy Shock</h3>
            <p className="sc-p">
              A <strong>hypothetical</strong> Category 5 hurricane crosses the upper Texas coast. A documented wind-field model moves along the track, and each real refinery and port is checked against it. With the default inputs, computed in your browser now:
            </p>
            <div className="sc-facts" data-testid="sc-houston">
              <div><span className="tiny muted">Refining capacity inside the footprint</span><strong>{(result.capacityInFootprintBpd / 1e6).toFixed(2)} million b/d</strong></div>
              <div><span className="tiny muted">Share of U.S. capacity in the EIA file</span><strong>{result.capacityShare != null ? `${(100 * result.capacityShare).toFixed(1)}%` : "n/a"}</strong></div>
              <div><span className="tiny muted">Refineries</span><strong>{result.refineriesInFootprint.length}</strong></div>
              <div><span className="tiny muted">Principal ports</span><strong>{result.portsInFootprint.length}</strong></div>
            </div>
            <div className="callout warn" style={{ marginTop: 12 }} data-testid="sc-sim-warning">
              <strong>Exposure is not a prediction of losses.</strong> The hurricane is hypothetical. Capacity inside the footprint is not a shutdown, lost production, a price or a return, and none of those is forecast.
            </div>
            <p className="sc-p" style={{ marginTop: 10 }}>The network then traces documented relationships: which company owns each exposed refinery (EIA), what refineries produce, and who uses those products. Market effects are shown only as research hypotheses.</p>
            <p className="sc-p"><strong>Tested honestly.</strong> Run against real storms, the wind-only model failed to reproduce Hurricane Harvey's refinery shutdowns, which came with extreme rainfall, and was inconclusive for Ike. It stays labelled experimental.</p>
            <button className="btn primary sm" onClick={houston} data-testid="sc-open-houston">Run the Houston scenario</button>
          </div>
          <div className="stack" style={{ gap: 12 }}>
            <figure className="sc-fig">
              <img src={`${BASE}showcase/houston-exposure.jpg`} alt="Disaster Simulator: modelled hurricane wind field over Houston-area refineries and ports" loading="lazy" />
              <figcaption className="tiny muted">Screenshot: the modelled wind field reaching refineries and ports on the Texas coast.</figcaption>
            </figure>
            <figure className="sc-fig">
              <img src={`${BASE}showcase/impact-network.jpg`} alt="Disaster Simulator: economic network from hurricane to refineries, operators, commodities and industries" loading="lazy" />
              <figcaption className="tiny muted">Screenshot: the economic network, with each link marked as sourced, modelled or a hypothesis.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ---------- 7. Team ---------- */}
      <section className="sc-section glass" id="sc-team" aria-labelledby="h-team">
        <div className="sc-eyebrow">Team</div>
        <h2 id="h-team">Meet Orbital Alpha</h2>
        <p className="sc-p">The people behind the science, with what each one delivered as recorded in the project repository.</p>
        <div className="sc-team" data-testid="sc-team-cards">
          {TEAM.map((m) => (
            <article className="sc-member" key={m.github}>
              <div className="sc-avatar" aria-hidden="true">{m.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
              <h3>{m.name}</h3>
              <div className="sc-role">{m.role}</div>
              <p className="small">{m.did}</p>
              <div className="stack" style={{ gap: 2 }}>
                <Src label={m.proof.label} url={m.proof.url} />
                <span className="src">GitHub: <a href={`https://github.com/${m.github}`} target="_blank" rel="noopener noreferrer">{m.github}</a></span>
              </div>
            </article>
          ))}
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>Contributions are taken from the original repository's README and merged pull requests. Presentation and demo support, and the registered roster, are listed on the team's page at spaceappschallenge.org. An AI coding assistant generated most of the code under the team lead's direction; see Scientific transparency.</p>
      </section>

      {/* ---------- 8. Transparency ---------- */}
      <section className="sc-section glass" id="sc-transparency" aria-labelledby="h-trans">
        <div className="sc-eyebrow">Scientific transparency</div>
        <h2 id="h-trans">Data, methods, limits and how AI was used</h2>
        <div className="sc-split">
          <div>
            <h3 className="sc-h3">Statistical method</h3>
            <p className="sc-p">{TREND_METHOD.name}</p>
            <p className="sc-p"><strong>Significance rule.</strong> {TREND_METHOD.significanceRule}</p>
            <h3 className="sc-h3">Model limits</h3>
            <ul className="sc-list">
              {TREND_METHOD.limitations.slice(0, 3).map((x) => <li key={x}>{x}</li>)}
              {MODEL_CARD.limitations.slice(0, 3).map((x) => <li key={x}>{x}</li>)}
            </ul>
            <h3 className="sc-h3">Use of AI</h3>
            <p className="sc-p">An AI coding assistant (Anthropic Claude, via Claude Code) generated most of the code, tests and documentation of both the original tool and this extension, under the team lead's direction. No figure is AI-generated: every number is read from the cited data or computed by documented formulas that run in your browser. The demonstration video is a recording of this application with the team lead's own voice. No AI-generated images or NASA branding are used.</p>
          </div>
          <div>
            <h3 className="sc-h3">Datasets</h3>
            <table className="tbl" data-testid="sc-sources">
              <tbody>
                {SOURCES.map((s) => (
                  <tr key={s.name}>
                    <td><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a><div className="tiny muted">{s.use}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="sc-h3">References</h3>
            <ul className="sc-list tiny">
              {TREND_METHOD.references.map((x) => <li key={x}>{x}</li>)}
              <li>Reichle, R. H., et al. (2017). Land Surface Precipitation in MERRA-2. Journal of Climate, 30(5), 1643–1664.</li>
              {MODEL_CARD.references.slice(0, 2).map((x) => <li key={x}>{x}</li>)}
            </ul>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <a className="btn sm" href="#methods">Full methods and sources</a>
              <a className="btn sm" href={`${REPO}/blob/main/MODEL_VALIDATION.md`} target="_blank" rel="noopener noreferrer">Model validation record</a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 9. Call to action ---------- */}
      <section className="sc-section sc-cta glass" id="sc-cta" aria-labelledby="h-cta">
        <h2 id="h-cta">See the change. Trace the impact.</h2>
        <p className="sc-p" style={{ maxWidth: 620, margin: "6px auto 0" }}>TerraPulse is free, open source and runs in your browser, with no account and no AI service behind it.</p>
        <div className="row wrap" style={{ justifyContent: "center", gap: 10, marginTop: 16 }} data-testid="sc-cta-links">
          <button className="btn primary sc-btn" onClick={explore}>Launch Application</button>
          <button className="btn sc-btn" onClick={() => setVideo(true)}>{Icon.play} Watch Demonstration</button>
          <a className="btn sc-btn" href={REPO} target="_blank" rel="noopener noreferrer">Explore Source Code</a>
          <a className="btn sc-btn" href={METHODOLOGY} target="_blank" rel="noopener noreferrer">Read Scientific Methodology</a>
        </div>
        <p className="tiny muted" style={{ marginTop: 16 }}>Original research: <a href={ORIGINAL} target="_blank" rel="noopener noreferrer">github.com/crollila/terrapulse</a> · MIT licensed · Map data © OpenStreetMap contributors · Not for emergency use and not investment advice.</p>
      </section>

      {video && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setVideo(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="TerraPulse demonstration video" style={{ width: "min(1100px, 100%)" }} data-testid="sc-video-modal">
            <div className="panel-head">
              <h2>TerraPulse in 30 seconds</h2>
              <button className="btn ghost sm icon-btn" aria-label="Close video" onClick={() => setVideo(false)}>{Icon.close}</button>
            </div>
            <div style={{ padding: "0 22px 22px" }}>
              <video src={DEMO_VIDEO} controls autoPlay playsInline preload="metadata" style={{ width: "100%", borderRadius: 14, background: "#0b1f3f", display: "block" }} data-testid="sc-video" />
              <p className="tiny muted" style={{ marginTop: 8 }}>A recording of this application, narrated by the team lead. <a href={DEMO_VIDEO} target="_blank" rel="noopener noreferrer">Open the video file</a></p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
