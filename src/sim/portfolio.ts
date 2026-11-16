/**
 * Portfolio exposure screen. It reports documented physical exposure only and never a return.
 *
 * For each holding i with portfolio weight w_i:
 *   direct exposure share s_i = (company's refining capacity inside the footprint) / (company's U.S. refining capacity)
 *   (both from the EIA Refinery Capacity Report; s_i = 0 when the company owns refineries but none is in the footprint)
 * Portfolio figures:
 *   weightWithDirectExposure = sum of w_i over holdings with s_i > 0
 *   capacityWeightedExposure = sum of w_i * s_i     (an index of physical exposure between 0 and 1, not a loss)
 *   weightUnmapped           = sum of w_i over holdings with no documented relationship in TerraPulse
 */
import { FUNDS, listingByTicker } from "../data/companies";
import type { CompanyExposure } from "./graph";

export interface Holding {
  ticker: string;
  /** Any positive number; weights are normalised to sum to 1. */
  weight: number;
  entryValue?: number | null;
}

export type HoldingClass = "direct" | "refiner-not-exposed" | "fund" | "unmapped";

export interface HoldingResult {
  ticker: string;
  weight: number;
  cls: HoldingClass;
  exposureShare: number | null;
  exposedBpd: number | null;
  explanation: string;
}

export interface PortfolioResult {
  holdings: HoldingResult[];
  weightWithDirectExposure: number;
  capacityWeightedExposure: number;
  weightFunds: number;
  weightUnmapped: number;
  warnings: string[];
}

export function parseHoldings(text: string): { holdings: Holding[]; errors: string[] } {
  const holdings: Holding[] = [];
  const errors: string[] = [];
  for (const raw of text.split(/[\n;]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z.\-]{1,10})[\s,:=]+([0-9]*\.?[0-9]+)\s*%?(?:[\s,]+([0-9]*\.?[0-9]+))?$/);
    if (!m) {
      errors.push(`Could not read "${line}". Use: TICKER weight`);
      continue;
    }
    const weight = Number(m[2]);
    if (!(weight > 0)) {
      errors.push(`${m[1].toUpperCase()}: weight must be positive`);
      continue;
    }
    holdings.push({ ticker: m[1].toUpperCase(), weight, entryValue: m[3] ? Number(m[3]) : null });
  }
  return { holdings, errors };
}

export function stressPortfolio(holdings: Holding[], exposures: CompanyExposure[]): PortfolioResult {
  const warnings: string[] = [];
  const merged = new Map<string, number>();
  for (const h of holdings) {
    if (!(h.weight > 0) || !Number.isFinite(h.weight)) continue;
    merged.set(h.ticker.toUpperCase(), (merged.get(h.ticker.toUpperCase()) ?? 0) + h.weight);
  }
  const total = [...merged.values()].reduce((a, b) => a + b, 0);
  if (total <= 0) return { holdings: [], weightWithDirectExposure: 0, capacityWeightedExposure: 0, weightFunds: 0, weightUnmapped: 0, warnings: ["No valid holdings."] };
  if (Math.abs(total - 1) > 1e-6 && Math.abs(total - 100) > 1e-4) warnings.push(`Weights summed to ${total.toFixed(4)} and were normalised to 100%.`);

  const byTicker = new Map(exposures.filter((e) => e.ticker).map((e) => [e.ticker as string, e]));
  const out: HoldingResult[] = [];
  for (const [ticker, w0] of merged) {
    const weight = w0 / total;
    const exp = byTicker.get(ticker);
    const listing = listingByTicker(ticker);
    const fund = FUNDS.find((f) => f.ticker === ticker);
    if (exp && exp.exposedBpd > 0) {
      out.push({
        ticker,
        weight,
        cls: "direct",
        exposureShare: exp.share,
        exposedBpd: exp.exposedBpd,
        explanation: `${exp.displayName} owns ${exp.refineryIds.length} refiner${exp.refineryIds.length === 1 ? "y" : "ies"} inside the footprint: ${Math.round(exp.exposedBpd).toLocaleString("en-US")} b/d of its ${Math.round(exp.totalUsBpd).toLocaleString("en-US")} b/d U.S. capacity (EIA).`,
      });
    } else if (listing) {
      out.push({ ticker, weight, cls: "refiner-not-exposed", exposureShare: 0, exposedBpd: 0, explanation: `${listing.displayName} owns U.S. refining capacity (EIA), none of it inside this footprint.` });
    } else if (fund) {
      const members = fund.members.filter((t) => (byTicker.get(t)?.exposedBpd ?? 0) > 0);
      out.push({
        ticker,
        weight,
        cls: "fund",
        exposureShare: null,
        exposedBpd: null,
        explanation: `${fund.name} tracks the ${fund.tracks}. Exposed operators inside that definition: ${members.length ? members.join(", ") : "none"}. Insufficient validated data to quantify: holdings weights are not included.`,
      });
    } else {
      out.push({ ticker, weight, cls: "unmapped", exposureShare: null, exposedBpd: null, explanation: "No documented relationship to this scenario in TerraPulse's source set. That is missing data, not evidence of zero exposure." });
    }
  }
  out.sort((a, b) => b.weight - a.weight || a.ticker.localeCompare(b.ticker));
  const sumW = (f: (h: HoldingResult) => boolean) => out.filter(f).reduce((a, h) => a + h.weight, 0);
  return {
    holdings: out,
    weightWithDirectExposure: sumW((h) => h.cls === "direct"),
    capacityWeightedExposure: out.reduce((a, h) => a + h.weight * (h.exposureShare ?? 0), 0),
    weightFunds: sumW((h) => h.cls === "fund"),
    weightUnmapped: sumW((h) => h.cls === "unmapped"),
    warnings,
  };
}
