import type { ReactNode } from "react";
import type { EvidenceClass, FreshnessStatus } from "../data/types";

const EV_CLASS: Record<string, string> = {
  OBSERVED: "observed",
  HISTORICAL: "historical",
  MODELED: "modeled",
  HYPOTHETICAL: "hypothetical",
  "RESEARCH HYPOTHESIS": "research",
  SOURCED: "sourced",
  ILLUSTRATIVE: "illustrative",
  "LIVE FEED": "live",
  "RECENT OBSERVATION": "recent",
  DELAYED: "delayed",
  CACHED: "cached",
  SIMULATED: "simulated",
};

const EV_TITLE: Record<string, string> = {
  OBSERVED: "Taken from a documented observation or official record.",
  HISTORICAL: "A documented value from the past.",
  MODELED: "Computed by a documented formula from stated inputs.",
  HYPOTHETICAL: "A chosen what-if input. Not a forecast.",
  "RESEARCH HYPOTHESIS": "A plausible relationship that is not quantified or validated here.",
  SOURCED: "A relationship documented by the cited source.",
  ILLUSTRATIVE: "Shown for sequence only; the timing is not empirically supported.",
  "LIVE FEED": "Fetched this session; newest observation under one hour old.",
  "RECENT OBSERVATION": "Fetched this session; newest observation under 48 hours old.",
  DELAYED: "Fetched this session; newest observation is days old.",
  CACHED: "A saved snapshot is shown because the live source was not used or not reachable.",
  SIMULATED: "Produced by the scenario engine, not observed.",
};

export function Badge({ kind }: { kind: EvidenceClass | FreshnessStatus | "SOURCED" | "ILLUSTRATIVE" }) {
  return (
    <span className={`badge ${EV_CLASS[kind] ?? "historical"}`} title={EV_TITLE[kind]}>
      {kind}
    </span>
  );
}

export function Src({ label, url }: { label: string; url: string }) {
  if (url.startsWith("#"))
    return (
      <span className="src">
        Source: {label}
      </span>
    );
  return (
    <span className="src">
      Source:{" "}
      <a href={url} target="_blank" rel="noopener noreferrer">
        {label}
      </a>
    </span>
  );
}

export function FactRow({ label, value, evidence, source, note }: { label: string; value: ReactNode; evidence?: EvidenceClass; source?: { label: string; url: string }; note?: string }) {
  return (
    <div className="fact">
      <div className="fact-label">
        <span>{label}</span>
        {evidence && <Badge kind={evidence} />}
      </div>
      <div className="fact-value">{value}</div>
      {note && <div className="fact-note">{note}</div>}
      {source && <Src {...source} />}
    </div>
  );
}

export function Slider({ label, value, min, max, step, unit, onChange, format, hint }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void; format?: (v: number) => string; hint?: string }) {
  const fill = ((value - min) / (max - min)) * 100;
  const id = `sl-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <span className="field-val">
          {format ? format(value) : value}
          {unit ? ` ${unit}` : ""}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} style={{ ["--fill" as any]: `${fill}%` }} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="tiny muted">{hint}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={onChange} />;
}

export const Icon = {
  search: (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="9" cy="9" r="5.5" />
      <path d="m13.5 13.5 3.5 3.5" />
    </svg>
  ),
  play: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M6 4.2v11.6a.6.6 0 0 0 .92.5l9.1-5.8a.6.6 0 0 0 0-1L6.92 3.7A.6.6 0 0 0 6 4.2Z" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="5" y="4" width="3.6" height="12" rx="1" />
      <rect x="11.4" y="4" width="3.6" height="12" rx="1" />
    </svg>
  ),
  rewind: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="4" y="4" width="2.4" height="12" rx="1" />
      <path d="M16 4.6v10.8a.6.6 0 0 1-.94.5L7.3 10.5a.6.6 0 0 1 0-1l7.76-5.4a.6.6 0 0 1 .94.5Z" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l5 5-3 1-2.5 2.5.5 4L8 11.5 3.5 16.5M8 11.5 4.5 8l4 .5L11 6l1-3Z" />
    </svg>
  ),
  reset: (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 10a6 6 0 1 0 2-4.5M4 4v3.5h3.5" />
    </svg>
  ),
  logo: (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#59a6ff" />
          <stop offset="1" stopColor="#1257dc" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill="#e8f1ff" stroke="url(#lg)" strokeWidth="2" />
      <path d="M4.5 16h5.5l3-7 5 14 3-7h6.5" fill="none" stroke="url(#lg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};
