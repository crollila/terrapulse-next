import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SCENARIO_001, runScenario } from "./hurricane";
import { buildGraph, companyExposures } from "./graph";
import { buildScenarioReport } from "./report";
import { validatePorts, validateRefineries } from "../data/infrastructure";

const read = (p: string) => JSON.parse(readFileSync(new URL(`../../public/data/${p}`, import.meta.url), "utf8"));
const rj = read("infrastructure/refineries.json");
const pj = read("infrastructure/ports.json");
const refineries = validateRefineries(rj);
const ports = validatePorts(pj);

function report(params = SCENARIO_001) {
  const result = runScenario(params, refineries, ports);
  return { result, text: buildScenarioReport({ result, graph: buildGraph(result), companies: companyExposures(result), refineryMeta: rj.meta, portMeta: pj.meta, generatedAt: "2026-11-15T00:00:00Z" }) };
}

describe("scenario report", () => {
  it("states the headline figure exactly as computed and labels the scenario hypothetical", () => {
    const { result, text } = report();
    expect(text).toContain(`**${Math.round(result.capacityInFootprintBpd).toLocaleString("en-US")} b/d**`);
    expect(text).toContain("HYPOTHETICAL scenario. Not a forecast");
    expect(text).toContain("exposure, not lost production");
  });
  it("lists every exposed refinery once with its source-backed capacity", () => {
    const { result, text } = report();
    const rows = text.split("\n").filter((l) => /^\| .* \| (Texas|Louisiana) \|/.test(l));
    expect(rows.length).toBe(result.refineriesInFootprint.length);
  });
  it("never states a price or return number", () => {
    const { text } = report();
    expect(text).toContain("cannot be estimated");
    expect(text).not.toMatch(/\$\s?\d/);
  });
  it("is deterministic for the same inputs and timestamp", () => {
    expect(report().text).toBe(report().text);
  });
  it("embeds re-importable parameters", () => {
    const { text } = report();
    const json = text.slice(text.lastIndexOf("```json") + 7, text.lastIndexOf("```"));
    expect(JSON.parse(json).params).toEqual(SCENARIO_001);
  });
  it("handles a scenario with no exposure", () => {
    const { text } = report({ ...SCENARIO_001, vmaxKt: 40 });
    expect(text).toContain("**0 b/d** across 0 refineries");
    expect(text).toContain("| none |");
  });
});
