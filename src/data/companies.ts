/**
 * Identifier mapping from the "corporation" field of the EIA Refinery Capacity Report to a public
 * listing. Ownership itself comes from EIA; this file only attaches a ticker to a parent company
 * where that parent has a primary listing on a U.S. exchange. Parents that are private,
 * state-owned or not U.S.-listed are recorded as such so the app can say so instead of guessing.
 */
export interface Listing {
  /** Exact EIA corporation string. */
  corporation: string;
  ticker: string | null;
  displayName: string;
  status: "US-listed" | "not US-listed" | "private" | "state-owned" | "cooperative" | "joint venture";
  note?: string;
}

export const LISTINGS: Listing[] = [
  { corporation: "MARATHON PETROLEUM CORP", ticker: "MPC", displayName: "Marathon Petroleum", status: "US-listed" },
  { corporation: "VALERO ENERGY CORP", ticker: "VLO", displayName: "Valero Energy", status: "US-listed" },
  { corporation: "EXXON MOBIL CORP", ticker: "XOM", displayName: "Exxon Mobil", status: "US-listed" },
  { corporation: "PHILLIPS 66 COMPANY", ticker: "PSX", displayName: "Phillips 66", status: "US-listed" },
  { corporation: "CHEVRON CORP", ticker: "CVX", displayName: "Chevron", status: "US-listed" },
  { corporation: "PBF ENERGY CO LLC", ticker: "PBF", displayName: "PBF Energy", status: "US-listed" },
  { corporation: "HF SINCLAIR CORP", ticker: "DINO", displayName: "HF Sinclair", status: "US-listed" },
  { corporation: "BP PLC", ticker: "BP", displayName: "BP", status: "US-listed", note: "American depositary shares" },
  { corporation: "CENOVUS MARKETING (USA) INC", ticker: "CVE", displayName: "Cenovus Energy", status: "US-listed" },
  { corporation: "DELEK GROUP LTD", ticker: "DK", displayName: "Delek US Holdings", status: "US-listed", note: "EIA names the parent as Delek Group Ltd; the U.S. refineries are operated by Delek US Holdings." },
  { corporation: "TOTALENERGIES SE", ticker: "TTE", displayName: "TotalEnergies", status: "US-listed", note: "American depositary shares" },
  { corporation: "SHELL PLC", ticker: "SHEL", displayName: "Shell", status: "US-listed", note: "American depositary shares" },
  { corporation: "PAR PETROLEUM INC", ticker: "PARR", displayName: "Par Pacific Holdings", status: "US-listed" },
  { corporation: "CVR ENERGY", ticker: "CVI", displayName: "CVR Energy", status: "US-listed" },
  { corporation: "DELTA AIR LINES INC", ticker: "DAL", displayName: "Delta Air Lines", status: "US-listed", note: "Owns a refinery through its subsidiary Monroe Energy." },
  { corporation: "KINDER MORGAN ENERGY PTNRS LP", ticker: "KMI", displayName: "Kinder Morgan", status: "US-listed" },
  { corporation: "SUNCOR ENERGY INC", ticker: "SU", displayName: "Suncor Energy", status: "US-listed" },
  { corporation: "CALUMET SPECIALTY PRODUCTS PARTNERS, L.P.", ticker: "CLMT", displayName: "Calumet", status: "US-listed" },
  { corporation: "ONEOK INC", ticker: "OKE", displayName: "ONEOK", status: "US-listed" },
  { corporation: "CONOCOPHILLIPS", ticker: "COP", displayName: "ConocoPhillips", status: "US-listed" },
  { corporation: "SAUDI ARAMCO", ticker: null, displayName: "Saudi Aramco (Motiva)", status: "not US-listed" },
  { corporation: "PDV AMERICA INC", ticker: null, displayName: "PDV America (CITGO)", status: "state-owned" },
  { corporation: "PEMEX", ticker: null, displayName: "Pemex", status: "state-owned" },
  { corporation: "KOCH INDUSTRIES INC", ticker: null, displayName: "Koch Industries (Flint Hills)", status: "private" },
  { corporation: "WRB REFINING LP", ticker: null, displayName: "WRB Refining", status: "joint venture" },
  { corporation: "CHS INC", ticker: null, displayName: "CHS", status: "cooperative" },
];

const BY_CORP = new Map(LISTINGS.map((l) => [l.corporation, l]));
const BY_TICKER = new Map(LISTINGS.filter((l) => l.ticker).map((l) => [l.ticker as string, l]));

export function listingFor(corporation: string | null | undefined): Listing | null {
  return corporation ? (BY_CORP.get(corporation) ?? null) : null;
}
export function listingByTicker(ticker: string): Listing | null {
  return BY_TICKER.get(ticker.trim().toUpperCase()) ?? null;
}

/** Title-case an EIA upper-case name for display. */
export function niceName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Lp|Llc|Usa|Us|Co|Inc|Se|Plc)\b/g, (m) => (m === "Co" || m === "Inc" ? m : m.toUpperCase()));
}

/**
 * Exchange-traded funds with a documented industry definition. Membership lists are restricted to
 * companies that also appear in the refinery dataset; fund weights are NOT included because no
 * redistributable holdings file has been verified, so fund-level exposure is never quantified.
 */
export interface Fund {
  ticker: string;
  name: string;
  tracks: string;
  industry: "energy" | "airlines";
  members: string[];
  sourceLabel: string;
  sourceUrl: string;
}

export const FUNDS: Fund[] = [
  {
    ticker: "XLE",
    name: "Energy Select Sector SPDR Fund",
    tracks: "Energy Select Sector Index (the energy companies of the S&P 500)",
    industry: "energy",
    members: ["XOM", "CVX", "COP", "MPC", "PSX", "VLO", "KMI", "OKE"],
    sourceLabel: "Issuer fund page (State Street / Select Sector SPDRs)",
    sourceUrl: "https://www.sectorspdrs.com/mainfund/xle",
  },
  {
    ticker: "JETS",
    name: "U.S. Global Jets ETF",
    tracks: "U.S. Global Jets Index (airline industry)",
    industry: "airlines",
    members: ["DAL"],
    sourceLabel: "Issuer fund page (U.S. Global Investors)",
    sourceUrl: "https://www.usglobaletfs.com/fund/jets/",
  },
];
