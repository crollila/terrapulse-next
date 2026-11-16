/** Evidence class shown on every figure. See PROJECT_SPEC.md. */
export type EvidenceClass = "OBSERVED" | "HISTORICAL" | "MODELED" | "HYPOTHETICAL" | "RESEARCH HYPOTHESIS";

export type FreshnessStatus = "LIVE FEED" | "RECENT OBSERVATION" | "DELAYED" | "HISTORICAL" | "CACHED" | "SIMULATED";

/** Provenance carried by every source-backed dataset. */
export interface SourceMeta {
  provider: string;
  dataset: string;
  sourceUrl: string;
  landingPage?: string;
  units?: string;
  cadence?: string;
  scope?: string;
  license?: string;
  quality?: string;
  /** When this copy was retrieved from the provider (ISO). */
  retrievedAt: string | null;
  /** Newest observation time in the dataset (ISO), when known. */
  observedAt?: string | null;
  /** True when the data shown is a bundled last-known-valid snapshot, not a fresh fetch. */
  fromCache: boolean;
  /** Why the cache was used, if it was. */
  cacheReason?: string;
}

export type HazardKind = "earthquake" | "wildfire" | "severeStorm" | "volcano" | "flood" | "drought" | "seaLakeIce" | "other";

export interface HazardEvent {
  id: string;
  kind: HazardKind;
  title: string;
  lat: number;
  lon: number;
  observedAt: string;
  magnitude: number | null;
  magnitudeUnit: string | null;
  url: string;
  provider: string;
  detail?: string;
}

export interface Refinery {
  id: string;
  name: string;
  company: string;
  corporation?: string | null;
  city?: string | null;
  state?: string | null;
  padd?: string | number | null;
  lat: number;
  lon: number;
  capacityBpd: number | null;
}

export interface Port {
  id: string;
  name: string;
  state?: string | null;
  lat: number;
  lon: number;
  totalTons: number | null;
  rank?: number | null;
  year?: number | string | null;
}

export interface InfrastructureMeta {
  provider: string;
  dataset: string;
  sourceUrl: string;
  landingPage?: string;
  retrievedAt: string;
  dataAsOf?: string | null;
  license?: string;
  notes?: string;
  [k: string]: unknown;
}
