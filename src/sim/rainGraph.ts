/**
 * The observed-rainfall screen described as an exposure set for the shared economic network
 * (graph.ts). Physical exposure here is OBSERVED rainfall compared with NOAA Atlas 14; everything
 * downstream of the sites is the same documented network the wind scenario uses, with the same
 * rule: research hypotheses carry no number.
 */
import type { Port, Refinery } from "../data/types";
import type { ExposureSet, Fact } from "./graph";
import { DURATIONS, MM_PER_INCH, ariFor, type AssetRain, type RainExposure, type Reading } from "./rainfall";

const MODEL = { label: "TerraPulse observed-rainfall screen (see Methods)", url: "#methods" };
const STAGE4 = { label: "NOAA Stage IV daily precipitation analysis", url: "https://water.noaa.gov/precip" };
const ATLAS14 = { label: "NOAA Atlas 14 precipitation frequency estimates", url: "https://hdsc.nws.noaa.gov/pfds/" };
const USGS_HWM = { label: "USGS Flood Event Data, 2017 Harvey", url: "https://apps.usgs.gov/stnweb" };
const NHC = { label: "NHC Tropical Cyclone Report AL092017", url: "https://www.nhc.noaa.gov/data/tcr/AL092017_Harvey.pdf" };

const mm = (v: number | null) => (v === null ? "n/a" : `${v.toFixed(0)} mm (${(v / MM_PER_INCH).toFixed(1)} in)`);
const yr = (a: number) => `${a.toLocaleString("en-US")}-year`;

export interface RainGraphInput {
  /** Exposure of each site, computed from the rainfall days completed so far. */
  exposures: RainExposure[];
  /** The per-site records the exposures were computed from (for terrain and flood evidence). */
  assets: AssetRain[];
  refineries: Refinery[];
  ports: Port[];
  /** Every refinery in the app's dataset (for owners' totals). */
  allRefineries: Refinery[];
  datasetTons: number;
  ariYears: number;
  reading: Reading;
  /** Text for "through <date>", e.g. "through 30 Aug 2017, 12:00 UTC". */
  through: string;
}

function siteFacts(e: RainExposure, a: AssetRain | undefined, reading: Reading): Fact[] {
  const ari = ariFor(e, reading);
  const dur = DURATIONS.find((d) => d.key === e.peakDuration);
  const facts: Fact[] = [
    { label: "Observed rainfall", value: mm(e.totalMm), evidence: "OBSERVED", source: STAGE4, note: "Radar and rain-gauge analysis; the 4-km cell containing the site point." },
    {
      label: "Rarity of that rainfall",
      value: ari === null ? "not classified" : ari >= 1000 ? "at or above NOAA's 1,000-year depth" : `at or above NOAA's ${yr(ari)} depth`,
      evidence: "MODELED",
      source: ATLAS14,
      note: `Largest total over ${dur ? dur.label : "1 to 7 days"} compared with NOAA Atlas 14 at this point${e.peakRatioTo100yr !== null ? `; ${e.peakRatioTo100yr.toFixed(2)} times the 100-year depth` : ""}. Not extrapolated past 1,000 years.`,
    },
  ];
  if (a) {
    facts.push({
      label: "USGS high-water marks within 5 km",
      value: a.hwm.within5km ? `${a.hwm.within5km}${a.hwm.maxHeightFtWithin5km !== null ? `; highest ${a.hwm.maxHeightFtWithin5km.toFixed(1)} ft above ground` : ""}` : "none",
      evidence: "OBSERVED",
      source: USGS_HWM,
      note: "Marks show where survey crews recorded water, not conditions inside the facility. None nearby does not mean no flooding.",
    });
  }
  facts.push({ label: "Flood depth, damage or shutdown", value: "Not estimated", evidence: "RESEARCH HYPOTHESIS", note: "Rare rainfall is a hazard indicator. No validated relationship turns it into water depth or an outage here." });
  return facts;
}

export function rainExposureSet(inp: RainGraphInput): ExposureSet {
  const byId = new Map(inp.exposures.map((e) => [e.id, e]));
  const assetById = new Map(inp.assets.map((a) => [a.id, a]));
  const inside = (id: string) => {
    const e = byId.get(id);
    const a = e ? ariFor(e, inp.reading) : null;
    return a !== null && a >= inp.ariYears;
  };
  const refs = inp.refineries.filter((r) => inside(r.id)).sort((a, b) => (b.capacityBpd ?? 0) - (a.capacityBpd ?? 0) || a.id.localeCompare(b.id));
  const ports = inp.ports.filter((p) => inside(p.id)).sort((a, b) => (b.totalTons ?? 0) - (a.totalTons ?? 0) || a.id.localeCompare(b.id));
  const meaning = (id: string, what: string) => {
    const e = byId.get(id)!;
    return `Observed rainfall at the ${what} (${mm(e.totalMm)} ${inp.through}) reached NOAA's ${yr(inp.ariYears)} depth for the same place. Rare rainfall is not flooding or damage.`;
  };
  const totals = inp.exposures.map((e) => e.totalMm).filter((v): v is number => v !== null);
  return {
    hazard: {
      label: "Hurricane Harvey rainfall",
      sub: "Observed record, 2017",
      evidence: "OBSERVED",
      facts: [
        { label: "Storm", value: "Category 4 landfall near Rockport, Texas, then four days stalled", evidence: "HISTORICAL", source: NHC, note: "NHC: more than 60 inches of rain over southeastern Texas." },
        { label: "Rainfall counted", value: inp.through, evidence: "OBSERVED", source: STAGE4, note: "Whole 24-hour totals ending 12:00 UTC." },
        { label: "Wettest site in this dataset", value: totals.length ? mm(Math.max(...totals)) : "n/a", evidence: "OBSERVED", source: STAGE4, note: "Among the refineries and ports of the record area." },
        { label: "Screening threshold", value: `NOAA Atlas 14 ${yr(inp.ariYears)} depth (${inp.reading === "estimate" ? "estimate" : inp.reading === "conservative" ? "upper 90% bound" : "lower 90% bound"})`, evidence: "HYPOTHETICAL", note: "An assumption you choose. No damage threshold is validated." },
      ],
    },
    model: MODEL,
    linkBasis: "MODELED",
    area: "screen",
    refineries: refs.map((r) => ({ site: r, linkMeaning: meaning(r.id, "site"), facts: siteFacts(byId.get(r.id)!, assetById.get(r.id), inp.reading) })),
    ports: ports.map((p) => ({ site: p, linkMeaning: meaning(p.id, "port"), facts: siteFacts(byId.get(p.id)!, assetById.get(p.id), inp.reading) })),
    allRefineries: inp.allRefineries,
    datasetCapacityBpd: inp.allRefineries.reduce((s, r) => s + (r.capacityBpd ?? 0), 0),
    datasetTons: inp.datasetTons,
    restLinkMeaning: `Smaller refineries whose observed rainfall also reached NOAA's ${yr(inp.ariYears)} depth.`,
    capacityNote: `Sum of EIA capacity (as of 1 January 2026) over ${refs.length} refineries whose observed rainfall ${inp.through} reached NOAA's ${yr(inp.ariYears)} depth. Exposure to rare rainfall, NOT flooding, damage or lost production.`,
    outageNote: "No validated relationship links rainfall rarity to refinery shutdowns. In the Harvey hindcast this screen found 8 of the 14 refineries DOE counted as shut and included 6 that DOE did not count.",
  };
}
