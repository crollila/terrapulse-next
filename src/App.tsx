import { useEffect, useMemo, useState } from "react";
import { Globe } from "./components/Globe";
import { LayerPanel } from "./components/LayerPanel";
import { Inspector } from "./components/Inspector";
import { TrendExplorer } from "./components/TrendExplorer";
import { SimPanel } from "./components/SimPanel";
import { Timeline } from "./components/Timeline";
import { SimWorkspace } from "./components/SimWorkspace";
import { DroughtLab } from "./components/DroughtLab";
import { RainfallLab } from "./components/RainfallLab";
import { TrendDetective } from "./components/TrendDetective";
import { CaseStudy } from "./components/CaseStudy";
import { Methods } from "./components/Methods";
import { Icon } from "./components/ui";
import { useStore } from "./state/store";
import { FEED_IDS, loadFeed } from "./data/hazards";
import { loadInfrastructure } from "./data/infrastructure";
import { parseCommand, type Place } from "./sim/command";
import { SCENARIO_001 } from "./sim/hurricane";
import { useCatalog } from "./data/trends";

function CommandBar() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const cat = useCatalog().data;
  const extra = useMemo<Place[]>(
    () => (cat?.regions ?? []).map((r) => ({ name: r.short_name, lat: (r.bbox[1] + r.bbox[3]) / 2, lon: (r.bbox[0] + r.bbox[2]) / 2, zoom: 4.2, aliases: [r.name.toLowerCase()] })),
    [cat],
  );
  const run = () => {
    const st = useStore.getState();
    const c = parseCommand(text, extra);
    setMsg(c.label);
    if (c.kind === "fly") st.flyTo({ lat: c.lat, lon: c.lon, zoom: c.zoom });
    else if (c.kind === "simulate") {
      st.setSim({ ...(c.vmaxKt ? { vmaxKt: c.vmaxKt } : {}), ...(c.lat !== undefined && c.lon !== undefined ? { landfallLat: c.lat, landfallLon: c.lon } : {}) });
      st.setSimPos(0);
      st.setTab("sim");
      setTimeout(() => useStore.getState().startSim(), 2400);
    } else if (c.kind === "trend") {
      st.setTab("world");
      st.setTrend({ ...(c.regionId ? { regionId: c.regionId } : {}), ...(c.variableId ? { variableId: c.variableId } : {}) });
      st.setTrendOpen(true);
    } else if (c.kind === "reset") {
      st.resetSim();
      st.resetWorkspace();
    }
  };
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <form
      className="cmd"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        run();
      }}
    >
      {Icon.search}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Go to a place or 29.7, -95.3 · “simulate category 5 hurricane near Houston”"
        aria-label="Search places or enter a command"
        data-testid="command-input"
      />
      {msg && (
        <div className="cmd-msg" role="status">
          {msg}
        </div>
      )}
    </form>
  );
}

export function App() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  const mapError = useStore((s) => s.mapError);
  const selection = useStore((s) => s.selection);
  const pinned = useStore((s) => s.pinned);
  const trendOpen = useStore((s) => s.trendOpen);
  const hazard = useStore((s) => s.hazard);
  const caseId = useStore((s) => s.caseId);
  const [methods, setMethods] = useState(false);
  const [mobilePane, setMobilePane] = useState<"controls" | "analysis">("controls");

  useEffect(() => {
    const st = useStore.getState();
    for (const id of FEED_IDS) loadFeed(id).then(st.setFeed, (e: Error) => useStore.setState((s) => ({ feedErrors: [...s.feedErrors, `${id}: ${e.message}`] })));
    loadInfrastructure().then(st.setInfra, (e: Error) => st.setInfraError(e.message));
    const onHash = () => location.hash === "#methods" && setMethods(true);
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const runFlagship = () => {
    const st = useStore.getState();
    st.setSim({ ...SCENARIO_001 });
    st.setSimPos(0);
    st.setTab("sim");
    setTimeout(() => useStore.getState().startSim(), 2600);
  };

  return (
    <div className={`app ${tab}`}>
      <header className="topbar">
        <div className="brand">
          {Icon.logo}
          <div>
            <div className="brand-name">TerraPulse</div>
            <div className="brand-tag">Earth intelligence. Economic foresight.</div>
          </div>
        </div>
        <div className="tabs" role="tablist" aria-label="Views">
          <button className="tab" role="tab" aria-selected={tab === "trends"} onClick={() => setTab("trends")} data-testid="tab-trends">
            Earth-System Trends
          </button>
          <button className="tab" role="tab" aria-selected={tab === "world"} onClick={() => setTab("world")} data-testid="tab-world">
            Live World
          </button>
          <button className="tab" role="tab" aria-selected={tab === "sim"} onClick={() => setTab("sim")} data-testid="tab-sim">
            Disaster Simulator
          </button>
        </div>
        <CommandBar />
        <div className="top-actions">
          <button className="btn" onClick={() => setMethods(true)} data-testid="methods-btn">
            Methods <span className="label">&amp; sources</span>
          </button>
          <button
            className="btn ghost icon-btn"
            title="Reset workspace"
            aria-label="Reset workspace"
            onClick={() => {
              useStore.getState().resetWorkspace();
              if (tab === "sim") useStore.getState().resetSim();
            }}
          >
            {Icon.reset}
          </button>
        </div>
      </header>

      <main className="stage">
        {mapError ? (
          <div className="globe-wrap">
            <div className="fallback">
              <div className="callout warn" style={{ maxWidth: 460 }}>
                <strong>The 3D globe could not start on this device.</strong>
                <p style={{ marginTop: 6 }}>WebGL reported: {mapError}. The data panels, trend explorer and simulator calculations still work without the map.</p>
              </div>
            </div>
          </div>
        ) : (
          <Globe />
        )}

        {tab === "trends" ? (
          <>
            <TrendDetective />
            {caseId ? <CaseStudy id={caseId} /> : <TrendExplorer />}
          </>
        ) : tab === "world" ? (
          <>
            <LayerPanel />
            {trendOpen ? <TrendExplorer /> : (selection || pinned.length > 0) && <Inspector />}
            {!trendOpen && !selection && (
              <div className="hint">
                <span>
                  <strong>Scenario 001</strong> · Houston Energy Shock
                </span>
                <button className="btn primary sm" onClick={runFlagship} data-testid="run-flagship">
                  {Icon.play} Simulate Category 5 hurricane
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="seg mobile-switch" role="group" aria-label="Panels">
              <button aria-pressed={mobilePane === "controls"} onClick={() => setMobilePane("controls")}>
                Scenario
              </button>
              <button aria-pressed={mobilePane === "analysis"} onClick={() => setMobilePane("analysis")}>
                Impact analysis
              </button>
            </div>
            {hazard === "drought" ? (
              <DroughtLab onMethods={() => setMethods(true)} pane={mobilePane} />
            ) : hazard === "rainfall" ? (
              <RainfallLab onMethods={() => setMethods(true)} pane={mobilePane} />
            ) : (
              <>
                <Timeline />
                <SimPanel hiddenOnMobile={mobilePane !== "controls"} onMethods={() => setMethods(true)} />
                <SimWorkspace hiddenOnMobile={mobilePane !== "analysis"} />
              </>
            )}
          </>
        )}
      </main>
      {methods && (
        <Methods
          onClose={() => {
            setMethods(false);
            if (location.hash === "#methods") history.replaceState(null, "", location.pathname + location.search);
          }}
        />
      )}
    </div>
  );
}
