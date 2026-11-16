# TerraPulse Next

**Earth intelligence. Economic foresight.**

An interactive globe that connects NASA Earth observations and live natural-hazard feeds to real
infrastructure and a transparent, deterministic disaster-to-economy simulator.

- Live app: https://crollila.github.io/terrapulse-next/
- Original NASA Space Apps 2026 entry this extends (Team Orbital Alpha, "Be an Earth System Trend
  Detective!"): https://github.com/crollila/terrapulse · https://crollila.github.io/terrapulse/

TerraPulse Next is a separate repository. It does not change the original project or its
submission. It is not an official NASA product and is not endorsed by NASA. It is not for
emergency use and is not investment advice.

## What it does

**Live World**
- A 3D globe (MapLibre GL, globe projection) with a filterable layer panel.
- Natural hazards fetched in the browser: USGS earthquakes (M4.5+, 7 days) and NASA EONET open
  events. If a feed is unreachable, a bundled snapshot is shown and labelled `CACHED`.
- NASA GIBS imagery layers: IMERG precipitation, MODIS land surface temperature and NDVI, MUR sea
  surface temperature, MODIS true colour, Blue Marble.
- U.S. refineries (EIA) and principal ports (USACE/BTS), sized by capacity and tonnage.
- **Trend explorer**: pick a variable, a region and a period; see the deseasonalised series, the
  rate of change per decade with a 95% range, two significance tests corrected for persistence,
  a map of the trend for every start and end year, a second opinion from an independent dataset,
  and the documented 2005 MERRA-2 rainfall break in the south-western Amazon. The statistics run in the browser and reproduce the original Python
  pipeline (tested on all 48 region and variable combinations).

**Disaster Simulator**
- Scenario 001, Houston Energy Shock: a hypothetical Category 5 hurricane on the upper Texas coast.
- A Holland (1980) parametric wind field moves along a user-set track. Each refinery and port gets
  a modelled peak wind and the hour it reaches the chosen exposure threshold.
- Output: refining capacity and port tonnage **inside the footprint**. This is exposure, not lost
  production. No shutdown, damage or price is predicted.
- A timeline (play, pause, rewind, scrub) drives the globe and the economic network together. The
  storm window is modelled; later stages are labelled as an illustrative sequence.
- An economic impact network: hazard → infrastructure → activity → operators → commodities →
  industries → funds. Every link states its meaning, its basis (sourced, modelled or research
  hypothesis) and its source. Selecting a node highlights its facilities on the globe and the
  reverse.
- Markets: the recorded effect of Hurricane Harvey (2017) from DOE, EIA and NHC, with real EIA
  price and refinery series. The hypothetical scenario's price impact is stated as "cannot be
  estimated".
- Drought what-if: a standardised precipitation index for the eight NASA regions, the dry episodes
  in the record, a rainfall what-if placed in that record by counting years, and what soil wetness
  and MODIS vegetation greenness did in comparably dry months. Economic exposure is not estimated.
- Portfolio exposure screen: enter tickers and weights; get the share of the portfolio in companies
  that own refineries inside the footprint, computed from EIA ownership and capacity.
- Exports: scenario parameters (JSON, re-importable) and an evidence report (Markdown) listing every
  computed figure with its evidence class and source.

Every figure carries one of five labels: `OBSERVED`, `HISTORICAL`, `MODELED`, `HYPOTHETICAL`,
`RESEARCH HYPOTHESIS`. Where data are missing the app says "Insufficient validated data".

## Run it

Requires Node.js 22 or newer.

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit and numerical tests (Vitest)
npm run typecheck
npm run build      # static site in dist/
npm run preview    # serve dist/
npm run snapshot   # refresh the fallback snapshots of the live feeds
npm run test:e2e   # browser tests (Playwright) against the production preview
npm run status     # measured status: git, tests, build, live URL
npm run dashboard  # local engineering dashboard, http://localhost:4600
```

No accounts, API keys or paid services are needed. The site is static and is deployed to GitHub
Pages by `.github/workflows/deploy.yml`.

## Data

| Source | Used for | Terms |
|---|---|---|
| NASA MERRA-2 via NASA POWER; MODIS MOD13C2; GISTEMP v4; GPCP v2.3 (via the original TerraPulse pipeline) | Trend explorer | NASA / NOAA open data, cite |
| NASA EONET v3 | Open natural events | NASA open data |
| NASA GIBS | Imagery layers | NASA open data |
| USGS earthquake GeoJSON feed | Earthquakes | U.S. Government, public domain |
| U.S. EIA Refinery Capacity Report (1 Jan 2026) and refinery map layer | Refineries, owners, capacity | U.S. Government, public domain |
| USACE / BTS Principal Ports (CY 2023) | Ports and tonnage | U.S. Government, public domain |
| U.S. EIA petroleum history series; DOE Harvey event reports; NHC cyclone reports | Hurricane Harvey record | U.S. Government, public domain |
| OpenFreeMap / OpenStreetMap contributors | Vector base map | ODbL, attribution on the map |
| Natural Earth via world-atlas | Offline fallback land | Public domain |

Details, retrieval times and caveats are in [DATA_SOURCES.md](DATA_SOURCES.md) and
[research/HARVEY_FACTS.md](research/HARVEY_FACTS.md). Model status and tests are in
[MODEL_VALIDATION.md](MODEL_VALIDATION.md).

## Use of AI tools

The code, tests and documentation in this repository were generated with an AI coding assistant
(Anthropic Claude, via Claude Code) under human direction, on 15 November 2026. No figure in the
app is AI-generated: every number is read from the cited data or computed by the documented
formulas, and the calculations run in the browser without any AI service. The command bar is a
keyword parser, not an AI model. No AI-generated images, audio or video are included. No NASA
logos or branding are used.

## License

[MIT](LICENSE). Map data © OpenStreetMap contributors.
