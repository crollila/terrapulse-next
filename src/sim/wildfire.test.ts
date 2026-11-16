/**
 * Wildfire record: geometry and time helpers on hand-computed cases, then integrity and regression
 * values on the three bundled fires. These tests show the record is intact and the arithmetic is
 * reproduced. Nothing is predicted, so there is no forecast to validate.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ACRES_PER_KM2,
  FIRE_BUFFERS_KM,
  WILDFIRE_CARD,
  agreementAt,
  areaKm2,
  detectionMs,
  detectionsBy,
  fireExposureSet,
  fireScreen,
  fireTime,
  fireWindow,
  overpassAt,
  perimeterAt,
  pointInGeometry,
  polygonsOf,
  type FireEvent,
  type PolygonGeometry,
} from "./wildfire";
import { buildExposureGraph } from "./graph";
import { validateFire, type FireIndex } from "../data/wildfire";
import { validatePorts, validateRefineries } from "../data/infrastructure";

const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")) as T;
const index = read<FireIndex>("public/data/wildfire/index.json");
const fires = Object.fromEntries(index.events.map((e) => [e.id, validateFire(read<FireEvent>(`public/data/wildfire/${e.file}`))]));
const camp = fires["camp-2018"];
const marshall = fires["marshall-2021"];
const smoke = fires["smokehouse-creek-2024"];
const refineries = validateRefineries(read("public/data/infrastructure/refineries.json"));
const ports = validatePorts(read("public/data/infrastructure/ports.json"));
const checks = read<any>("research/wildfire_checks.json");

describe("geometry", () => {
  const square: PolygonGeometry = { type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] };
  const withHole: PolygonGeometry = { type: "Polygon", coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]], [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] };
  const multi: PolygonGeometry = { type: "MultiPolygon", coordinates: [square.coordinates as any, [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]]] };

  it("tests points against polygons, holes and multipolygons", () => {
    expect(pointInGeometry(1, 1, square)).toBe(true);
    expect(pointInGeometry(3, 1, square)).toBe(false);
    expect(pointInGeometry(0.5, 0.5, withHole)).toBe(true);
    expect(pointInGeometry(2, 2, withHole)).toBe(false); // inside the hole
    expect(pointInGeometry(10.5, 10.5, multi)).toBe(true);
    expect(pointInGeometry(5, 5, multi)).toBe(false);
    expect(polygonsOf(square)).toHaveLength(1);
    expect(polygonsOf(multi)).toHaveLength(2);
  });

  it("computes area on a local equal-area plane and subtracts holes", () => {
    // 0.1 x 0.1 degrees at the equator: 11.132 km x 11.0574 km
    const cell: PolygonGeometry = { type: "Polygon", coordinates: [[[0, -0.05], [0.1, -0.05], [0.1, 0.05], [0, 0.05], [0, -0.05]]] };
    expect(areaKm2(cell)).toBeCloseTo(11.132 * 11.0574, 3);
    // the same box at 60 N is half as wide
    const north: PolygonGeometry = { type: "Polygon", coordinates: [[[0, 59.95], [0.1, 59.95], [0.1, 60.05], [0, 60.05], [0, 59.95]]] };
    expect(areaKm2(north) / areaKm2(cell)).toBeCloseTo(0.5, 2);
    const holed: PolygonGeometry = { type: "Polygon", coordinates: [cell.coordinates[0] as any, [[0.025, -0.025], [0.075, -0.025], [0.075, 0.025], [0.025, 0.025], [0.025, -0.025]]] };
    expect(areaKm2(holed) / areaKm2(cell)).toBeCloseTo(0.75, 6);
    expect(ACRES_PER_KM2).toBeCloseTo(247.105, 3);
  });
});

describe("bundled fires: integrity", () => {
  it("lists three fires, each with provenance for every source", () => {
    expect(index.events.map((e) => e.id)).toEqual(["camp-2018", "marshall-2021", "smokehouse-creek-2024"]);
    for (const ev of Object.values(fires)) {
      expect(Date.parse(ev.meta.start)).not.toBeNaN();
      expect(ev.meta.ignition.lat).toBeGreaterThan(25);
      for (const k of ["perimeter", "detections", "gridmet", "power", "drought", "plants", "gasPipelines", "transmission"]) {
        const s = ev.meta.sources[k]!;
        expect(s.provider.length).toBeGreaterThan(3);
        expect(String(s.landingPage ?? s.sourceUrl)).toMatch(/^https:/);
      }
      expect(ev.detections.rows).toHaveLength(ev.detections.count);
      expect(ev.detections.overpasses.reduce((s, o) => s + o.count, 0)).toBe(ev.detections.count);
      // every detection is in the United States and carries a non-negative distance
      for (const r of ev.detections.rows) {
        expect(r[1]).toBeGreaterThan(24);
        expect(r[1]).toBeLessThan(50);
        expect(r[7]).toBeGreaterThanOrEqual(0);
      }
      // the origin on the record lies inside or beside the final perimeter
      const [w, s, e, n] = ev.perimeter.bbox;
      expect(ev.meta.ignition.lon).toBeGreaterThan(w - 0.05);
      expect(ev.meta.ignition.lon).toBeLessThan(e + 0.05);
      expect(ev.meta.ignition.lat).toBeGreaterThan(s - 0.05);
      expect(ev.meta.ignition.lat).toBeLessThan(n + 0.05);
    }
  });

  it("draws shapes whose area is within 1% of the size on the record", () => {
    for (const ev of Object.values(fires)) {
      const drawn = areaKm2(ev.perimeter.geometry) * ACRES_PER_KM2;
      expect(drawn / ev.perimeter.reportedAcres).toBeGreaterThan(0.99);
      expect(drawn / ev.perimeter.reportedAcres).toBeLessThan(1.01);
      // the build's own figure (computed with a different library) agrees
      expect(drawn / ev.perimeter.areaOfDisplayedShapeAcres).toBeCloseTo(1, 2);
    }
    expect(Math.round(camp.perimeter.reportedAcres)).toBe(153_336);
    expect(Math.round(marshall.perimeter.reportedAcres)).toBe(6_080);
    expect(Math.round(smoke.perimeter.reportedAcres)).toBe(1_054_153);
  });

  it("carries only facts that were found in a saved copy of their source, or are counts from a public record", () => {
    for (const ev of Object.values(fires))
      for (const f of ev.facts) {
        expect(f.url).toMatch(/^https:/);
        expect(f.source.length).toBeGreaterThan(5);
        if (f.quote) expect((f as any).quoteCheckedAgainstSavedCopy).toBe(true);
      }
    expect(camp.facts.find((f) => f.label === "Structures inspected as destroyed")!.value).toBe("18,804");
    expect(camp.facts.find((f) => f.label === "Population of the Town of Paradise")!.value).toBe("26,218 in the 2010 Census; 4,764 in the 2020 Census");
    // the Camp Fire's cause is not stated because no saved copy of a source could be checked
    expect(camp.facts.some((f) => /cause/i.test(f.label))).toBe(false);
    expect(camp.meta.gaps.join(" ")).toMatch(/cause of the Camp Fire is therefore not stated/);
    expect(smoke.facts.find((f) => f.label.startsWith("Cause"))!.quote).toMatch(/downed power poles owned by Xcel Energy/);
    expect(marshall.facts.find((f) => f.label === "Cause on the interagency record")!.value).toBe("Undetermined");
  });
});

describe("time handling", () => {
  const w = fireWindow(camp);
  it("spans from two hours before the first evidence to two hours after the last", () => {
    expect(w.recordStartMs).toBe(Date.parse("2018-11-08T14:33:00Z"));
    expect(w.startMs).toBe(w.recordStartMs - 2 * 3_600_000);
    expect(w.hours).toBe(416);
    expect(fireTime(w, 0)).toBe(w.startMs);
    expect(fireTime(w, 9999)).toBe(w.startMs + 416 * 3_600_000);
    // a record whose first detection precedes the administrative start begins at the detection
    const wm = fireWindow(marshall);
    expect(wm.startMs).toBeLessThan(wm.recordStartMs - 2 * 3_600_000);
  });

  it("counts detections up to a time and finds the perimeter and overpass in force", () => {
    expect(detectionsBy(camp, w.startMs)).toBe(0);
    expect(detectionsBy(camp, fireTime(w, w.hours))).toBe(8636);
    const firstPass = Date.parse(camp.detections.overpasses[0].time);
    expect(detectionsBy(camp, firstPass - 1)).toBe(0);
    expect(detectionsBy(camp, firstPass)).toBe(camp.detections.overpasses[0].count);
    expect(detectionMs(camp, camp.detections.rows[0])).toBe(firstPass);
    expect(perimeterAt(camp, w.startMs)).toBeNull();
    expect(perimeterAt(camp, Date.parse("2018-11-08T17:54:00Z"))!.acres).toBe(54586.4);
    expect(perimeterAt(camp, Date.parse("2018-11-30T00:00:00Z"))!.acres).toBe(153335.6);
    expect(perimeterAt(marshall, Date.parse("2022-01-05T00:00:00Z"))).toBeNull();
    expect(overpassAt(camp, firstPass - 1)).toBeNull();
    expect(overpassAt(camp, firstPass)!.satellite).toBe("Suomi NPP");
  });
});

describe("agreement between satellites and mapped perimeters (regression values)", () => {
  it("places nearly all detections within one pixel of the separately mapped final perimeter", () => {
    const share = (ev: FireEvent) => ev.detections.withinOnePixelOfFinalPerimeter / ev.detections.count;
    expect([camp.detections.count, camp.detections.withinOnePixelOfFinalPerimeter]).toEqual([8636, 8602]);
    expect([marshall.detections.count, marshall.detections.withinOnePixelOfFinalPerimeter]).toEqual([186, 183]);
    expect([smoke.detections.count, smoke.detections.withinOnePixelOfFinalPerimeter]).toEqual([5701, 5042]);
    expect(share(camp)).toBeCloseTo(0.996, 3);
    expect(share(marshall)).toBeCloseTo(0.984, 3);
    expect(share(smoke)).toBeCloseTo(0.884, 3);
    // Smokehouse Creek's remainder is other fires: they sit more than 2 km outside
    expect(smoke.detections.count - smoke.detections.within2kmOfFinalPerimeter).toBe(656);
  });

  it("reports, for each dated Camp Fire perimeter, the share of detections so far inside it", () => {
    expect(camp.progression).toHaveLength(28);
    const a = camp.progression.map((p) => agreementAt(camp, p));
    expect(a[0]).toEqual({ detections: 0, inside: 0, share: null });
    expect([a[1].detections, a[1].inside]).toEqual([1142, 1095]);
    expect([a[27].detections, a[27].inside]).toEqual([8636, 8077]);
    const shares = a.filter((x) => x.share !== null).map((x) => x.share!);
    expect(Math.min(...shares)).toBeCloseTo(0.871, 3);
    expect(Math.max(...shares)).toBeCloseTo(0.959, 3);
    // mapped sizes are not monotonic: methods alternate and some later maps are smaller
    const sizes = camp.progression.map((p) => p.acres!);
    expect(sizes.some((v, i) => i > 0 && v < sizes[i - 1])).toBe(true);
  });

  it("matches the checks file and the model card", () => {
    for (const f of checks.fires) {
      const ev = fires[f.id];
      expect(f.detections).toBe(ev.detections.count);
      expect(f.withinOnePixelOfFinalPerimeter).toBe(ev.detections.withinOnePixelOfFinalPerimeter);
      expect(f.datedPerimeters).toHaveLength(ev.progression.length);
    }
    const text = WILDFIRE_CARD.validation.join(" ");
    for (const phrase of ["99.6% (Camp)", "98.4% (Marshall)", "88.4% (Smokehouse Creek)", "28 dated perimeters", "nothing is predicted"]) expect(text).toContain(phrase);
    expect(WILDFIRE_CARD.status).toMatch(/No fire spread is simulated/);
  });
});

describe("proximity screen (regression values)", () => {
  it("lists more sites as the distance grows, never fewer", () => {
    for (const ev of Object.values(fires)) {
      let prev = -1;
      let prevMw = -1;
      for (const km of FIRE_BUFFERS_KM) {
        const s = fireScreen(ev, km);
        expect(s.plants.length).toBeGreaterThanOrEqual(prev);
        expect(s.plantMw).toBeGreaterThanOrEqual(prevMw);
        prev = s.plants.length;
        prevMw = s.plantMw;
        for (const p of s.plants) expect(p.kmFromPerimeter).toBeLessThanOrEqual(km);
      }
    }
  });

  it("finds four plants and 194 MW inside the Camp Fire perimeter, with 238 km of transmission line", () => {
    const s = fireScreen(camp, 0);
    expect(s.plants.map((p) => p.name).sort()).toEqual(["Ameresco Butte County", "Cresta", "Lime Saddle", "Poe"]);
    expect(s.plantMw).toBe(194);
    expect(s.plants.every((p) => p.inside)).toBe(true);
    expect(s.transmissionKmInside).toBe(237.8);
    expect(s.gasKmInside).toBeCloseTo(52.55, 2);
    expect(s.sites).toEqual([]);
    expect(fireScreen(camp, 10).plants).toHaveLength(16);
  });

  it("finds the Borger refinery 7.8 km from the Smokehouse Creek perimeter and none inside any fire", () => {
    expect(fireScreen(smoke, 2).sites).toEqual([]);
    const s = fireScreen(smoke, 10);
    expect(s.sites.map((x) => [x.name, x.kmFromPerimeter])).toEqual([["BORGER", 7.8]]);
    expect(s.refineryCapacityBpd).toBe(refineries.find((r) => r.name === "BORGER")!.capacityBpd);
    expect(fireScreen(marshall, 25).sites.map((x) => x.name)).toEqual(["COMMERCE CITY WEST", "COMMERCE CITY EAST"]);
    for (const ev of Object.values(fires)) expect(ev.infrastructure.refineriesAndPorts.every((x) => !x.inside)).toBe(true);
  });
});

describe("economic network for a fire", () => {
  const datasetTons = ports.reduce((s, p) => s + (p.totalTons ?? 0), 0);
  const graphOf = (ev: FireEvent, bufferKm: number) => buildExposureGraph(fireExposureSet({ ev, bufferKm, refineries, ports, datasetTons }));

  it("links the fire to power plants, transmission and pipelines with sourced, unnumbered claims", () => {
    const g = graphOf(camp, 0);
    expect(g.nodes[0]).toMatchObject({ id: "hazard", label: "Camp Fire", evidence: "OBSERVED" });
    for (const id of ["asset:transmission", "asset:gas", "act:power", "act:grid", "act:gas", "com:electricity", "com:natgas", "ind:utilities"]) expect(g.nodes.some((n) => n.id === id)).toBe(true);
    expect(g.nodes.filter((n) => n.id.startsWith("asset:eia-plant-"))).toHaveLength(4);
    expect(g.nodes.find((n) => n.id === "act:power")!.sub).toBe("194 MW inside");
    for (const e of g.edges) {
      expect(e.meaning.length).toBeGreaterThan(10);
      expect(e.source?.url).toBeTruthy();
      expect(["SOURCED", "MODELED"]).toContain(e.basis);
    }
    // every effect is explicitly not estimated: no price, loss or outage number anywhere
    for (const n of g.nodes) for (const f of n.facts) if (/price|financial|outage|damage|interruption/i.test(f.label)) expect(f.value).toMatch(/Not estimated|Cannot be estimated/);
    // no refinery is inside, so the refinery part of the network is absent
    expect(g.nodes.some((n) => n.id === "act:refining")).toBe(false);
  });

  it("adds the refinery network when a refinery is within the chosen distance", () => {
    const g = graphOf(smoke, 10);
    expect(g.nodes.some((n) => n.id === "act:refining")).toBe(true);
    const borger = g.nodes.find((n) => n.assetId === refineries.find((r) => r.name === "BORGER")!.id)!;
    expect(borger.facts.map((f) => f.label)).toContain("Distance from the mapped final perimeter");
    expect(g.edges.find((e) => e.to === borger.id)!.meaning).toMatch(/7\.8 km from the mapped final perimeter.*Distance is not damage/);
    expect(g.nodes.find((n) => n.id === "act:refining")!.facts[2].note).toMatch(/no outage from this fire is documented/);
    // inside the perimeter there is one small plant and no refinery
    expect(graphOf(smoke, 0).nodes.some((n) => n.id === "act:refining")).toBe(false);
  });

  it("is a bare hazard node when nothing in the published layers is near", () => {
    const empty: FireEvent = { ...marshall, infrastructure: { ...marshall.infrastructure, powerPlants: [], gasPipelineSummary: [], transmission: null, refineriesAndPorts: [] } };
    expect(graphOf(empty, 0).nodes).toHaveLength(1);
  });
});
