import { useRef, useState } from "react";
import { useStore } from "../state/store";
import { useScenario } from "../state/derived";
import { PARAM_BOUNDS, SAFFIR_SIMPSON, SCENARIO_001, saffirSimpsonCategory, validateParams, type HurricaneParams } from "../sim/hurricane";
import { vmaxForCategory, PLACES } from "../sim/command";
import { fmtBpd } from "../sim/graph";
import { buildScenarioReport } from "../sim/report";
import { niceName } from "../data/companies";
import { Badge, Icon, Slider } from "./ui";

const PRESETS = ["Galveston", "Corpus Christi", "Port Arthur", "New Orleans", "Tampa", "Miami"];
const isScenario001 = (p: HurricaneParams) => (Object.keys(SCENARIO_001) as (keyof HurricaneParams)[]).every((k) => p[k] === SCENARIO_001[k]);

export function SimPanel({ hiddenOnMobile, onMethods }: { hiddenOnMobile: boolean; onMethods: () => void }) {
  const sim = useStore((s) => s.sim);
  const setSim = useStore((s) => s.setSim);
  const picking = useStore((s) => s.pickingLandfall);
  const infraError = useStore((s) => s.infraError);
  const refCount = useStore((s) => s.refineries.length);
  const { result, graph, companies } = useScenario();
  const [io, setIo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const st = useStore.getState();
  const cat = saffirSimpsonCategory(sim.vmaxKt);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: "terrapulse-next", kind: "hurricane-scenario", version: 1, savedAt: new Date().toISOString(), note: "Hypothetical scenario inputs. Not a forecast.", params: sim }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `terrapulse-scenario-${cat ? `cat${cat}` : "ts"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    try {
      localStorage.setItem("terrapulse.scenario", JSON.stringify(sim));
      setIo("Scenario exported and saved in this browser.");
    } catch {
      setIo("Scenario exported.");
    }
  };
  const exportReport = () => {
    const st2 = useStore.getState();
    const text = buildScenarioReport({ result, graph, companies, refineryMeta: st2.refineryMeta, portMeta: st2.portMeta, generatedAt: new Date().toISOString() });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
    a.download = `terrapulse-scenario-report-${cat ? `cat${cat}` : "ts"}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setIo("Evidence report exported (Markdown).");
  };
  const importJson = async (file: File) => {
    try {
      const j = JSON.parse(await file.text());
      const p = { ...SCENARIO_001, ...(j.params ?? j) } as HurricaneParams;
      const clean = Object.fromEntries((Object.keys(SCENARIO_001) as (keyof HurricaneParams)[]).map((k) => [k, k === "inlandDecay" ? p[k] !== false : Number(p[k])])) as unknown as HurricaneParams;
      const errs = validateParams(clean);
      if (errs.length) throw new Error(errs.join("; "));
      setSim(clean);
      st.setSimPos(0);
      setIo("Scenario imported.");
    } catch (e) {
      setIo(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <aside className={`panel panel-left ${hiddenOnMobile ? "mobile-hide" : ""}`} aria-label="Scenario controls" data-testid="sim-panel">
      <div className="panel-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4>{isScenario001(sim) ? "Scenario 001" : "Custom scenario"}</h4>
          <h2>{isScenario001(sim) ? "Houston Energy Shock" : "Hurricane what-if"}</h2>
        </div>
        <Badge kind="HYPOTHETICAL" />
      </div>
      <div className="panel-body">
        <div className="section">
          <div className="row">
            <button
              className="btn primary"
              style={{ flex: 1, justifyContent: "center" }}
              data-testid="simulate-btn"
              disabled={!refCount}
              onClick={() => {
                st.setSimPos(0);
                st.startSim();
              }}
            >
              {Icon.play} Simulate {cat ? `Category ${cat} hurricane` : "tropical storm"}
            </button>
            <button className="btn icon-btn" title="Reset to Scenario 001" aria-label="Reset scenario" data-testid="sim-reset" onClick={() => st.resetSim()}>
              {Icon.reset}
            </button>
          </div>
          {infraError && <div className="callout danger" style={{ marginTop: 8 }}>Insufficient validated data: the infrastructure datasets failed to load ({infraError}).</div>}
        </div>

        <div className="section" data-testid="sim-summary">
          <h4>Exposure result</h4>
          <div className="hero-num" data-testid="capacity-in-footprint">
            {(result.capacityInFootprintBpd / 1e6).toFixed(2)}
            <span className="hero-unit">million b/d of refining capacity inside the {sim.exposureThresholdKt}-kt footprint</span>
          </div>
          <div className="row wrap" style={{ marginTop: 6 }}>
            <Badge kind="MODELED" />
            <span className="small muted">
              {result.capacityShare != null ? `${(result.capacityShare * 100).toFixed(1)}% of U.S. operable capacity` : "share n/a"} · {result.refineriesInFootprint.length} refineries · {result.portsInFootprint.length} ports
            </span>
          </div>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            Capacity exposed to the modelled wind, <strong>not</strong> lost production. No shutdown, damage or price is predicted.
            {result.footprintCapacityUnknown > 0 && ` ${result.footprintCapacityUnknown} exposed site(s) have no capacity in the EIA file and add nothing to the sum.`}
          </p>
          <div style={{ marginTop: 8 }}>
            {result.refineriesInFootprint.slice(0, 6).map((r) => (
              <button key={r.id} className="list-btn" onClick={() => st.select({ type: "refinery", id: r.id })}>
                <span className="grow">
                  {niceName(r.name)} <span className="muted">· {niceName(r.company).slice(0, 22)}</span>
                </span>
                <span className="num small">{r.capacityBpd != null ? fmtBpd(r.capacityBpd).replace(" b/d", "") : "n/a"}</span>
                <span className="num tiny muted">{r.peakWindKt.toFixed(0)} kt</span>
              </button>
            ))}
            {result.refineriesInFootprint.length === 0 && <p className="small muted">No refinery reaches the exposure threshold in this scenario.</p>}
          </div>
        </div>

        <div className="section stack">
          <h4>Hazard</h4>
          <div className="field">
            <label htmlFor="haz">Disaster type</label>
            <select id="haz" value="hurricane" onChange={() => undefined} data-testid="hazard-type">
              <option value="hurricane">Hurricane · wind-exposure model v0.1</option>
              <option disabled>Drought · not built yet</option>
              <option disabled>Wildfire · not built yet</option>
              <option disabled>Earthquake, flood, other · not built yet</option>
            </select>
          </div>
          <div className="seg" role="group" aria-label="Intensity category">
            {[0, 1, 2, 3, 4, 5].map((c) => (
              <button key={c} aria-pressed={cat === c} onClick={() => setSim({ vmaxKt: c === 0 ? 50 : vmaxForCategory(c) })} data-testid={`cat-${c}`} title={c === 0 ? "Tropical storm, 34–63 kt" : `Category ${c}: ${SAFFIR_SIMPSON[c - 1].minKt}${Number.isFinite(SAFFIR_SIMPSON[c - 1].maxKt) ? `–${SAFFIR_SIMPSON[c - 1].maxKt}` : "+"} kt`}>
                {c === 0 ? "TS" : `Cat ${c}`}
              </button>
            ))}
          </div>
          <Slider label="Maximum sustained wind" unit="kt" value={sim.vmaxKt} {...PARAM_BOUNDS.vmaxKt} onChange={(v) => setSim({ vmaxKt: v })} hint={`${(sim.vmaxKt * 1.15078).toFixed(0)} mph · ${cat ? `Category ${cat}` : "below hurricane strength"} on the Saffir-Simpson scale`} />
          <Slider label="Radius of maximum wind (storm size)" unit="km" value={sim.rmaxKm} {...PARAM_BOUNDS.rmaxKm} onChange={(v) => setSim({ rmaxKm: v })} hint={`Hurricane-force winds reach ${result.radiiKm.r64 ? result.radiiKm.r64.toFixed(0) + " km" : "nowhere"}; tropical-storm-force ${result.radiiKm.r34 ? result.radiiKm.r34.toFixed(0) + " km" : "nowhere"}`} />
          <Slider label="Wind-profile shape (Holland B)" value={sim.hollandB} {...PARAM_BOUNDS.hollandB} format={(v) => v.toFixed(2)} onChange={(v) => setSim({ hollandB: v })} hint="Lower values spread strong winds farther out." />
        </div>

        <div className="section stack">
          <h4>Track</h4>
          <div className="grid2">
            <div className="field">
              <label htmlFor="lat">Landfall latitude</label>
              <input id="lat" className="input num" type="number" step={0.05} min={-60} max={60} value={sim.landfallLat} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setSim({ landfallLat: Math.max(-60, Math.min(60, e.target.valueAsNumber)) })} />
            </div>
            <div className="field">
              <label htmlFor="lon">Landfall longitude</label>
              <input id="lon" className="input num" type="number" step={0.05} min={-180} max={180} value={sim.landfallLon} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setSim({ landfallLon: Math.max(-180, Math.min(180, e.target.valueAsNumber)) })} />
            </div>
          </div>
          <div className="row wrap">
            <button className="btn sm" aria-pressed={picking} onClick={() => st.setPickingLandfall(!picking)} data-testid="pick-landfall">
              {picking ? "Click the globe…" : "Pick on globe"}
            </button>
            <select
              aria-label="Landfall presets"
              style={{ width: "auto", flex: 1 }}
              value=""
              onChange={(e) => {
                const p = PLACES.find((x) => x.name === e.target.value);
                if (p) {
                  setSim({ landfallLat: p.lat, landfallLon: p.lon });
                  st.flyTo({ lat: p.lat + 0.6, lon: p.lon, zoom: 5.6 });
                }
              }}
            >
              <option value="">Move to…</option>
              {PRESETS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </div>
          <Slider label="Heading (direction of travel)" unit="°" value={sim.headingDeg} {...PARAM_BOUNDS.headingDeg} onChange={(v) => setSim({ headingDeg: v })} hint="0° north, 90° east, 270° west." />
          <Slider label="Forward speed" unit="km/h" value={sim.forwardSpeedKmh} {...PARAM_BOUNDS.forwardSpeedKmh} onChange={(v) => setSim({ forwardSpeedKmh: v })} hint="Sets how long each site stays inside the wind field." />
          <div className="field">
            <div className="row">
              <span className="small" style={{ fontWeight: 600, color: "var(--navy)", flex: 1 }}>Weaken after landfall</span>
              <button type="button" role="switch" aria-checked={sim.inlandDecay} aria-label="Weaken after landfall" className="switch" data-testid="decay-toggle" onClick={() => setSim({ inlandDecay: !sim.inlandDecay })} />
            </div>
            <div className="tiny muted">Kaplan–DeMaria (1995) inland wind decay, starting at the landfall point. Off means no weakening: an upper bound.</div>
          </div>
          {sim.inlandDecay && <Slider label="Decay rate over land (assumption)" unit="per h" value={sim.decayRatePerH} {...PARAM_BOUNDS.decayRatePerH} format={(v) => v.toFixed(3)} onChange={(v) => setSim({ decayRatePerH: v })} hint="Default 0.095 per hour, the value commonly quoted for U.S. landfalls south of 37°N; not re-verified in this build." />}
        </div>

        <div className="section stack">
          <h4>Vulnerability assumption</h4>
          <div className="field">
            <span className="small" style={{ fontWeight: 600, color: "var(--navy)" }}>Count an asset as exposed when modelled wind reaches</span>
            <div className="seg" role="group" aria-label="Exposure threshold">
              {[34, 50, 64, 96].map((k) => (
                <button key={k} aria-pressed={sim.exposureThresholdKt === k} onClick={() => setSim({ exposureThresholdKt: k })} data-testid={`thr-${k}`}>
                  {k} kt
                </button>
              ))}
            </div>
            <div className="tiny muted">34 kt tropical-storm force · 64 kt hurricane force · 96 kt major-hurricane force. This is an assumption you choose; no validated damage curve is applied.</div>
          </div>
        </div>

        <div className="section stack">
          <div className="row wrap">
            <button className="btn sm" onClick={exportJson} data-testid="export-scenario">
              Export JSON
            </button>
            <button className="btn sm" onClick={() => fileRef.current?.click()}>
              Import JSON
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
            <button className="btn sm" onClick={exportReport} data-testid="export-report" title="Every computed figure with its evidence class and source, as Markdown">
              Evidence report
            </button>
            <button className="btn ghost sm" onClick={onMethods}>
              Model card
            </button>
          </div>
          {io && <div className="tiny muted" role="status">{io}</div>}
          <p className="tiny muted">Deterministic: the same inputs always give the same outputs. Experimental model: in a hindcast it failed to reproduce Hurricane Harvey's refinery shutdowns (a rainfall event) and was inconclusive for Ike. See the model card.</p>
        </div>
      </div>
    </aside>
  );
}
