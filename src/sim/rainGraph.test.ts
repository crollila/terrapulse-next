/**
 * The shared economic network: (1) fingerprints proving that the wind scenario's network is exactly
 * what it was before the builder was generalised (values from research/scripts/graph_fingerprint.mjs,
 * taken on the unmodified code), (2) the observed-rainfall exposure set and its network.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildExposureGraph, buildGraph, companyExposures, companyExposuresFrom, windExposureSet } from "./graph";
import { SCENARIO_001, runScenario } from "./hurricane";
import { rainExposureSet } from "./rainGraph";
import { exposuresToDate } from "./rainRecord";
import { parseHoldings, stressPortfolio } from "./portfolio";
import { validatePorts, validateRefineries } from "../data/infrastructure";
import type { RainAssetsFile } from "../data/rainfall";

const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")) as T;
const refineries = validateRefineries(read("public/data/infrastructure/refineries.json"));
const ports = validatePorts(read("public/data/infrastructure/ports.json"));
const rain = read<RainAssetsFile>("public/data/rainfall/harvey_2017_assets.json");
const sha = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

describe("wind network is unchanged by the generalised builder", () => {
  const cases = {
    scenario001: { p: SCENARIO_001, graph: "9b10b051d619bb5ab3e6d99468f15883d688350cc2ad8bc270347cb1e0835cc6", companies: "ec68e402c3c477e11eef1b142f6dd0650d3241ecc0f8b71d231c1b90fa9899a4", nodes: 32, edges: 50 },
    tropicalStorm: { p: { ...SCENARIO_001, vmaxKt: 40 }, graph: "745d02ac13c48a1dfd78d16671d4cb64d31f0ba0d6ca9c7fa669903d296b3b43", companies: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945", nodes: 1, edges: 0 },
    newOrleans34kt: { p: { ...SCENARIO_001, landfallLat: 29.3, landfallLon: -90.1, headingDeg: 350, exposureThresholdKt: 34, vmaxKt: 120 }, graph: "2384797096989388a78675fcfe0b27b6c81c02a8895cbdf07f58be5863267bf7", companies: "aa7514c9c12219accd7203695b0c3a2ce1fbd92f5e2da3c32d048da52fb89556", nodes: 32, edges: 48 },
  };
  for (const [name, c] of Object.entries(cases)) {
    it(`${name}: same nodes, edges, facts and wording as before`, () => {
      const s = runScenario(c.p, refineries, ports);
      const g = buildGraph(s);
      expect(g.nodes).toHaveLength(c.nodes);
      expect(g.edges).toHaveLength(c.edges);
      expect(sha(g)).toBe(c.graph);
      expect(sha(companyExposures(s))).toBe(c.companies);
      expect(sha(buildExposureGraph(windExposureSet(s)))).toBe(c.graph);
    });
  }
});

describe("observed-rainfall exposure set (Harvey, whole record, 100-year depth)", () => {
  const ids = new Set(rain.assets.map((a) => a.id));
  const refs = refineries.filter((r) => ids.has(r.id));
  const pts = ports.filter((p) => ids.has(p.id));
  const current = new Set([...refs, ...pts].map((s) => s.id));
  const assets = rain.assets.filter((a) => current.has(a.id));
  const datasetTons = ports.reduce((s, p) => s + (p.totalTons ?? 0), 0);
  const build = (ariYears: number, days = 10, reading: "estimate" | "conservative" | "liberal" = "estimate") =>
    rainExposureSet({ exposures: exposuresToDate(assets, days), assets, refineries: refs, ports: pts, allRefineries: refineries, datasetTons, ariYears, reading, through: "through 2 Sep 2017, 12:00 UTC" });
  const set = build(100);
  const g = buildExposureGraph(set);

  it("holds 16 refineries and 6 ports, largest first, 4.40 million b/d", () => {
    expect(set.refineries).toHaveLength(16);
    expect(set.ports).toHaveLength(6);
    const caps = set.refineries.map((e) => e.site.capacityBpd ?? 0);
    expect(caps).toEqual([...caps].sort((a, b) => b - a));
    expect(caps.reduce((a, b) => a + b, 0)).toBe(4_400_150);
    expect(set.refineries[0].site.id).toBe("eia-507-texas-port-arthur");
    expect(set.area).toBe("screen");
    expect(set.hazard.evidence).toBe("OBSERVED");
  });

  it("is empty before any rain and shrinks as the threshold rises", () => {
    expect(build(100, 0).refineries).toHaveLength(0);
    expect(buildExposureGraph(build(100, 0)).nodes).toHaveLength(1);
    const n = [10, 25, 100, 500, 1000].map((a) => build(a).refineries.length);
    for (let i = 1; i < n.length; i++) expect(n[i]).toBeLessThanOrEqual(n[i - 1]);
    expect(build(100, 10, "conservative").refineries.length).toBeLessThanOrEqual(set.refineries.length);
    expect(build(100, 10, "liberal").refineries.length).toBeGreaterThanOrEqual(set.refineries.length);
  });

  it("gives every site its observed rainfall, its rarity and an explicit 'not estimated' line", () => {
    for (const e of [...set.refineries, ...set.ports]) {
      expect(e.facts.map((f) => f.label)).toEqual(["Observed rainfall", "Rarity of that rainfall", "USGS high-water marks within 5 km", "Flood depth, damage or shutdown"]);
      expect(e.facts[0].evidence).toBe("OBSERVED");
      expect(e.facts[0].source?.url).toMatch(/^https:/);
      expect(e.facts[3].value).toBe("Not estimated");
      expect(e.linkMeaning).toMatch(/not flooding or damage/);
      expect(e.onsetH).toBeUndefined();
    }
  });

  it("builds the same downstream network as the wind scenario, with sourced links and unnumbered hypotheses", () => {
    expect(g.nodes[0]).toMatchObject({ id: "hazard", label: "Hurricane Harvey rainfall", evidence: "OBSERVED" });
    for (const id of ["act:refining", "act:ports", "com:gasoline", "com:distillate", "com:jet", "com:crude", "ind:refining", "ind:airlines", "ind:shipping", "fund:XLE"]) expect(g.nodes.some((n) => n.id === id)).toBe(true);
    for (const e of g.edges) {
      expect(e.meaning.length).toBeGreaterThan(10);
      if (e.basis !== "RESEARCH HYPOTHESIS") expect(e.source?.url).toBeTruthy();
      else expect(e.meaning).not.toMatch(/\d/); // a hypothesis never carries a number
    }
    const act = g.nodes.find((n) => n.id === "act:refining")!;
    expect(act.sub).toBe("4.40 million b/d in screen");
    expect(act.facts[0].note).toMatch(/NOT flooding, damage or lost production/);
    expect(act.facts[2]).toMatchObject({ label: "Expected outage size and duration", value: "Not estimated" });
    // no node claims a price, loss or return figure
    for (const n of g.nodes) for (const f of n.facts) if (/price|margin|cost|share-price/i.test(f.label)) expect(f.value).toBe("Cannot be estimated");
  });

  it("computes owner shares from EIA capacities and feeds the portfolio screen", () => {
    const comps = companyExposuresFrom(refineries, set.refineries.map((e) => e.site));
    const xom = comps.find((c) => c.ticker === "XOM")!;
    expect(xom.exposedBpd).toBe(1_176_500); // Baytown 564,500 + Beaumont 612,000
    expect(xom.share).toBeCloseTo(1_176_500 / xom.totalUsBpd, 12);
    expect(xom.share!).toBeGreaterThan(0.5);
    for (const c of comps) if (c.share !== null) expect(c.share).toBeGreaterThan(0);
    for (const c of comps) if (c.share !== null) expect(c.share).toBeLessThanOrEqual(1);
    const pf = stressPortfolio(parseHoldings("XOM 50\nAAPL 50").holdings, comps);
    expect(pf.weightWithDirectExposure).toBeCloseTo(0.5, 12);
    expect(pf.capacityWeightedExposure).toBeCloseTo(0.5 * xom.share!, 12);
    expect(pf.weightUnmapped).toBeCloseTo(0.5, 12);
  });
});
