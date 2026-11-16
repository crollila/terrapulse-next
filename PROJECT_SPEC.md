# Project specification (condensed)

Condensed from the team lead's master build prompt of 15 November 2026. Where this file and that
prompt differ, the prompt governs.

## Vision

**TerraPulse: Earth intelligence. Economic foresight.** A global environmental and economic
intelligence platform that connects NASA Earth observations and trends, real disasters and
hazards, critical infrastructure, supply chains, commodities and macro effects, public companies
and funds, and user-configurable disaster simulations. The defining question: *what happens to the
economy when a major environmental disaster hits a critical region?* It must be an integrated
Earth-to-economy environment with traceable evidence, not a dashboard of disconnected charts.

## Hard constraints

1. **$0.** No paid APIs, hosting, credits or card sign-ups. Free, open, static-first.
2. **Protect the original NASA project** (`crollila/terrapulse` and its live demo): read-only,
   no history rewrite, no deploy changes, no merges. New work lives in a separate repository.
3. **Integrity.** Never invent observations, events, measurements, locations, capacities, prices,
   returns, losses, accuracy, intervals, citations or validation results. Every significant number
   is (A) a documented observation, (B) a reproducible calculation, (C) a sourced historical
   estimate, or (D) an explicitly hypothetical example. Otherwise: "Insufficient validated data".
   Label OBSERVED / HISTORICAL / MODELED / HYPOTHETICAL / RESEARCH HYPOTHESIS. Correlation is not
   causation; a hypothetical storm is not a forecast.
4. **Independent public demo.** Works without login, the developer's computer, any AI key or
   backend. The simulator is deterministic. Any Claude-assisted workflow stays local.

## NASA Space Apps 2026

Challenge: *Be an Earth System Trend Detective!* Deadline 15 November 2026, 23:59 local time. Keep
the scientific story (what changes, where, how much, is it significant) and the Amazon rainfall
2005 investigation central. The economic simulator is an extension, not a replacement. The team
submits; do not claim a submission without evidence.

## Product

**Page 1, Live World.** A 3D Earth: rotate, drag, zoom, fly to countries, cities and coordinates.
A layer panel in four groups: natural hazards, environmental intelligence, economic
infrastructure, financial exposure. Every layer has real data or an explicitly labelled
demonstration set, source metadata, timestamps and an explanation. A data-freshness system with
LIVE FEED, RECENT OBSERVATION, DELAYED, HISTORICAL, CACHED and SIMULATED; a cache is never shown as
new data; the app works when an API is down.

**Trend explorer.** Choose variable, region and period; see the series, direction and magnitude,
a trend estimate, significance with autocorrelation addressed, sample period and size, the null
hypothesis, confidence intervals, comparisons, independent datasets and limitations.

**Page 2, Disaster Simulator.** Choose disaster type, location, severity, area, duration and
vulnerability assumptions; start, pause, resume, rewind, reset and scrub; inspect infrastructure
exposure, economic relationships and market sensitivities; save and export locally. Specialised
models first for hurricanes, droughts and wildfires; other hazards may use an honest generalised
model. Timeline stages are meaningful and synchronised across map, network and panels; unsupported
timing is labelled illustrative.

**Flagship: Scenario 001, Houston Energy Shock.** A hypothetical Category 5 hurricane on the Texas
Gulf Coast. Real, cited infrastructure; `capacity_at_risk = Σ capacity × modelled affected
fraction` only when every term is defensible; capacity at risk is not lost production. Historical
analogues (Harvey, Ike) normalised and never extrapolated into guaranteed responses. "Price impact
cannot be estimated" is an acceptable result.

**Synchronised Earth and economic network.** Nodes for hazard, region, asset, activity, industry,
commodity, company and fund. Edges are documented relationships, with sourced and inferred ones
distinguished. Selection syncs both ways; the timeline updates both; expand, collapse, inspect
edges, pin, filter, follow a chain, reset. No fake routes.

**Context-aware intelligence.** The workspace adapts to the selection; panels expand, close, pin
and compare. **Portfolio stress testing** from manual tickers and weights with documented
methodology, local storage and JSON import and export; never presented as a return.

## Design

Apple white × JARVIS blue: warm white and light silver surfaces, navy and charcoal type, electric
blue and cyan accents, red only for real hazards, amber for uncertainty, frosted glass panels,
subtle borders and shadows, a luminous blue Earth. Bright, readable, uncluttered. No dark crypto
look, no excess neon, no decorative numbers, no NASA logos. Purposeful, interruptible motion;
reduced-motion respected; modest GPU needs; graceful fallbacks.

## Engineering

React, TypeScript, Vite; MapLibre or Three.js; typed adapters with validation; Vitest and
Playwright; GitHub Pages. Transparent models that declare inputs, units, sources, formulas,
assumptions, geography, period, limitations, uncertainty and validation status. Numerical tests
with known answers; models that fail are experimental or disabled. Multi-agent work with defined
interfaces and verified integration. Persistent records (this file set), recovery scripts and a
local engineering dashboard that never shows fake live telemetry.

## Definition of done

Twenty conditions; see `IMPLEMENTATION_PLAN.md` for each one and its current state.
