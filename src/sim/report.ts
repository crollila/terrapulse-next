/**
 * Scenario report: a plain Markdown evidence pack of everything the simulator computed, with the
 * evidence class and source of each figure. Deterministic apart from the generation timestamp,
 * which the caller supplies. It is produced in the browser; no AI is involved.
 */
import { niceName } from "../data/companies";
import type { InfrastructureMeta } from "../data/types";
import { MODEL_CARD, saffirSimpsonCategory, type ScenarioResult } from "./hurricane";
import type { CompanyExposure, ImpactGraph } from "./graph";

const int = (n: number) => Math.round(n).toLocaleString("en-US");
const h = (v: number | null) => (v === null ? "never" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} h`);

export function buildScenarioReport(args: { result: ScenarioResult; graph: ImpactGraph; companies: CompanyExposure[]; refineryMeta: InfrastructureMeta | null; portMeta: InfrastructureMeta | null; generatedAt: string }): string {
  const { result: s, graph, companies, refineryMeta, portMeta, generatedAt } = args;
  const p = s.params;
  const cat = saffirSimpsonCategory(p.vmaxKt);
  const L: string[] = [];
  L.push(`# TerraPulse scenario report`);
  L.push("");
  L.push(`Generated ${generatedAt} by TerraPulse Next (https://crollila.github.io/terrapulse-next/).`);
  L.push("");
  L.push(`> **HYPOTHETICAL scenario. Not a forecast of any real storm.** Figures marked MODELED are computed by the documented wind-exposure screen from the inputs below; figures marked OBSERVED come from the cited public datasets. Capacity inside the footprint is exposure, not lost production. No outage, price or return is estimated.`);
  L.push("");
  L.push(`## 1. Inputs (HYPOTHETICAL, chosen by the user)`);
  L.push("");
  L.push(`| Input | Value |`);
  L.push(`|---|---|`);
  L.push(`| Hazard | ${cat ? `Category ${cat} hurricane` : "Tropical storm"} |`);
  L.push(`| Maximum 1-minute sustained wind | ${p.vmaxKt} kt |`);
  L.push(`| Radius of maximum wind | ${p.rmaxKm} km |`);
  L.push(`| Holland B | ${p.hollandB} |`);
  L.push(`| Landfall point | ${p.landfallLat}°, ${p.landfallLon}° |`);
  L.push(`| Heading, forward speed | ${p.headingDeg}°, ${p.forwardSpeedKmh} km/h |`);
  L.push(`| Weakening after landfall | ${p.inlandDecay ? `on, decay rate ${p.decayRatePerH} per hour (assumption)` : "off (upper bound)"} |`);
  L.push(`| Exposure threshold (assumption) | ${p.exposureThresholdKt} kt |`);
  L.push("");
  L.push(`## 2. Exposure (MODELED)`);
  L.push("");
  L.push(`- Refining capacity inside the ${p.exposureThresholdKt}-kt footprint: **${int(s.capacityInFootprintBpd)} b/d** across ${s.refineriesInFootprint.length} refineries${s.capacityShare !== null ? `, ${(100 * s.capacityShare).toFixed(1)}% of the ${int(s.datasetCapacityBpd)} b/d in the EIA file` : ""}.`);
  if (s.footprintCapacityUnknown) L.push(`- ${s.footprintCapacityUnknown} exposed site(s) have no capacity in the EIA file and are excluded from the sum.`);
  L.push(`- Principal ports inside the footprint: ${s.portsInFootprint.length}, handling ${int(s.tonsInFootprint)} short tons per year in total (annual totals, not delayed cargo).`);
  L.push(`- Wind radii before landfall: 34 kt ${s.radiiKm.r34 ? s.radiiKm.r34.toFixed(0) + " km" : "not reached"}; 64 kt ${s.radiiKm.r64 ? s.radiiKm.r64.toFixed(0) + " km" : "not reached"}; 96 kt ${s.radiiKm.r96 ? s.radiiKm.r96.toFixed(0) + " km" : "not reached"}.`);
  L.push("");
  L.push(`### Refineries inside the footprint`);
  L.push("");
  L.push(`Capacity, operator and owner: OBSERVED (EIA). Peak wind and onset: MODELED. Onset is hours relative to landfall.`);
  L.push("");
  L.push(`| Refinery | Operator | Owner (EIA) | State | Capacity b/d | Peak wind kt | Reaches ${p.exposureThresholdKt} kt |`);
  L.push(`|---|---|---|---|---:|---:|---|`);
  for (const r of s.refineriesInFootprint) L.push(`| ${niceName(r.name)} | ${niceName(r.company)} | ${niceName(r.corporation ?? r.company)} | ${r.state ?? ""} | ${r.capacityBpd !== null ? int(r.capacityBpd) : "Insufficient validated data"} | ${r.peakWindKt.toFixed(0)} | ${h(r.tOnsetThresholdH)} |`);
  if (!s.refineriesInFootprint.length) L.push(`| none | | | | | | |`);
  L.push("");
  L.push(`### Ports inside the footprint`);
  L.push("");
  L.push(`| Port | Short tons per year (OBSERVED) | Peak wind kt (MODELED) |`);
  L.push(`|---|---:|---:|`);
  for (const pt of s.portsInFootprint) L.push(`| ${pt.name} | ${pt.totalTons !== null ? int(pt.totalTons) : "Insufficient validated data"} | ${pt.peakWindKt.toFixed(0)} |`);
  if (!s.portsInFootprint.length) L.push(`| none | | |`);
  L.push("");
  L.push(`## 3. Owners of exposed refineries`);
  L.push("");
  L.push(`Share = capacity inside the footprint ÷ the owner's total U.S. refining capacity in the EIA file. Refining outside the U.S. and other business lines are not counted. This is physical exposure, not a financial estimate.`);
  L.push("");
  L.push(`| Owner | Listing | Exposed b/d | U.S. total b/d | Share |`);
  L.push(`|---|---|---:|---:|---:|`);
  for (const c of companies) L.push(`| ${c.displayName} | ${c.ticker ?? c.listingStatus} | ${int(c.exposedBpd)} | ${int(c.totalUsBpd)} | ${c.share !== null ? (100 * c.share).toFixed(1) + "%" : "n/a"} |`);
  if (!companies.length) L.push(`| none | | | | |`);
  L.push("");
  L.push(`## 4. Economic relationships used`);
  L.push("");
  const kinds = new Map<string, { basis: string; meaning: string; source?: string; n: number }>();
  for (const e of graph.edges) {
    const k = `${e.kind}|${e.basis}`;
    const cur = kinds.get(k);
    if (cur) cur.n++;
    else kinds.set(k, { basis: e.basis, meaning: e.meaning, source: e.source && !e.source.url.startsWith("#") ? `${e.source.label}, ${e.source.url}` : e.source?.label, n: 1 });
  }
  L.push(`| Relationship | Basis | Links | Example meaning | Source |`);
  L.push(`|---|---|---:|---|---|`);
  for (const [k, v] of kinds) L.push(`| ${k.split("|")[0]} | ${v.basis} | ${v.n} | ${v.meaning.replace(/\|/g, "/")} | ${v.source ?? "none (hypothesis)"} |`);
  L.push("");
  L.push(`## 5. Not estimated`);
  L.push("");
  L.push(`- Refinery shutdowns, damage, outage size and duration: no validated vulnerability relationship.`);
  L.push(`- Fuel, crude oil or other commodity prices: cannot be estimated.`);
  L.push(`- Company share prices, fund values, portfolio returns: Insufficient validated data.`);
  L.push("");
  L.push(`## 6. Method`);
  L.push("");
  L.push(`${MODEL_CARD.name}. Status: ${MODEL_CARD.status}.`);
  L.push("");
  L.push("```");
  L.push(...MODEL_CARD.formula);
  L.push("```");
  L.push("");
  L.push(`Assumptions:`);
  for (const a of MODEL_CARD.assumptions) L.push(`- ${a}`);
  L.push("");
  L.push(`Limitations:`);
  for (const a of MODEL_CARD.limitations) L.push(`- ${a}`);
  L.push("");
  L.push(`## 7. Sources`);
  L.push("");
  if (refineryMeta) L.push(`- Refineries: ${refineryMeta.provider}. ${refineryMeta.dataset}. Capacity as of ${refineryMeta.dataAsOf ?? "n/a"}; retrieved ${refineryMeta.retrievedAt}. ${refineryMeta.landingPage ?? refineryMeta.sourceUrl}`);
  if (portMeta) L.push(`- Ports: ${portMeta.provider}. ${portMeta.dataset}, ${portMeta.dataAsOf ?? "n/a"}; retrieved ${portMeta.retrievedAt}. ${portMeta.landingPage ?? portMeta.sourceUrl}`);
  for (const r of MODEL_CARD.references) L.push(`- ${r}`);
  L.push("");
  L.push(`Scenario parameters (JSON, can be re-imported in the simulator):`);
  L.push("");
  L.push("```json");
  L.push(JSON.stringify({ app: "terrapulse-next", kind: "hurricane-scenario", version: 1, params: p }, null, 2));
  L.push("```");
  L.push("");
  return L.join("\n");
}
