/**
 * Economic impact graph for a scenario. Every edge carries its meaning, its basis and a source.
 * Basis: SOURCED (documented relationship), MODELED (computed by the scenario engine),
 * RESEARCH HYPOTHESIS (plausible dependency, direction only, never a number).
 */
import type { EvidenceClass } from "../data/types";
import { FUNDS, listingFor, niceName } from "../data/companies";
import type { ScenarioResult } from "./hurricane";

export type NodeType = "hazard" | "asset" | "activity" | "commodity" | "industry" | "company" | "fund";
export type EdgeBasis = "SOURCED" | "MODELED" | "RESEARCH HYPOTHESIS";

/** Column order in the graph and reveal order on the timeline. */
export const TIERS: NodeType[] = ["hazard", "asset", "activity", "company", "commodity", "industry", "fund"];
export const TIER_LABEL: Record<NodeType, string> = {
  hazard: "Hazard",
  asset: "Infrastructure",
  activity: "Economic activity",
  company: "Operators",
  commodity: "Commodities",
  industry: "Industries",
  fund: "Funds",
};

export interface Fact {
  label: string;
  value: string;
  evidence: EvidenceClass;
  source?: { label: string; url: string };
  note?: string;
}

export interface GNode {
  id: string;
  type: NodeType;
  tier: number;
  label: string;
  sub?: string;
  evidence: EvidenceClass;
  /** Map asset id this node stands for (refinery or port), for globe <-> graph sync. */
  assetId?: string;
  /** Map asset ids associated with this node (e.g. a company's exposed refineries). */
  assetIds?: string[];
  /** Hour at which the node becomes active in the modelled window (assets only). */
  onsetH?: number | null;
  facts: Fact[];
  /** Relative weight for sizing (0..1). */
  weight?: number;
}

export interface GEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  basis: EdgeBasis;
  meaning: string;
  source?: { label: string; url: string };
}

export interface ImpactGraph {
  nodes: GNode[];
  edges: GEdge[];
}

const EIA_REFCAP = { label: "EIA Refinery Capacity Report", url: "https://www.eia.gov/petroleum/refinerycapacity/" };
const EIA_REFINING = { label: "EIA, Refining crude oil", url: "https://www.eia.gov/energyexplained/oil-and-petroleum-products/refining-crude-oil.php" };
const EIA_GASOLINE = { label: "EIA, Use of gasoline", url: "https://www.eia.gov/energyexplained/gasoline/use-of-gasoline.php" };
const EIA_DIESEL = { label: "EIA, Use of diesel", url: "https://www.eia.gov/energyexplained/diesel-fuel/use-of-diesel.php" };
const EIA_OIL_USE = { label: "EIA, Use of oil", url: "https://www.eia.gov/energyexplained/oil-and-petroleum-products/use-of-oil.php" };
const USACE_PORTS = { label: "USACE / BTS Principal Ports", url: "https://www.arcgis.com/home/item.html?id=e3b6065cce144be8a13a59e03c4195fe" };
const MODEL = { label: "TerraPulse hurricane wind-exposure screen (see Methods)", url: "#methods" };

const fmtInt = (n: number) => Math.round(n).toLocaleString("en-US");
export const fmtBpd = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} million b/d` : `${fmtInt(n)} b/d`);
const fmtTons = (n: number) => `${(n / 1e6).toFixed(1)} million short tons/yr`;
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

/** Company-level physical exposure computed from the refinery dataset. */
export interface CompanyExposure {
  corporation: string;
  displayName: string;
  ticker: string | null;
  listingStatus: string;
  exposedBpd: number;
  totalUsBpd: number;
  share: number | null;
  refineryIds: string[];
}

export function companyExposures(s: ScenarioResult): CompanyExposure[] {
  const total = new Map<string, number>();
  for (const r of s.refineries) {
    const k = r.corporation ?? r.company;
    total.set(k, (total.get(k) ?? 0) + (r.capacityBpd ?? 0));
  }
  const exp = new Map<string, { bpd: number; ids: string[] }>();
  for (const r of s.refineriesInFootprint) {
    const k = r.corporation ?? r.company;
    const e = exp.get(k) ?? { bpd: 0, ids: [] };
    e.bpd += r.capacityBpd ?? 0;
    e.ids.push(r.id);
    exp.set(k, e);
  }
  return [...exp.entries()]
    .map(([corporation, e]) => {
      const l = listingFor(corporation);
      const totalUsBpd = total.get(corporation) ?? 0;
      return {
        corporation,
        displayName: l?.displayName ?? niceName(corporation),
        ticker: l?.ticker ?? null,
        listingStatus: l?.status ?? "listing not mapped",
        exposedBpd: e.bpd,
        totalUsBpd,
        share: totalUsBpd > 0 ? e.bpd / totalUsBpd : null,
        refineryIds: e.ids,
      };
    })
    .sort((a, b) => b.exposedBpd - a.exposedBpd || a.corporation.localeCompare(b.corporation));
}

export const MAX_ASSET_NODES = 6;
export const MAX_COMPANY_NODES = 8;

export function buildGraph(s: ScenarioResult): ImpactGraph {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const tier = (t: NodeType) => TIERS.indexOf(t);
  const add = (n: Omit<GNode, "tier">) => nodes.push({ ...n, tier: tier(n.type) });
  const link = (from: string, to: string, kind: string, basis: EdgeBasis, meaning: string, source?: { label: string; url: string }) =>
    edges.push({ id: `${from}>${to}`, from, to, kind, basis, meaning, source });

  const p = s.params;
  add({
    id: "hazard",
    type: "hazard",
    label: s.category > 0 ? `Category ${s.category} hurricane` : "Tropical storm",
    sub: "Hypothetical scenario",
    evidence: "HYPOTHETICAL",
    facts: [
      { label: "Maximum sustained wind", value: `${p.vmaxKt} kt`, evidence: "HYPOTHETICAL", note: "Chosen input, not a forecast." },
      { label: "Radius of maximum wind", value: `${p.rmaxKm} km`, evidence: "HYPOTHETICAL" },
      { label: "Hurricane-force (64 kt) radius", value: s.radiiKm.r64 ? `${s.radiiKm.r64.toFixed(0)} km` : "not reached", evidence: "MODELED", source: MODEL },
      { label: "Track", value: `heading ${p.headingDeg}° at ${p.forwardSpeedKmh} km/h`, evidence: "HYPOTHETICAL" },
    ],
  });

  const refs = s.refineriesInFootprint;
  const ports = s.portsInFootprint;
  const maxCap = Math.max(1, ...refs.map((r) => r.capacityBpd ?? 0));
  const shownRefs = refs.slice(0, MAX_ASSET_NODES);
  for (const r of shownRefs) {
    const id = `asset:${r.id}`;
    add({
      id,
      type: "asset",
      label: `${niceName(r.name)} refinery`,
      sub: niceName(r.company),
      evidence: "OBSERVED",
      assetId: r.id,
      onsetH: r.tOnsetThresholdH,
      weight: (r.capacityBpd ?? 0) / maxCap,
      facts: [
        { label: "Crude distillation capacity", value: r.capacityBpd != null ? fmtBpd(r.capacityBpd) : "Insufficient validated data", evidence: "OBSERVED", source: EIA_REFCAP, note: "Atmospheric crude distillation, barrels per calendar day." },
        { label: "Operator", value: niceName(r.company), evidence: "OBSERVED", source: EIA_REFCAP },
        { label: "Location", value: `${r.city ? niceName(r.city) + ", " : ""}${r.state ?? ""} (${r.lat.toFixed(3)}, ${r.lon.toFixed(3)})`, evidence: "OBSERVED", source: EIA_REFCAP },
        { label: "Modelled peak wind", value: `${r.peakWindKt.toFixed(0)} kt`, evidence: "MODELED", source: MODEL, note: "Open-water wind with no decay over land; an upper-bound screen." },
        { label: "Closest approach of the centre", value: `${r.closestApproachKm.toFixed(0)} km`, evidence: "MODELED", source: MODEL },
      ],
    });
    link("hazard", id, "physical exposure", "MODELED", `Modelled peak wind at the site (${r.peakWindKt.toFixed(0)} kt) reaches the ${p.exposureThresholdKt}-kt exposure threshold. Exposure is not damage.`, MODEL);
    link(id, "act:refining", "has refining capacity", "SOURCED", "The facility's atmospheric crude distillation capacity as reported to EIA.", EIA_REFCAP);
  }
  if (refs.length > shownRefs.length) {
    const rest = refs.slice(shownRefs.length);
    const cap = rest.reduce((a, r) => a + (r.capacityBpd ?? 0), 0);
    add({
      id: "asset:other-refineries",
      type: "asset",
      label: `${rest.length} more refineries`,
      sub: fmtBpd(cap),
      evidence: "OBSERVED",
      assetIds: rest.map((r) => r.id),
      facts: [{ label: "Combined capacity", value: fmtBpd(cap), evidence: "OBSERVED", source: EIA_REFCAP }],
      weight: cap / maxCap / 2,
    });
    link("hazard", "asset:other-refineries", "physical exposure", "MODELED", "Smaller refineries whose modelled peak wind also reaches the threshold.", MODEL);
    link("asset:other-refineries", "act:refining", "has refining capacity", "SOURCED", "Capacity as reported to EIA.", EIA_REFCAP);
  }
  for (const pt of ports.slice(0, 3)) {
    const id = `asset:${pt.id}`;
    add({
      id,
      type: "asset",
      label: pt.name.replace(/, [A-Z]{2}.*$/, ""),
      sub: "Port",
      evidence: "OBSERVED",
      assetId: pt.id,
      onsetH: pt.tOnsetThresholdH,
      weight: 0.3,
      facts: [
        { label: "Cargo handled", value: pt.totalTons != null ? fmtTons(pt.totalTons) : "Insufficient validated data", evidence: "OBSERVED", source: USACE_PORTS, note: `Calendar year ${pt.year ?? "n/a"}.` },
        { label: "Modelled peak wind", value: `${pt.peakWindKt.toFixed(0)} kt`, evidence: "MODELED", source: MODEL },
      ],
    });
    link("hazard", id, "physical exposure", "MODELED", `Modelled peak wind at the port (${pt.peakWindKt.toFixed(0)} kt) reaches the exposure threshold.`, MODEL);
    link(id, "act:ports", "handles cargo", "SOURCED", "Annual tonnage reported by the U.S. Army Corps of Engineers.", USACE_PORTS);
  }

  if (refs.length) {
    add({
      id: "act:refining",
      type: "activity",
      label: "Crude oil refining",
      sub: `${fmtBpd(s.capacityInFootprintBpd)} in footprint`,
      evidence: "MODELED",
      assetIds: refs.map((r) => r.id),
      facts: [
        {
          label: "Refining capacity inside the footprint",
          value: fmtBpd(s.capacityInFootprintBpd),
          evidence: "MODELED",
          source: MODEL,
          note: `Sum of EIA capacity over ${refs.length} refineries whose modelled peak wind is at least ${p.exposureThresholdKt} kt. Capacity at risk of exposure, NOT lost production.`,
        },
        {
          label: "Share of U.S. operable capacity in the dataset",
          value: s.capacityShare != null ? pct(s.capacityShare) : "Insufficient validated data",
          evidence: "MODELED",
          source: EIA_REFCAP,
          note: `${fmtBpd(s.capacityInFootprintBpd)} of ${fmtBpd(s.datasetCapacityBpd)}.`,
        },
        { label: "Expected outage size and duration", value: "Not estimated", evidence: "RESEARCH HYPOTHESIS", note: "No validated vulnerability relationship links wind speed to refinery shutdowns in this model." },
      ],
    });
    add({ id: "com:crude", type: "commodity", label: "Crude oil", sub: "Refinery input", evidence: "OBSERVED", facts: [{ label: "Price effect", value: "Cannot be estimated", evidence: "RESEARCH HYPOTHESIS", note: "Reduced refinery runs lower local crude demand while port closures can limit supply; the net direction is not determined by this model." }] });
    for (const [id, label] of [["com:gasoline", "Gasoline"], ["com:distillate", "Diesel and distillate"], ["com:jet", "Jet fuel"]] as const) {
      add({ id, type: "commodity", label, sub: "Refined product", evidence: "OBSERVED", facts: [{ label: "Price effect", value: "Cannot be estimated", evidence: "RESEARCH HYPOTHESIS", note: "Less refining capacity available would tighten supply. Size and timing are not forecast. See the Hurricane Harvey record for one historical case." }] });
      link("act:refining", id, "produces", "SOURCED", "Refineries turn crude oil into gasoline, distillate fuels and jet fuel.", EIA_REFINING);
    }
    link("com:crude", "act:refining", "input to", "SOURCED", "Crude oil is the feedstock of refining.", EIA_REFINING);

    add({ id: "ind:road", type: "industry", label: "Road transport and motorists", evidence: "OBSERVED", facts: [{ label: "Dependency", value: "Gasoline consumer", evidence: "OBSERVED", source: EIA_GASOLINE }] });
    add({ id: "ind:freight", type: "industry", label: "Trucking and freight", evidence: "OBSERVED", facts: [{ label: "Dependency", value: "Diesel consumer", evidence: "OBSERVED", source: EIA_DIESEL }] });
    add({ id: "ind:airlines", type: "industry", label: "Airlines", evidence: "OBSERVED", facts: [{ label: "Dependency", value: "Jet fuel consumer", evidence: "OBSERVED", source: EIA_OIL_USE }, { label: "Cost effect", value: "Cannot be estimated", evidence: "RESEARCH HYPOTHESIS", note: "Airlines hedge and buy fuel in many markets; no sensitivity is quantified here." }] });
    link("com:gasoline", "ind:road", "consumed by", "SOURCED", "Most gasoline is used in light-duty vehicles.", EIA_GASOLINE);
    link("com:distillate", "ind:freight", "consumed by", "SOURCED", "Diesel fuels most freight trucks, trains and vessels.", EIA_DIESEL);
    link("com:jet", "ind:airlines", "consumed by", "SOURCED", "Jet fuel is the main fuel of commercial aviation.", EIA_OIL_USE);

    add({ id: "ind:refining", type: "industry", label: "Refining industry", evidence: "OBSERVED", facts: [{ label: "Margin effect", value: "Cannot be estimated", evidence: "RESEARCH HYPOTHESIS", note: "Refiners outside the footprint can benefit from higher product prices while those inside lose output; the net effect per company is not modelled." }] });
    link("act:refining", "ind:refining", "is the activity of", "SOURCED", "Refining capacity belongs to the refining industry.", EIA_REFCAP);
  }
  if (ports.length) {
    add({
      id: "act:ports",
      type: "activity",
      label: "Port cargo handling",
      sub: `${fmtTons(s.tonsInFootprint)}`,
      evidence: "MODELED",
      assetIds: ports.map((x) => x.id),
      facts: [
        { label: "Annual tonnage of ports inside the footprint", value: fmtTons(s.tonsInFootprint), evidence: "MODELED", source: USACE_PORTS, note: `${ports.length} principal ports. Annual totals, not tonnage delayed by the storm.` },
        { label: "Share of principal-port tonnage", value: s.datasetTons > 0 ? pct(s.tonsInFootprint / s.datasetTons) : "n/a", evidence: "MODELED", source: USACE_PORTS },
      ],
    });
    add({ id: "ind:shipping", type: "industry", label: "Marine shipping and trade", evidence: "OBSERVED", facts: [{ label: "Dependency", value: "Uses the exposed ports", evidence: "OBSERVED", source: USACE_PORTS }] });
    link("act:ports", "ind:shipping", "serves", "SOURCED", "Waterborne cargo moves through these ports.", USACE_PORTS);
    if (refs.length) link("act:ports", "com:crude", "moves", "RESEARCH HYPOTHESIS", "Gulf Coast ports handle crude oil and product cargoes; the share is not quantified in this dataset.");
  }

  const comps = companyExposures(s);
  const shownTickers = new Set<string>();
  for (const c of comps.slice(0, MAX_COMPANY_NODES)) {
    const id = `co:${c.corporation}`;
    if (c.ticker) shownTickers.add(c.ticker);
    add({
      id,
      type: "company",
      label: c.ticker ? `${c.displayName} (${c.ticker})` : c.displayName,
      sub: c.ticker ? `${c.share != null ? pct(c.share) : "n/a"} of its U.S. capacity` : c.listingStatus,
      evidence: "OBSERVED",
      assetIds: c.refineryIds,
      weight: c.share ?? 0,
      facts: [
        { label: "Refining capacity inside the footprint", value: fmtBpd(c.exposedBpd), evidence: "MODELED", source: MODEL, note: `${c.refineryIds.length} refiner${c.refineryIds.length === 1 ? "y" : "ies"} owned per EIA.` },
        { label: "Share of the company's U.S. refining capacity", value: c.share != null ? pct(c.share) : "Insufficient validated data", evidence: "MODELED", source: EIA_REFCAP, note: `${fmtBpd(c.exposedBpd)} of ${fmtBpd(c.totalUsBpd)} U.S. capacity. Refining outside the U.S. and other business lines are not counted.` },
        { label: "Listing", value: c.ticker ? `${c.ticker} (${c.listingStatus})` : c.listingStatus, evidence: "OBSERVED" },
        { label: "Share-price effect", value: "Cannot be estimated", evidence: "RESEARCH HYPOTHESIS", note: "Physical exposure is not a return forecast. No validated price model or redistributable price history is included." },
      ],
    });
    for (const rid of c.refineryIds) {
      const assetNode = shownRefs.some((r) => r.id === rid) ? `asset:${rid}` : "asset:other-refineries";
      if (!edges.some((e) => e.id === `${assetNode}>${id}`)) link(assetNode, id, "owned by", "SOURCED", "Corporate owner as listed in the EIA Refinery Capacity Report.", EIA_REFCAP);
    }
    link(id, "ind:refining", "member of", "SOURCED", "The company owns operable refining capacity.", EIA_REFCAP);
  }
  for (const f of FUNDS) {
    const members = f.members.filter((t) => shownTickers.has(t));
    const industryNode = f.industry === "energy" ? "ind:refining" : "ind:airlines";
    if (!nodes.some((n) => n.id === industryNode)) continue;
    add({
      id: `fund:${f.ticker}`,
      type: "fund",
      label: f.ticker,
      sub: f.name,
      evidence: "OBSERVED",
      facts: [
        { label: "Tracks", value: f.tracks, evidence: "OBSERVED", source: { label: f.sourceLabel, url: f.sourceUrl } },
        { label: "Exposed operators that fall inside its index definition", value: members.length ? members.join(", ") : "none of the exposed operators", evidence: "OBSERVED", source: { label: f.sourceLabel, url: f.sourceUrl }, note: "Membership follows the index definition; confirm current holdings with the issuer." },
        { label: "Fund-level exposure", value: "Insufficient validated data", evidence: "RESEARCH HYPOTHESIS", note: "Holdings weights are not included, so no fund-level figure is calculated." },
      ],
    });
    link(industryNode, `fund:${f.ticker}`, "tracked by", "SOURCED", `${f.ticker} tracks the ${f.tracks}.`, { label: f.sourceLabel, url: f.sourceUrl });
  }
  return { nodes, edges };
}

/** All nodes reachable upstream and downstream of a node (the impact chain through it). */
export function chainOf(graph: ImpactGraph, nodeId: string): { nodes: Set<string>; edges: Set<string> } {
  const ns = new Set<string>([nodeId]);
  const es = new Set<string>();
  const walk = (dir: "from" | "to") => {
    const other = dir === "from" ? "to" : "from";
    const stack = [nodeId];
    const seen = new Set<string>([nodeId]);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of graph.edges) {
        if (e[dir] !== cur) continue;
        es.add(e.id);
        const nxt = e[other];
        if (!seen.has(nxt)) {
          seen.add(nxt);
          ns.add(nxt);
          stack.push(nxt);
        }
      }
    }
  };
  walk("from");
  walk("to");
  return { nodes: ns, edges: es };
}

/** Is a node visible at a timeline state? Assets appear when their own threshold onset is reached. */
export function nodeVisible(n: GNode, graphDepth: number, tH: number | null): boolean {
  if (n.tier > graphDepth) return false;
  if (n.type === "asset" && tH !== null && n.onsetH != null) return tH >= n.onsetH;
  if (n.type === "asset" && tH !== null && n.onsetH === undefined) return graphDepth >= 1 && tH >= 0;
  return true;
}
