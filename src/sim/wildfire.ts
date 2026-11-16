/**
 * Wildfire record: OBSERVED perimeters and OBSERVED satellite fire detections of historical fires,
 * and a proximity screen of infrastructure against the mapped final perimeter. Pure and deterministic.
 *
 * There is no fire-spread model here. Nothing in this module predicts where a fire will go: the
 * timeline replays what was mapped and what satellites detected. The only assumption a user chooses
 * is a distance from the final perimeter within which a site is listed as "near the fire".
 *
 * Data: public/data/wildfire/*.json, built by research/scripts/build_wildfires.py.
 */
import type { EvidenceClass } from "../data/types";
import type { Port, Refinery } from "../data/types";
import type { EdgeBasis, ExposureSet, Fact, GEdge, GNode } from "./graph";
import { niceName } from "../data/companies";

export const ACRES_PER_KM2 = 247.105381;
/** Nominal VIIRS I-band pixel size at nadir, km (FIRMS: "for VIIRS the pixel is approximately 375 m"). */
export const VIIRS_PIXEL_KM = 0.375;

export type Ring = [number, number][];
export interface PolygonGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: Ring[] | Ring[][];
}
export interface LineGeometry {
  type: "LineString" | "MultiLineString";
  coordinates: [number, number][] | [number, number][][];
}

export interface FireSource {
  provider: string;
  dataset: string;
  sourceUrl?: string | null;
  landingPage?: string;
  retrievedAt?: string | null;
  license?: string;
  caveat?: string;
  [k: string]: unknown;
}

export interface FirePlant {
  id: string;
  name: string | null;
  operator: string | null;
  primarySource: string | null;
  technology: string | null;
  capacityMw: number | null;
  lat: number;
  lon: number;
  /** Distance from the final perimeter, km; 0 when inside it. */
  kmFromPerimeter: number;
  inside: boolean;
}

export interface FireNearSite {
  id: string;
  kind: "refinery" | "port";
  name: string;
  operator: string | null;
  capacityBpd: number | null;
  kmFromPerimeter: number;
  inside: boolean;
}

export interface FireFact {
  label: string;
  value: string;
  quote: string | null;
  source: string;
  url: string;
  evidence: EvidenceClass;
  note?: string;
  counts?: Record<string, number>;
}

export interface FireEvent {
  meta: {
    id: string;
    name: string;
    place: string;
    year: number;
    builtAt: string;
    /** Discovery or start time on the administrative record, ISO UTC. */
    start: string;
    contained: string | null;
    ignition: { lat: number; lon: number };
    causeOnRecord: string | null;
    admin: FireSource & { reportedAcres?: number | null; location?: string | null };
    gaps: string[];
    sources: Record<string, FireSource | null>;
  };
  perimeter: { geometry: PolygonGeometry; bbox: [number, number, number, number]; reportedAcres: number; areaOfDisplayedShapeAcres: number; areaKm2: number; mapped: { date: string | null; method: string | null; sourceAgency: string | null } };
  progression: { time: string; acres: number | null; method: string | null; geometry: PolygonGeometry }[];
  detections: {
    fields: string[];
    /** [minutesFromStart, lat, lon, frpMw, confidence, dayNight, satelliteIndex, kmOutsideFinalPerimeter] */
    rows: [number, number, number, number | null, string | null, string | null, number, number][];
    satellites: string[];
    overpasses: { time: string; satellite: string; count: number }[];
    count: number;
    withinOnePixelOfFinalPerimeter: number;
    within2kmOfFinalPerimeter: number;
  };
  conditions: {
    point: { lat: number; lon: number };
    gridmet: Record<string, { label: string; units: string; dates: string[]; values: (number | null)[] }>;
    power: ({ dates: string[] } & Record<string, (number | null)[] | string[]>) | null;
    drought: { county: string; mapDate: string; validStart: string; validEnd: string; percentOfCountyAtOrAbove: Record<string, number>; percentNone: number } | null;
  };
  infrastructure: {
    powerPlants: FirePlant[];
    gasPipelines: { operator: string | null; type: string | null; kmInside: number; kmFromPerimeter: number; geometry: LineGeometry }[];
    gasPipelineSummary: { operator: string | null; type: string | null; kmInside: number; kmFromPerimeter: number; segments: number }[];
    transmission: { linesInBoundingBox: number; linesCrossingPerimeter: number; kmInsidePerimeter: number; kmInsideByVoltageClass: Record<string, number>; kmInsideByOwner: Record<string, number>; truncated: boolean } | null;
    refineriesAndPorts: FireNearSite[];
  };
  facts: FireFact[];
}

/* ---------- geometry ---------- */

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Polygons of a geometry as arrays of rings (outer ring first, then holes). */
export function polygonsOf(g: PolygonGeometry): Ring[][] {
  return g.type === "Polygon" ? [g.coordinates as Ring[]] : (g.coordinates as Ring[][]);
}

/** Even-odd point-in-polygon test, holes respected. Longitude and latitude are treated as planar, which is accurate at these scales. */
export function pointInGeometry(lon: number, lat: number, g: PolygonGeometry): boolean {
  for (const poly of polygonsOf(g)) {
    if (!poly.length || !inRing(lon, lat, poly[0])) continue;
    let inHole = false;
    for (let k = 1; k < poly.length; k++) if (inRing(lon, lat, poly[k])) inHole = true;
    if (!inHole) return true;
  }
  return false;
}

/**
 * Area of a geometry in square kilometres: the shoelace formula on a local equal-area plane
 * (x = longitude x cos(mean latitude)), holes subtracted. Within about 0.1% for areas of this size.
 */
export function areaKm2(g: PolygonGeometry): number {
  let total = 0;
  for (const poly of polygonsOf(g)) {
    poly.forEach((ring, k) => {
      if (ring.length < 3) return;
      const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      const kx = 111.32 * Math.cos((lat0 * Math.PI) / 180);
      const ky = 110.574;
      let a = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky);
      total += (k === 0 ? 1 : -1) * Math.abs(a / 2);
    });
  }
  return total;
}

/* ---------- time ---------- */

const HOUR_MS = 3_600_000;

export interface FireWindow {
  /** Start of the timeline, ms: two hours before the earlier of the recorded start and the first detection. */
  startMs: number;
  /** Recorded start (discovery) time, ms. */
  recordStartMs: number;
  hours: number;
}

/** The time span the record covers: from just before the first evidence to just after the last. */
export function fireWindow(ev: FireEvent): FireWindow {
  const recordStartMs = Date.parse(ev.meta.start);
  if (!Number.isFinite(recordStartMs)) throw new Error(`bad start time ${ev.meta.start}`);
  const det = ev.detections.rows.map((r) => recordStartMs + r[0] * 60_000);
  const per = ev.progression.map((p) => Date.parse(p.time));
  const first = Math.min(recordStartMs, ...det, ...per);
  const last = Math.max(recordStartMs, ...det, ...per);
  const startMs = first - 2 * HOUR_MS;
  return { startMs, recordStartMs, hours: Math.ceil((last + 2 * HOUR_MS - startMs) / HOUR_MS) };
}

export const fireTime = (w: FireWindow, hours: number): number => w.startMs + Math.max(0, Math.min(w.hours, hours)) * HOUR_MS;

/** Time of a detection row, ms. */
export const detectionMs = (ev: FireEvent, row: FireEvent["detections"]["rows"][number]): number => Date.parse(ev.meta.start) + row[0] * 60_000;

/** Number of detections at or before a time (rows are sorted by time). */
export function detectionsBy(ev: FireEvent, ms: number): number {
  const t0 = Date.parse(ev.meta.start);
  const rows = ev.detections.rows;
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (t0 + rows[mid][0] * 60_000 <= ms) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The latest dated perimeter at or before a time; null when none has been mapped yet. */
export function perimeterAt(ev: FireEvent, ms: number): FireEvent["progression"][number] | null {
  let out: FireEvent["progression"][number] | null = null;
  for (const p of ev.progression) if (Date.parse(p.time) <= ms) out = p;
  return out;
}

/** The latest satellite overpass at or before a time. */
export function overpassAt(ev: FireEvent, ms: number): FireEvent["detections"]["overpasses"][number] | null {
  let out: FireEvent["detections"]["overpasses"][number] | null = null;
  for (const o of ev.detections.overpasses) if (Date.parse(o.time) <= ms) out = o;
  return out;
}

/* ---------- agreement between the two observing systems ---------- */

export interface Agreement {
  /** Detections at or before the perimeter's time. */
  detections: number;
  /** Of those, how many lie inside the perimeter mapped at that time (no pixel tolerance). */
  inside: number;
  share: number | null;
}

/** For one dated perimeter: how many of the satellite detections so far fall inside it. */
export function agreementAt(ev: FireEvent, p: FireEvent["progression"][number]): Agreement {
  const n = detectionsBy(ev, Date.parse(p.time));
  let inside = 0;
  for (let i = 0; i < n; i++) if (pointInGeometry(ev.detections.rows[i][2], ev.detections.rows[i][1], p.geometry)) inside++;
  return { detections: n, inside, share: n ? inside / n : null };
}

/* ---------- proximity screen ---------- */

/** Distances offered for "near the fire", km from the final perimeter. 0 = inside the mapped perimeter. */
export const FIRE_BUFFERS_KM = [0, 2, 10, 25, 50] as const;
export type FireBufferKm = (typeof FIRE_BUFFERS_KM)[number];

export interface FireScreen {
  bufferKm: number;
  plants: FirePlant[];
  /** Sum of nameplate capacity over those plants, MW. Capacity near the fire, NOT generation lost. */
  plantMw: number;
  plantMwUnknown: number;
  sites: FireNearSite[];
  refineryCapacityBpd: number;
  gasKmInside: number;
  transmissionKmInside: number | null;
}

/** Infrastructure inside the final perimeter or within bufferKm of it. Proximity is not damage. */
export function fireScreen(ev: FireEvent, bufferKm: number): FireScreen {
  const plants = ev.infrastructure.powerPlants.filter((p) => p.kmFromPerimeter <= bufferKm);
  const sites = ev.infrastructure.refineriesAndPorts.filter((s) => s.kmFromPerimeter <= bufferKm);
  return {
    bufferKm,
    plants,
    plantMw: plants.reduce((s, p) => s + (p.capacityMw ?? 0), 0),
    plantMwUnknown: plants.filter((p) => p.capacityMw == null).length,
    sites,
    refineryCapacityBpd: sites.filter((s) => s.kind === "refinery").reduce((s, r) => s + (r.capacityBpd ?? 0), 0),
    gasKmInside: ev.infrastructure.gasPipelineSummary.reduce((s, g) => s + g.kmInside, 0),
    transmissionKmInside: ev.infrastructure.transmission ? ev.infrastructure.transmission.kmInsidePerimeter : null,
  };
}

/* ---------- economic network ---------- */

const MODEL = { label: "TerraPulse wildfire proximity screen (see Methods)", url: "#methods" };
const EIA_PLANTS = { label: "EIA power plants map layer", url: "https://www.eia.gov/maps/layer_info-m.php" };
const EIA_ELEC = { label: "EIA, Electricity explained", url: "https://www.eia.gov/energyexplained/electricity/" };
const EIA_GAS = { label: "EIA natural gas pipelines map layer", url: "https://www.eia.gov/maps/layer_info-m.php" };
const HIFLD = { label: "HIFLD transmission lines (archived copy, 30 September 2024)", url: "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0" };
/** Tidy a name from a data layer; names stored in capitals are shown in title case. */
const title = (s: string | null) => {
  const t = (s ?? "not stated").replace(/\s+/g, " ").trim();
  return t === t.toUpperCase() && /[A-Z]{3}/.test(t) ? niceName(t) : t;
};
const where = (km: number) => (km === 0 ? "inside the mapped final perimeter" : `within ${km} km of the mapped final perimeter`);

export interface FireGraphInput {
  ev: FireEvent;
  bufferKm: number;
  /** Refineries and ports of the app's datasets (to resolve the near sites to full records). */
  refineries: Refinery[];
  ports: Port[];
  datasetTons: number;
}

/**
 * The fire's proximity screen as an exposure set for the shared economic network, plus the nodes
 * and links for electricity and gas infrastructure, which the refinery network does not have.
 */
export function fireExposureSet(inp: FireGraphInput): ExposureSet {
  const { ev, bufferKm } = inp;
  const scr = fireScreen(ev, bufferKm);
  const refById = new Map(inp.refineries.map((r) => [r.id, r]));
  const portById = new Map(inp.ports.map((p) => [p.id, p]));
  const distFact = (s: FireNearSite): Fact[] => [
    { label: "Distance from the mapped final perimeter", value: s.inside ? "inside the perimeter" : `${s.kmFromPerimeter.toFixed(1)} km`, evidence: "MODELED", source: MODEL, note: "Straight-line distance from the site point to the simplified perimeter. Distance is not damage: no fire behaviour is modelled." },
    { label: "Damage or interruption", value: "Not estimated", evidence: "RESEARCH HYPOTHESIS", note: "Nothing retrieved for this build documents damage to this site from this fire." },
  ];
  const refs = scr.sites.filter((s) => s.kind === "refinery" && refById.has(s.id)).sort((a, b) => (b.capacityBpd ?? 0) - (a.capacityBpd ?? 0) || a.id.localeCompare(b.id));
  const ports = scr.sites.filter((s) => s.kind === "port" && portById.has(s.id));

  const nodes: Omit<GNode, "tier">[] = [];
  const edges: GEdge[] = [];
  const link = (from: string, to: string, kind: string, basis: EdgeBasis, meaning: string, source?: { label: string; url: string }) => edges.push({ id: `${from}>${to}`, from, to, kind, basis, meaning, source });
  const plants = [...scr.plants].sort((a, b) => (b.capacityMw ?? 0) - (a.capacityMw ?? 0) || a.id.localeCompare(b.id));
  const shown = plants.slice(0, 5);
  for (const p of shown) {
    const id = `asset:${p.id}`;
    nodes.push({
      id,
      type: "asset",
      label: `${title(p.name)} power plant`,
      sub: `${p.capacityMw != null ? `${p.capacityMw.toLocaleString("en-US")} MW` : "capacity n/a"} · ${title(p.primarySource)}`,
      evidence: "OBSERVED",
      facts: [
        { label: "Nameplate capacity", value: p.capacityMw != null ? `${p.capacityMw.toLocaleString("en-US")} MW` : "Insufficient validated data", evidence: "OBSERVED", source: EIA_PLANTS },
        { label: "Operator", value: title(p.operator), evidence: "OBSERVED", source: EIA_PLANTS },
        { label: "Primary source", value: title(p.primarySource), evidence: "OBSERVED", source: EIA_PLANTS },
        { label: "Distance from the mapped final perimeter", value: p.inside ? "inside the perimeter" : `${p.kmFromPerimeter.toFixed(1)} km`, evidence: "MODELED", source: MODEL, note: "The plant list is EIA's current layer, not the list of plants operating on the day of the fire." },
        { label: "Damage or outage", value: "Not estimated", evidence: "RESEARCH HYPOTHESIS", note: "Being inside or near a perimeter is not damage. Many plants inside a burned area are unharmed." },
      ],
    });
    link("hazard", id, "physical proximity", "MODELED", `The plant is ${where(bufferKm)} (${p.inside ? "inside" : `${p.kmFromPerimeter.toFixed(1)} km away`}). Proximity is not damage.`, MODEL);
    link(id, "act:power", "has generating capacity", "SOURCED", "Nameplate capacity as listed by EIA.", EIA_PLANTS);
  }
  if (plants.length > shown.length) {
    const rest = plants.slice(shown.length);
    const mw = rest.reduce((s, p) => s + (p.capacityMw ?? 0), 0);
    nodes.push({ id: "asset:other-plants", type: "asset", label: `${rest.length} more power plants`, sub: `${Math.round(mw).toLocaleString("en-US")} MW`, evidence: "OBSERVED", facts: [{ label: "Combined nameplate capacity", value: `${Math.round(mw).toLocaleString("en-US")} MW`, evidence: "OBSERVED", source: EIA_PLANTS }] });
    link("hazard", "asset:other-plants", "physical proximity", "MODELED", `Smaller plants also ${where(bufferKm)}.`, MODEL);
    link("asset:other-plants", "act:power", "has generating capacity", "SOURCED", "Nameplate capacity as listed by EIA.", EIA_PLANTS);
  }
  const tx = ev.infrastructure.transmission;
  if (tx && tx.kmInsidePerimeter > 0) {
    const owners = Object.entries(tx.kmInsideByOwner).filter(([o]) => !/NOT AVAILABLE|not stated/i.test(o));
    nodes.push({
      id: "asset:transmission",
      type: "asset",
      label: "Transmission lines",
      sub: `${tx.kmInsidePerimeter.toFixed(0)} km inside the perimeter`,
      evidence: "OBSERVED",
      facts: [
        { label: "Length of transmission line inside the final perimeter", value: `${tx.kmInsidePerimeter.toFixed(1)} km on ${tx.linesCrossingPerimeter} lines`, evidence: "MODELED", source: HIFLD, note: "Overlap of the archived national line layer with the mapped perimeter. The layer is the grid as last updated in 2024, not on the day of the fire." },
        { label: "By voltage class (kV)", value: Object.entries(tx.kmInsideByVoltageClass).map(([k, v]) => `${k}: ${v} km`).join(" · ") || "n/a", evidence: "MODELED", source: HIFLD },
        { label: "Owners named in the layer", value: owners.length ? owners.map(([o, v]) => `${title(o)} (${v} km)`).join("; ") : "not stated in the layer", evidence: "OBSERVED", source: HIFLD },
        { label: "Damage or outage", value: "Not estimated", evidence: "RESEARCH HYPOTHESIS", note: "A line inside a burned area may or may not have been damaged; nothing here measures it." },
      ],
    });
    link("hazard", "asset:transmission", "physical overlap", "MODELED", `${tx.kmInsidePerimeter.toFixed(0)} km of transmission line in the national layer lies inside the mapped final perimeter.`, HIFLD);
    link("asset:transmission", "act:grid", "carries", "SOURCED", "Transmission lines carry electricity from generators to local distribution systems.", EIA_ELEC);
  }
  const gasKm = scr.gasKmInside;
  if (gasKm > 0) {
    nodes.push({
      id: "asset:gas",
      type: "asset",
      label: "Natural gas pipelines",
      sub: `${gasKm.toFixed(0)} km inside the perimeter`,
      evidence: "OBSERVED",
      facts: [
        { label: "Pipeline length inside the final perimeter", value: `${gasKm.toFixed(1)} km`, evidence: "MODELED", source: EIA_GAS, note: "EIA's schematic national layer: positions are approximate, and buried pipelines are not directly exposed to surface fire." },
        { label: "Operators", value: ev.infrastructure.gasPipelineSummary.filter((g) => g.kmInside > 0).map((g) => `${title(g.operator)} (${g.kmInside.toFixed(0)} km, ${title(g.type).toLowerCase()})`).join("; ") || "n/a", evidence: "OBSERVED", source: EIA_GAS },
        { label: "Damage or outage", value: "Not estimated", evidence: "RESEARCH HYPOTHESIS" },
      ],
    });
    link("hazard", "asset:gas", "physical overlap", "MODELED", `${gasKm.toFixed(0)} km of pipeline in EIA's national layer lies inside the mapped final perimeter.`, EIA_GAS);
    link("asset:gas", "act:gas", "carries", "SOURCED", "Interstate and intrastate pipelines move natural gas from producing areas to consumers.", EIA_GAS);
  }
  if (plants.length) {
    nodes.push({
      id: "act:power",
      type: "activity",
      label: "Electricity generation",
      sub: `${Math.round(scr.plantMw).toLocaleString("en-US")} MW ${bufferKm === 0 ? "inside" : `within ${bufferKm} km`}`,
      evidence: "MODELED",
      facts: [
        { label: `Generating capacity ${where(bufferKm)}`, value: `${Math.round(scr.plantMw).toLocaleString("en-US")} MW at ${plants.length} plants`, evidence: "MODELED", source: MODEL, note: "Sum of EIA nameplate capacity. Capacity near the fire, NOT generation lost." },
        { label: "Expected outage", value: "Not estimated", evidence: "RESEARCH HYPOTHESIS", note: "No validated relationship links distance from a fire to a plant outage." },
      ],
    });
    link("act:power", "com:electricity", "produces", "SOURCED", "Power plants generate electricity.", EIA_ELEC);
  }
  if (tx && tx.kmInsidePerimeter > 0) {
    nodes.push({ id: "act:grid", type: "activity", label: "Electricity transmission", sub: `${tx.kmInsidePerimeter.toFixed(0)} km of line`, evidence: "MODELED", facts: [{ label: "Service interruption", value: "Not estimated", evidence: "RESEARCH HYPOTHESIS", note: "Utilities may also switch lines off deliberately during fire weather; neither effect is modelled." }] });
    link("act:grid", "com:electricity", "delivers", "SOURCED", "The grid delivers electricity to consumers.", EIA_ELEC);
  }
  if (gasKm > 0) {
    nodes.push({ id: "act:gas", type: "activity", label: "Natural gas transmission", sub: `${gasKm.toFixed(0)} km of pipeline`, evidence: "MODELED", facts: [{ label: "Service interruption", value: "Not estimated", evidence: "RESEARCH HYPOTHESIS" }] });
    nodes.push({ id: "com:natgas", type: "commodity", label: "Natural gas", sub: "Fuel and feedstock", evidence: "OBSERVED", facts: [{ label: "Price effect", value: "Cannot be estimated", evidence: "RESEARCH HYPOTHESIS" }] });
    link("act:gas", "com:natgas", "moves", "SOURCED", "Pipelines move natural gas to market.", EIA_GAS);
  }
  if (plants.length || (tx && tx.kmInsidePerimeter > 0)) {
    nodes.push({ id: "com:electricity", type: "commodity", label: "Electricity", sub: "Delivered power", evidence: "OBSERVED", facts: [{ label: "Price or reliability effect", value: "Cannot be estimated", evidence: "RESEARCH HYPOTHESIS", note: "Local outages, deliberate shut-offs and wholesale prices depend on the whole grid, which is not modelled." }] });
    nodes.push({ id: "ind:utilities", type: "industry", label: "Electric utilities", evidence: "OBSERVED", facts: [{ label: "Financial effect", value: "Cannot be estimated", evidence: "RESEARCH HYPOTHESIS", note: "Liability, repair cost and rate recovery are legal and regulatory outcomes. Where an official document states a cause, it is quoted in the fire's record, not converted into a number." }] });
    link("com:electricity", "ind:utilities", "sold by", "SOURCED", "Electric utilities generate, transmit and sell electricity.", EIA_ELEC);
  }

  return {
    hazard: {
      label: ev.meta.name,
      sub: `Observed record, ${ev.meta.year}`,
      evidence: "OBSERVED",
      facts: [
        { label: "Place", value: ev.meta.place, evidence: "OBSERVED" },
        { label: "Size on the record", value: `${Math.round(ev.perimeter.reportedAcres).toLocaleString("en-US")} acres`, evidence: "OBSERVED", source: { label: String(ev.meta.sources.perimeter?.provider ?? "NIFC"), url: String(ev.meta.sources.perimeter?.landingPage ?? "https://data-nifc.opendata.arcgis.com/") } },
        { label: "Satellite fire detections", value: ev.detections.count.toLocaleString("en-US"), evidence: "OBSERVED", source: { label: "NASA FIRMS, VIIRS 375 m", url: "https://firms.modaps.eosdis.nasa.gov/" } },
        { label: "Sites listed as near", value: where(bufferKm), evidence: "HYPOTHETICAL", note: "A distance you choose. No fire spread is simulated." },
      ],
    },
    model: MODEL,
    linkBasis: "MODELED",
    area: "screen",
    refineries: refs.map((s) => ({ site: refById.get(s.id)!, linkMeaning: `The refinery is ${s.inside ? "inside" : `${s.kmFromPerimeter.toFixed(1)} km from`} the mapped final perimeter, ${where(bufferKm)}. Distance is not damage.`, facts: distFact(s) })),
    ports: ports.map((s) => ({ site: portById.get(s.id)!, linkMeaning: `The port is ${s.kmFromPerimeter.toFixed(1)} km from the mapped final perimeter. Distance is not damage.`, facts: distFact(s) })),
    allRefineries: inp.refineries,
    datasetCapacityBpd: inp.refineries.reduce((s, r) => s + (r.capacityBpd ?? 0), 0),
    datasetTons: inp.datasetTons,
    restLinkMeaning: `Smaller refineries also ${where(bufferKm)}.`,
    capacityNote: `Sum of EIA capacity (as of 1 January 2026) over ${refs.length} refiner${refs.length === 1 ? "y" : "ies"} ${where(bufferKm)}. Capacity near the fire, NOT damage or lost production.`,
    outageNote: "No validated relationship links distance from a wildfire to a refinery outage, and no outage from this fire is documented in this build.",
    extra: { nodes, edges },
  };
}

export const WILDFIRE_CARD = {
  name: "Wildfire observed record and proximity screen v0.1",
  status: "EXPERIMENTAL. Perimeters and satellite detections are observations. The proximity screen is geometry with a distance you choose. No fire spread is simulated and nothing here forecasts a fire.",
  inputs: [
    "Final perimeters: National Interagency Fire Center (NIFC) open data, simplified for display (OBSERVED)",
    "Dated perimeters for the Camp Fire: GeoMAC archive, 28 perimeters from infrared flights and mixed methods (OBSERVED)",
    "Active-fire detections: NASA FIRMS, VIIRS 375 m on Suomi NPP and NOAA-20 (OBSERVED)",
    "Fire weather at the ignition point: gridMET daily indices (a 4-km gridded estimate) and NASA POWER (MERRA-2)",
    "Drought class of the county of origin: U.S. Drought Monitor",
    "Power plants and natural gas pipelines: U.S. EIA map layers; transmission lines: archived HIFLD layer (derived lengths only)",
    "Documented facts: official reports, each quote checked against the saved copy of the document",
  ],
  formula: [
    "detections by time t = satellite detections with acquisition time <= t",
    "perimeter at time t = the latest dated perimeter mapped at or before t (Camp Fire only)",
    "site is 'near' when its straight-line distance to the final perimeter <= d, with d chosen by you (0 = inside)",
    "capacity near the fire = sum of nameplate capacity over those sites",
    "agreement = share of the detections so far that lie inside the perimeter mapped at that time",
  ],
  limitations: [
    "No fire-spread simulation. The standard surface-fire model (Rothermel 1972) needs a fuel model, dead and live fuel moistures, midflame wind and slope for every cell, and by its own documentation 'is not applicable to crown fire' and excludes spotting; the three fires here were wind-driven events dominated by exactly those processes. A spread model would need validation that has not been done, so none is offered.",
    "A satellite detection is the centre of a 375 m pixel flagged as containing fire, not the fire's edge or size. Smoke, cloud and the hours between overpasses hide fire.",
    "Perimeters are mapped by different methods at different times and are simplified here for display; small differences between the reported size and the displayed shape are expected.",
    "Proximity is not damage. A plant or line inside a perimeter may be unharmed, and sites far outside can lose power or access.",
    "Infrastructure layers describe today's assets, not those in place on the day of each fire.",
    "gridMET and POWER values are gridded estimates. They are not measurements at the fire, and gridMET's own documentation says its wind fields cannot capture terrain effects.",
    "Three fires in the United States. Other fires and other countries: Insufficient validated data.",
  ],
  validation: [
    "Two independent observing systems agree on where the fires were: of the VIIRS detections inside each fire's search box, 99.6% (Camp), 98.4% (Marshall) and 88.4% (Smokehouse Creek) lie within one pixel of the separately mapped final perimeter. The remainder at Smokehouse Creek belong to other fires burning nearby at the same time.",
    "For the Camp Fire, the share of detections inside the perimeter mapped at the time is reported for each of the 28 dated perimeters in research/WILDFIRE.md.",
    "This checks the record's internal consistency. It is not a validation of any prediction, because nothing is predicted.",
  ],
  references: [
    "Schroeder, W., P. Oliva, L. Giglio and I. A. Csiszar (2014): The New VIIRS 375 m active fire detection data product. Remote Sensing of Environment, 143, 85-96.",
    "Abatzoglou, J. T. (2013): Development of gridded surface meteorological data for ecological applications and modelling. International Journal of Climatology, 33, 121-131.",
    "Rothermel, R. C. (1972): A mathematical model for predicting fire spread in wildland fuels. USDA Forest Service Research Paper INT-115.",
    "Andrews, P. L. (2018): The Rothermel surface fire spread model and associated developments. USDA Forest Service General Technical Report RMRS-GTR-371.",
  ],
} as const;
