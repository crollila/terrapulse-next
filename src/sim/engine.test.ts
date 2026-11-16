/**
 * Integration-level tests on the committed datasets: the Houston scenario, the economic graph,
 * the portfolio screen, the command parser, freshness labels and the feed adapters.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MODEL_CARD, SCENARIO_001, runScenario, timelineState, posForHour } from "./hurricane";
import { TIERS, buildGraph, chainOf, companyExposures, nodeVisible } from "./graph";
import { parseHoldings, stressPortfolio } from "./portfolio";
import { parseCommand, vmaxForCategory } from "./command";
import { validatePorts, validateRefineries } from "../data/infrastructure";
import { parseEonet, parseUsgs } from "../data/hazards";
import { ageLabel, freshnessStatus } from "../data/freshness";
import { LISTINGS, FUNDS, listingFor } from "../data/companies";
import { LAYERS, gibsDate, gibsTileUrl } from "../data/layers";
import { saffirSimpsonCategory } from "./hurricane";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../public/data/${p}`, import.meta.url), "utf8"));
const refineries = validateRefineries(read("infrastructure/refineries.json"));
const ports = validatePorts(read("infrastructure/ports.json"));
const S = runScenario(SCENARIO_001, refineries, ports);

describe("committed infrastructure data", () => {
  it("has plausible refinery records from EIA", () => {
    expect(refineries.length).toBeGreaterThan(100);
    for (const r of refineries) {
      expect(Math.abs(r.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(r.lon)).toBeLessThanOrEqual(180);
      if (r.capacityBpd !== null) expect(r.capacityBpd).toBeGreaterThan(0);
    }
    const total = refineries.reduce((a, r) => a + (r.capacityBpd ?? 0), 0);
    // U.S. operable capacity is of the order of 18 million b/d; guard against unit mistakes.
    expect(total).toBeGreaterThan(15e6);
    expect(total).toBeLessThan(22e6);
  });
  it("keeps missing capacity as null, never zero", () => {
    expect(refineries.some((r) => r.capacityBpd === null)).toBe(true);
    expect(refineries.some((r) => r.capacityBpd === 0)).toBe(false);
  });
  it("has 150 principal ports with tonnage", () => {
    expect(ports.length).toBe(150);
    expect(ports[0].totalTons).toBeGreaterThan(1e8);
  });
  it("every listing refers to a corporation that exists in the EIA file", () => {
    const corps = new Set(refineries.map((r) => r.corporation));
    for (const l of LISTINGS) expect(corps.has(l.corporation), l.corporation).toBe(true);
  });
  it("fund members are tickers that exist in the listing table", () => {
    const tickers = new Set(LISTINGS.map((l) => l.ticker));
    for (const f of FUNDS) for (const m of f.members) expect(tickers.has(m), `${f.ticker}:${m}`).toBe(true);
  });
});

describe("Scenario 001 on the real datasets", () => {
  it("puts Houston-area refineries inside the hurricane-force footprint", () => {
    const ids = S.refineriesInFootprint.map((r) => r.name);
    for (const name of ["BAYTOWN", "DEER PARK", "GALVESTON BAY", "PORT ARTHUR"]) expect(ids).toContain(name);
    expect(S.category).toBe(5);
  });
  it("capacity in footprint equals the sum of its members and is a share between 0 and 1", () => {
    const sum = S.refineriesInFootprint.reduce((a, r) => a + (r.capacityBpd ?? 0), 0);
    expect(S.capacityInFootprintBpd).toBe(sum);
    expect(S.capacityShare!).toBeGreaterThan(0);
    expect(S.capacityShare!).toBeLessThan(1);
    expect(S.capacityShare!).toBeCloseTo(sum / S.datasetCapacityBpd, 12);
  });
  it("does not expose refineries on the West Coast or East Coast", () => {
    for (const r of S.refineriesInFootprint) expect(["Texas", "Louisiana"]).toContain(r.state);
  });
  it("severity changes the result monotonically", () => {
    let prev = -1;
    for (const v of [50, 70, 90, 110, 130, 150, 170]) {
      const c = runScenario({ ...SCENARIO_001, vmaxKt: v }, refineries, ports).capacityInFootprintBpd;
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
    expect(prev).toBeGreaterThan(0);
  });
  it("a larger storm never exposes less capacity", () => {
    const a = runScenario({ ...SCENARIO_001, rmaxKm: 20 }, refineries, ports).capacityInFootprintBpd;
    const b = runScenario({ ...SCENARIO_001, rmaxKm: 60 }, refineries, ports).capacityInFootprintBpd;
    expect(b).toBeGreaterThanOrEqual(a);
  });
  it("the same storm aimed at Miami exposes no Gulf Coast refining capacity", () => {
    const m = runScenario({ ...SCENARIO_001, landfallLat: 25.76, landfallLon: -80.19, headingDeg: 300 }, refineries, ports);
    expect(m.capacityInFootprintBpd).toBe(0);
    expect(m.portsInFootprint.length).toBeGreaterThan(0);
  });
});

describe("economic graph", () => {
  const g = buildGraph(S);
  const ids = new Set(g.nodes.map((n) => n.id));
  it("has unique node ids and edges that connect existing nodes", () => {
    expect(ids.size).toBe(g.nodes.length);
    for (const e of g.edges) {
      expect(ids.has(e.from), e.id).toBe(true);
      expect(ids.has(e.to), e.id).toBe(true);
    }
  });
  it("every edge states its meaning and basis; sourced and modelled edges cite a source", () => {
    for (const e of g.edges) {
      expect(e.meaning.length).toBeGreaterThan(10);
      expect(["SOURCED", "MODELED", "RESEARCH HYPOTHESIS"]).toContain(e.basis);
      if (e.basis !== "RESEARCH HYPOTHESIS") expect(e.source?.url, e.id).toBeTruthy();
    }
  });
  it("never attaches a number to a price or return", () => {
    for (const n of g.nodes) for (const f of n.facts) if (/price|return|margin|cost effect/i.test(f.label)) expect(f.value).toMatch(/cannot be estimated|insufficient/i);
  });
  it("asset nodes map to real assets for globe sync", () => {
    const assetIds = new Set([...refineries.map((r) => r.id), ...ports.map((p) => p.id)]);
    for (const n of g.nodes.filter((x) => x.type === "asset")) {
      for (const id of [n.assetId, ...(n.assetIds ?? [])]) if (id) expect(assetIds.has(id), id).toBe(true);
    }
  });
  it("company exposure shares are exposed capacity over total U.S. capacity", () => {
    const comps = companyExposures(S);
    const xom = comps.find((c) => c.ticker === "XOM")!;
    const total = refineries.filter((r) => r.corporation === "EXXON MOBIL CORP").reduce((a, r) => a + (r.capacityBpd ?? 0), 0);
    const exposed = S.refineriesInFootprint.filter((r) => r.corporation === "EXXON MOBIL CORP").reduce((a, r) => a + (r.capacityBpd ?? 0), 0);
    expect(xom.totalUsBpd).toBe(total);
    expect(xom.exposedBpd).toBe(exposed);
    expect(xom.share).toBeCloseTo(exposed / total, 12);
    for (const c of comps) expect(c.share === null || (c.share > 0 && c.share <= 1)).toBe(true);
  });
  it("a chain through an operator reaches the hazard upstream and its industry downstream", () => {
    const chain = chainOf(g, "co:EXXON MOBIL CORP");
    expect(chain.nodes.has("hazard")).toBe(true);
    expect(chain.nodes.has("ind:refining")).toBe(true);
  });
  it("timeline reveals tiers in order and hides everything but the hazard at baseline", () => {
    const base = timelineState(0, S);
    const vis0 = g.nodes.filter((n) => nodeVisible(n, base.graphDepth, base.tH)).map((n) => n.type);
    expect(new Set(vis0)).toEqual(new Set(["hazard"]));
    const end = timelineState(1, S);
    expect(g.nodes.every((n) => nodeVisible(n, end.graphDepth, end.tH))).toBe(true);
    const atLandfall = timelineState(posForHour(0), S);
    const visL = g.nodes.filter((n) => nodeVisible(n, atLandfall.graphDepth, atLandfall.tH));
    expect(visL.some((n) => n.type === "asset")).toBe(true);
    expect(visL.some((n) => n.type === "commodity")).toBe(false);
    expect(TIERS[0]).toBe("hazard");
  });
  it("an empty scenario yields only the hazard node", () => {
    const g0 = buildGraph(runScenario({ ...SCENARIO_001, vmaxKt: 40 }, refineries, ports));
    expect(g0.nodes.map((n) => n.id)).toEqual(["hazard"]);
    expect(g0.edges.length).toBe(0);
  });
});

describe("portfolio exposure screen", () => {
  const comps = companyExposures(S);
  it("parses holdings and reports unreadable lines", () => {
    const p = parseHoldings("XOM 25\nvlo, 15%\nbad line here\nAAPL=10");
    expect(p.holdings.map((h) => h.ticker)).toEqual(["XOM", "VLO", "AAPL"]);
    expect(p.errors.length).toBe(1);
  });
  it("hand calculation: two holdings", () => {
    const xom = comps.find((c) => c.ticker === "XOM")!;
    const r = stressPortfolio([{ ticker: "XOM", weight: 60 }, { ticker: "AAPL", weight: 40 }], comps);
    expect(r.weightWithDirectExposure).toBeCloseTo(0.6, 12);
    expect(r.capacityWeightedExposure).toBeCloseTo(0.6 * xom.share!, 12);
    expect(r.weightUnmapped).toBeCloseTo(0.4, 12);
    expect(r.holdings.find((h) => h.ticker === "AAPL")!.exposureShare).toBeNull();
  });
  it("weights are normalised and duplicates merged", () => {
    const r = stressPortfolio([{ ticker: "XOM", weight: 1 }, { ticker: "xom", weight: 1 }, { ticker: "VLO", weight: 2 }], comps);
    expect(r.holdings.length).toBe(2);
    expect(r.holdings.reduce((a, h) => a + h.weight, 0)).toBeCloseTo(1, 12);
  });
  it("funds are classified but never quantified", () => {
    const r = stressPortfolio([{ ticker: "XLE", weight: 1 }], comps);
    expect(r.holdings[0].cls).toBe("fund");
    expect(r.holdings[0].exposureShare).toBeNull();
    expect(r.capacityWeightedExposure).toBe(0);
    expect(r.holdings[0].explanation).toMatch(/Insufficient validated data/);
  });
  it("a refiner outside the footprint has zero exposure, not unknown", () => {
    const far = stressPortfolio([{ ticker: "PARR", weight: 1 }], comps);
    expect(far.holdings[0].cls).toBe("refiner-not-exposed");
    expect(far.holdings[0].exposureShare).toBe(0);
  });
  it("the index is bounded by the directly exposed weight", () => {
    const r = stressPortfolio(parseHoldings("XOM 25\nMPC 15\nVLO 10\nXLE 20\nDAL 10\nAAPL 20").holdings, comps);
    expect(r.capacityWeightedExposure).toBeLessThanOrEqual(r.weightWithDirectExposure + 1e-12);
    expect(r.weightWithDirectExposure + r.weightFunds + r.weightUnmapped).toBeLessThanOrEqual(1 + 1e-12);
  });
  it("handles an empty portfolio", () => {
    expect(stressPortfolio([], comps).warnings).toEqual(["No valid holdings."]);
  });
});

describe("command parser (deterministic keywords)", () => {
  it("understands the flagship command", () => {
    const c = parseCommand("Simulate a major hurricane near Houston.");
    expect(c.kind).toBe("simulate");
    if (c.kind === "simulate") {
      expect(c.lat).toBeCloseTo(29.76, 2);
      expect(saffirSimpsonCategory(c.vmaxKt!)).toBe(4);
    }
  });
  it("maps a named category to a wind speed inside that category", () => {
    for (const cat of [1, 2, 3, 4, 5]) expect(saffirSimpsonCategory(vmaxForCategory(cat))).toBe(cat);
    const c = parseCommand("simulate category 5 hurricane near New Orleans");
    expect(c.kind === "simulate" && saffirSimpsonCategory(c.vmaxKt!)).toBe(5);
  });
  it("parses coordinates, including hemisphere letters", () => {
    expect(parseCommand("29.7, -95.3")).toMatchObject({ kind: "fly", lat: 29.7, lon: -95.3 });
    expect(parseCommand("10 S, 63 W")).toMatchObject({ kind: "fly", lat: -10, lon: -63 });
    expect(parseCommand("95, 10").kind).toBe("none");
  });
  it("opens the trend explorer from keywords", () => {
    expect(parseCommand("rainfall trend amazon")).toMatchObject({ kind: "trend", regionId: "rondonia", variableId: "PRECTOTCORR" });
  });
  it("finds places and reports no match honestly", () => {
    expect(parseCommand("tokyo")).toMatchObject({ kind: "fly", label: "Tokyo" });
    expect(parseCommand("zzzz").kind).toBe("none");
    expect(parseCommand("").kind).toBe("none");
  });
  it("is deterministic", () => {
    expect(parseCommand("simulate category 3 hurricane near Tampa")).toEqual(parseCommand("simulate category 3 hurricane near Tampa"));
  });
});

describe("freshness labels", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  const at = (h: number) => new Date(now - h * 3_600_000).toISOString();
  it("LIVE FEED only for fresh, non-cached observations under one hour old", () => {
    expect(freshnessStatus({ fromCache: false, observedAt: at(0.5), retrievedAt: at(0) }, now)).toBe("LIVE FEED");
    expect(freshnessStatus({ fromCache: false, observedAt: at(2), retrievedAt: at(0) }, now)).toBe("RECENT OBSERVATION");
    expect(freshnessStatus({ fromCache: false, observedAt: at(72), retrievedAt: at(0) }, now)).toBe("DELAYED");
    expect(freshnessStatus({ fromCache: false, observedAt: at(24 * 400), retrievedAt: at(0) }, now)).toBe("HISTORICAL");
  });
  it("a cached snapshot is never labelled live, even if its newest observation is recent", () => {
    expect(freshnessStatus({ fromCache: true, observedAt: at(0.1), retrievedAt: at(0.2) }, now)).toBe("CACHED");
  });
  it("simulated data is labelled simulated", () => {
    expect(freshnessStatus({ fromCache: false, observedAt: at(0), retrievedAt: at(0) }, now, true)).toBe("SIMULATED");
  });
  it("age labels", () => {
    expect(ageLabel(at(0.05), now)).toBe("3 min");
    expect(ageLabel(at(5), now)).toBe("5 h");
    expect(ageLabel(at(72), now)).toBe("3 d");
    expect(ageLabel(null, now)).toBe("unknown age");
  });
});

describe("feed adapters on the committed snapshots", () => {
  it("parses the USGS snapshot and keeps real timestamps", () => {
    const snap = read("snapshots/earthquakes.json");
    const { events, rejected } = parseUsgs(snap.data);
    expect(events.length).toBeGreaterThan(10);
    expect(rejected).toBe(0);
    for (const e of events) {
      expect(e.magnitude!).toBeGreaterThanOrEqual(4.5);
      expect(Date.parse(e.observedAt)).toBeLessThanOrEqual(Date.parse(snap.retrievedAt));
    }
  });
  it("parses the EONET snapshot", () => {
    const { events } = parseEonet(read("snapshots/eonet.json").data);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.url).toMatch(/^https?:/);
  });
  it("rejects malformed records instead of repairing them", () => {
    const bad = { features: [{ id: "x", properties: { mag: "big", time: 1 }, geometry: { coordinates: [0, 0, 1] } }, { id: "y", properties: { mag: 5, time: 1 }, geometry: { coordinates: [500, 0] } }] };
    expect(parseUsgs(bad)).toMatchObject({ events: [], rejected: 2 });
    expect(() => parseUsgs({})).toThrow();
    expect(() => parseEonet({ nope: 1 })).toThrow();
  });
});

describe("hindcast statements in the model card match the hindcast results", () => {
  const res = JSON.parse(readFileSync(new URL("../../research/hindcast_results.json", import.meta.url), "utf8"));
  const storm = (name: string) => res.storms.find((s: { name: string }) => s.name === name);
  const DOE_HARVEY_BPD = 3_871_449;
  it("Harvey: 0.94 to 1.32 million b/d at 64 kt, 24% to 34% of the DOE figure, Texas only", () => {
    const h = storm("HARVEY").holland;
    expect(h.v64_rmax20.capacityBpd).toBe(942_500);
    expect(h.v64_rmax50.capacityBpd).toBe(1_322_500);
    expect(Math.round((100 * h.v64_rmax20.capacityBpd) / DOE_HARVEY_BPD)).toBe(24);
    expect(Math.round((100 * h.v64_rmax50.capacityBpd) / DOE_HARVEY_BPD)).toBe(34);
    expect(Object.keys(h.v64_rmax50.byState)).toEqual(["Texas"]);
    expect(Math.round((100 * storm("HARVEY").observedRadii.r34.capacityBpd) / DOE_HARVEY_BPD)).toBe(164);
    const names: string[] = h.v64_rmax50.refineries.map((r: { name: string }) => r.name);
    for (const n of ["BAYTOWN", "DEER PARK", "GALVESTON BAY", "BEAUMONT", "PORT ARTHUR"]) expect(names).not.toContain(n);
  });
  it("Ike: 10, 13 and 16 refineries at 64 kt for Rmax 20, 35 and 50 km", () => {
    const h = storm("IKE").holland;
    expect([h.v64_rmax20.count, h.v64_rmax35.count, h.v64_rmax50.count]).toEqual([10, 13, 16]);
  });
  it("the model card says so in words", () => {
    const text = MODEL_CARD.hindcast.join(" ");
    expect(text).toContain("0.94 to 1.32 million b/d");
    expect(text).toContain("24% to 34%");
    expect(text).toContain("10, 13 or 16 refineries");
    expect(MODEL_CARD.status).toMatch(/did not validate/);
  });
});

describe("layer catalogue", () => {
  it("every layer has an explanation, provider and source link", () => {
    for (const l of LAYERS) {
      expect(l.explain.length).toBeGreaterThan(20);
      expect(l.sourceUrl).toMatch(/^https:/);
      expect(l.provider.length).toBeGreaterThan(2);
    }
  });
  it("daily imagery requests a past date and embeds it in the tile URL", () => {
    const now = new Date("2026-11-15T03:00:00Z");
    expect(gibsDate(3, now)).toBe("2026-11-12");
    const g = LAYERS.find((l) => l.id === "gibsPrecip")!.gibs!;
    expect(gibsTileUrl(g, now)).toContain("/default/2026-11-12/GoogleMapsCompatible_Level6/");
    const bm = LAYERS.find((l) => l.id === "blueMarble")!.gibs!;
    expect(gibsTileUrl(bm, now)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });
  it("listing lookup is exact, not fuzzy", () => {
    expect(listingFor("EXXON MOBIL CORP")?.ticker).toBe("XOM");
    expect(listingFor("EXXON")).toBeNull();
    expect(listingFor(null)).toBeNull();
  });
});
