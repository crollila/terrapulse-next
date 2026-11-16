import { useEffect } from "react";
import { MODEL_CARD } from "../sim/hurricane";
import { DROUGHT_CARD } from "../sim/drought";
import { RAINFALL_CARD } from "../sim/rainfall";
import { RCLIPER_CARD } from "../sim/rcliper";
import { WILDFIRE_CARD } from "../sim/wildfire";
import { TREND_METHOD } from "../science/stats";
import { Badge, Icon } from "./ui";

const SOURCES: { name: string; use: string; terms: string; url: string }[] = [
  { name: "NASA MERRA-2 (GMAO) via NASA POWER API", use: "Monthly temperature, precipitation, humidity, wind and soil wetness, 1981–2025, eight regions", terms: "NASA open data; cite", url: "https://power.larc.nasa.gov/" },
  { name: "NASA MODIS/Terra MOD13C2 v6.1 (LP DAAC)", use: "Monthly vegetation greenness (NDVI), 2000–2026", terms: "NASA open data; cite", url: "https://doi.org/10.5067/MODIS/MOD13C2.061" },
  { name: "NASA GISTEMP v4 and GPCP v2.3 (via NOAA PSL)", use: "Independent second opinions on temperature and rainfall trends", terms: "Open; cite", url: "https://psl.noaa.gov/" },
  { name: "NASA EONET v3", use: "Open natural events (wildfires, storms, ice, volcanoes)", terms: "NASA open data", url: "https://eonet.gsfc.nasa.gov/" },
  { name: "NASA GIBS", use: "Imagery layers: IMERG precipitation, MODIS land surface temperature, NDVI, true colour, MUR sea surface temperature, Blue Marble", terms: "NASA open data; acknowledge GIBS", url: "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api" },
  { name: "USGS Earthquake Hazards Program", use: "Magnitude 4.5+ earthquakes, past 7 days", terms: "U.S. Government, public domain", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php" },
  { name: "U.S. EIA Refinery Capacity Report (1 Jan 2026) and refinery map layer", use: "Refinery locations, operators, owners and crude distillation capacity", terms: "U.S. Government, public domain", url: "https://www.eia.gov/petroleum/refinerycapacity/" },
  { name: "USACE Waterborne Commerce / BTS NTAD Principal Ports (CY 2023)", use: "Port locations and annual tonnage", terms: "U.S. Government, public domain", url: "https://www.arcgis.com/home/item.html?id=e3b6065cce144be8a13a59e03c4195fe" },
  { name: "U.S. EIA petroleum history series and Today in Energy", use: "Prices, refinery inputs and utilization around Hurricane Harvey (2017)", terms: "U.S. Government, public domain", url: "https://www.eia.gov/petroleum/" },
  { name: "U.S. DOE Harvey event reports; NHC tropical cyclone reports", use: "Refinery shutdown figures; landfall facts; Saffir-Simpson scale", terms: "U.S. Government, public domain", url: "https://www.nhc.noaa.gov/data/tcr/" },
  { name: "NOAA NWS/NCEP Stage IV precipitation analysis", use: "Observed daily rainfall for Hurricane Harvey (radar and rain gauges, about 4 km)", terms: "U.S. Government, public domain", url: "https://water.noaa.gov/precip" },
  { name: "NOAA Atlas 14 (HDSC Precipitation Frequency Data Server)", use: "Rainfall depths by duration and recurrence interval at each site, with 90% bounds", terms: "U.S. Government, public domain", url: "https://hdsc.nws.noaa.gov/pfds/" },
  { name: "NASA GPM IMERG and MERRA-2 daily rainfall via NASA POWER", use: "Second and third rainfall estimates at each site during Harvey", terms: "NASA open data; cite", url: "https://power.larc.nasa.gov/" },
  { name: "USGS Flood Event Data (Short-Term Network)", use: "2,364 surveyed high-water marks from Hurricane Harvey", terms: "U.S. Government, public domain", url: "https://apps.usgs.gov/stnweb" },
  { name: "USGS 3DEP Elevation Point Query Service", use: "Ground elevation at each refinery and port point", terms: "U.S. Government, public domain", url: "https://apps.nationalmap.gov/epqs/" },
  { name: "FEMA National Flood Hazard Layer", use: "Regulatory flood zone at each refinery and port point", terms: "U.S. Government, public domain", url: "https://www.fema.gov/flood-maps/national-flood-hazard-layer" },
  { name: "NOAA NCEI GHCN-Daily", use: "Rain-gauge totals used to check the Stage IV analysis", terms: "U.S. Government, public domain", url: "https://www.ncei.noaa.gov/products/land-based-station/global-historical-climatology-network-daily" },
  { name: "U.S. EIA Refinery Capacity Report, 1 January 2017", use: "The refinery fleet and capacities at the time of Harvey, for the hindcast", terms: "U.S. Government, public domain", url: "https://www.eia.gov/petroleum/refinerycapacity/archive/2017/refcap2017.php" },
  { name: "NIFC Open Data (WFIGS, perimeter history, GeoMAC archive)", use: "Observed wildfire perimeters, including the Camp Fire's dated perimeters", terms: "U.S. Government interagency data; no warranty", url: "https://data-nifc.opendata.arcgis.com/" },
  { name: "NASA FIRMS, VIIRS 375 m active fire archive", use: "Satellite fire detections for three historical fires", terms: "NASA open data; cite FIRMS", url: "https://firms.modaps.eosdis.nasa.gov/" },
  { name: "gridMET (Abatzoglou 2013) and U.S. Drought Monitor", use: "Fire-danger indices, wind and humidity at each fire's origin; county drought class", terms: "gridMET: copyright waived; USDM: use with attribution", url: "https://www.climatologylab.org/gridmet.html" },
  { name: "U.S. EIA power plant and natural gas pipeline map layers; HIFLD transmission lines (archived)", use: "Energy infrastructure inside or near fire perimeters", terms: "EIA: public domain; HIFLD copy: derived lengths only", url: "https://www.eia.gov/maps/layer_info-m.php" },
  { name: "OpenFreeMap / OpenStreetMap contributors", use: "Vector base map: coastlines, borders, roads, place names", terms: "ODbL; attribution shown on the map", url: "https://openfreemap.org/" },
  { name: "Natural Earth (world-atlas)", use: "Offline fallback land outlines", terms: "Public domain", url: "https://www.naturalearthdata.com/" },
];

export function Methods({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Methods and sources" data-testid="methods-modal">
        <div className="panel-head">
          <h2>Methods, sources and limits</h2>
          <button className="btn ghost sm icon-btn" aria-label="Close" onClick={onClose}>
            {Icon.close}
          </button>
        </div>
        <div className="panel-body prose">
          <h3>How to read every figure</h3>
          <table className="tbl">
            <tbody>
              <tr><td><Badge kind="OBSERVED" /></td><td>Taken from a documented observation or official record, with its source.</td></tr>
              <tr><td><Badge kind="HISTORICAL" /></td><td>A documented value from the past, shown with its date.</td></tr>
              <tr><td><Badge kind="MODELED" /></td><td>Computed by a stated formula from stated inputs. Reproducible.</td></tr>
              <tr><td><Badge kind="HYPOTHETICAL" /></td><td>A what-if input you choose. Never a forecast of a real event.</td></tr>
              <tr><td><Badge kind="RESEARCH HYPOTHESIS" /></td><td>A plausible relationship that is not quantified or validated here. No number is attached.</td></tr>
            </tbody>
          </table>
          <p style={{ marginTop: 8 }}>Where data are missing the app says <em>Insufficient validated data</em> instead of estimating. Freshness labels follow fixed rules: LIVE FEED means fetched this session with a newest observation under one hour old; RECENT under 48 hours; DELAYED under 30 days; CACHED means a saved snapshot.</p>

          <h3>{MODEL_CARD.name}</h3>
          <p><strong>Status:</strong> {MODEL_CARD.status}.</p>
          <p style={{ marginTop: 6 }}><strong>Inputs</strong></p>
          <ul>{MODEL_CARD.inputs.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><strong>Formulas</strong></p>
          <pre className="formula">{MODEL_CARD.formula.join("\n")}</pre>
          <p><strong>Assumptions</strong></p>
          <ul>{MODEL_CARD.assumptions.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><strong>Limitations</strong></p>
          <ul>{MODEL_CARD.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><strong>How it does on real storms (hindcast)</strong></p>
          <ul data-testid="hindcast">{MODEL_CARD.hindcast.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="small">Method and full tables: <a href="https://github.com/crollila/terrapulse-next/blob/main/research/HINDCAST.md" target="_blank" rel="noopener noreferrer">research/HINDCAST.md</a>. Best tracks: NOAA NHC HURDAT2.</p>
          <p><strong>Uncertainty:</strong> {MODEL_CARD.uncertainty}</p>
          <p><strong>Timeline:</strong> the storm window (48 hours before to 30 hours after landfall) is computed from the track and wind field. The later stages are an illustrative sequence without forecast timing.</p>
          <p><strong>Economic network:</strong> each link is labelled as documented, modelled or a research hypothesis and carries its source. The one geographic arc (Houston to New York Harbor) stands for the Colonial Pipeline, which EIA describes as carrying up to 2.5 million b/d from Houston as far north as New York Harbor; the arc is a schematic great circle, not the pipeline route, and implies no modelled flow.</p>
          <p><strong>Portfolio screen:</strong> exposure share = a company's refining capacity inside the footprint ÷ its total U.S. refining capacity (EIA). Portfolio index = Σ weight × exposure share. It measures physical exposure only.</p>
          <ul>{MODEL_CARD.references.map((x) => <li key={x}>{x}</li>)}</ul>

          <h3>{RAINFALL_CARD.name}</h3>
          <p><strong>Status:</strong> {RAINFALL_CARD.status}</p>
          <p style={{ marginTop: 6 }}><strong>Inputs</strong></p>
          <ul>{RAINFALL_CARD.inputs.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><strong>What is computed</strong></p>
          <pre className="formula">{RAINFALL_CARD.formula.join("\n")}</pre>
          <p><strong>Limitations</strong></p>
          <ul>{RAINFALL_CARD.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><strong>How it does on Hurricane Harvey (hindcast)</strong></p>
          <ul data-testid="rain-hindcast-card">{RAINFALL_CARD.hindcast.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><strong>Uncertainty:</strong> {RAINFALL_CARD.uncertainty}</p>
          <p className="small">Method, tables and data gaps: <a href="https://github.com/crollila/terrapulse-next/blob/main/research/RAINFALL_FLOOD.md" target="_blank" rel="noopener noreferrer">research/RAINFALL_FLOOD.md</a>.</p>
          <ul>{RAINFALL_CARD.references.map((x) => <li key={x}>{x}</li>)}</ul>

          <h3>{RCLIPER_CARD.name}</h3>
          <p><strong>Status:</strong> {RCLIPER_CARD.status}</p>
          <pre className="formula">{RCLIPER_CARD.formula.join("\n")}</pre>
          <ul>{RCLIPER_CARD.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
          <ul>{RCLIPER_CARD.references.map((x) => <li key={x}>{x}</li>)}</ul>

          <h3>{WILDFIRE_CARD.name}</h3>
          <p><strong>Status:</strong> {WILDFIRE_CARD.status}</p>
          <p style={{ marginTop: 6 }}><strong>Inputs</strong></p>
          <ul>{WILDFIRE_CARD.inputs.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><strong>What is computed</strong></p>
          <pre className="formula">{WILDFIRE_CARD.formula.join("\n")}</pre>
          <p><strong>Limitations</strong></p>
          <ul>{WILDFIRE_CARD.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><strong>Consistency of the record</strong></p>
          <ul data-testid="fire-validation-card">{WILDFIRE_CARD.validation.map((x) => <li key={x}>{x}</li>)}</ul>
          <p className="small">Method, tables and data gaps: <a href="https://github.com/crollila/terrapulse-next/blob/main/research/WILDFIRE.md" target="_blank" rel="noopener noreferrer">research/WILDFIRE.md</a>.</p>
          <ul>{WILDFIRE_CARD.references.map((x) => <li key={x}>{x}</li>)}</ul>

          <h3>{DROUGHT_CARD.name}</h3>
          <p><strong>Status:</strong> {DROUGHT_CARD.status}.</p>
          <p style={{ marginTop: 6 }}><strong>Inputs</strong></p>
          <ul>{DROUGHT_CARD.inputs.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><strong>Formulas</strong></p>
          <pre className="formula">{DROUGHT_CARD.formula.join("\n")}</pre>
          <p><strong>Limitations</strong></p>
          <ul>{DROUGHT_CARD.limitations.map((x) => <li key={x}>{x}</li>)}</ul>
          <ul>{DROUGHT_CARD.references.map((x) => <li key={x}>{x}</li>)}</ul>

          <h3>Trend statistics</h3>
          <p>{TREND_METHOD.name}</p>
          <p style={{ marginTop: 6 }}><strong>Null hypothesis:</strong> {TREND_METHOD.nullHypothesis}</p>
          <p style={{ marginTop: 6 }}><strong>Persistence:</strong> {TREND_METHOD.autocorrelation}</p>
          <p style={{ marginTop: 6 }}>The statistics were ported from the team's Python pipeline to run in your browser. Automated tests confirm the port reproduces the published results for all 48 region and variable combinations.</p>

          <h3>Data sources and terms</h3>
          <table className="tbl">
            <thead><tr><th>Source</th><th>Used for</th><th>Terms</th></tr></thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.name}>
                  <td><a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a></td>
                  <td>{s.use}</td>
                  <td>{s.terms}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>About</h3>
          <p>TerraPulse Next extends Team Orbital Alpha's NASA Space Apps 2026 project <a href="https://github.com/crollila/terrapulse" target="_blank" rel="noopener noreferrer">TerraPulse</a> ("Be an Earth System Trend Detective"). It is not an official NASA product and is not endorsed by NASA. It is not for emergency use and is not investment advice.</p>
          <p style={{ marginTop: 6 }}><strong>AI disclosure:</strong> the code, tests and text of this application were generated with an AI coding assistant (Anthropic Claude, via Claude Code) under human direction. No figure is AI-generated: every number is read from the cited data or computed by the documented formulas, and the calculations run in your browser without any AI service. The command bar is a keyword parser, not an AI model.</p>
        </div>
      </div>
    </div>
  );
}
