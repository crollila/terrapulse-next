/**
 * Prints SHA-256 fingerprints of the economic network (src/sim/graph.ts buildGraph) and of the
 * company exposures for three fixed wind scenarios. Used to prove that refactoring the network
 * builder does not change what the wind scenario shows: graph.golden.test.ts pins these values.
 *
 * Run from the project root: node research/scripts/graph_fingerprint.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));
const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

const server = await createServer({ root: ROOT, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const h = await server.ssrLoadModule("/src/sim/hurricane.ts");
  const g = await server.ssrLoadModule("/src/sim/graph.ts");
  const infra = await server.ssrLoadModule("/src/data/infrastructure.ts");
  const refineries = infra.validateRefineries(read("public/data/infrastructure/refineries.json"));
  const ports = infra.validatePorts(read("public/data/infrastructure/ports.json"));
  const cases = {
    scenario001: h.SCENARIO_001,
    tropicalStorm: { ...h.SCENARIO_001, vmaxKt: 40 },
    newOrleans34kt: { ...h.SCENARIO_001, landfallLat: 29.3, landfallLon: -90.1, headingDeg: 350, exposureThresholdKt: 34, vmaxKt: 120 },
  };
  for (const [name, p] of Object.entries(cases)) {
    const s = h.runScenario(p, refineries, ports);
    const graph = g.buildGraph(s);
    console.log(name, "graph", sha(graph), "nodes", graph.nodes.length, "edges", graph.edges.length, "companies", sha(g.companyExposures(s)));
  }
} finally {
  await server.close();
}
