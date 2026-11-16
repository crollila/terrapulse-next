# Architecture

Static-first. No server, no database, no accounts, no AI at runtime. $0 to run.

```
Browser
├─ React 19 + TypeScript + Vite 8 (single-page app, relative base path)
├─ State: Zustand store (src/state/store.ts), derived scenario memo (src/state/derived.ts)
├─ Globe: MapLibre GL JS 6, globe projection (src/components/Globe.tsx)
│    base: OpenFreeMap vector tiles → fallback: bundled Natural Earth land
│    overlays: NASA GIBS raster tiles; GeoJSON sources for hazards, regions, assets, storm
├─ Science:  src/science/stats.ts      trend statistics (port of the original Python)
├─ Simulator: src/sim/hurricane.ts     wind field, track, decay, exposure, timeline
│             src/sim/graph.ts         economic network with evidence on every edge
│             src/sim/portfolio.ts     exposure screen
│             src/sim/command.ts       deterministic keyword parser
└─ Data adapters: src/data/*.ts        validation, provenance, freshness labels

Static files (public/data)
├─ trends/          published analysis JSON from the original TerraPulse pipeline
├─ infrastructure/  EIA refineries, USACE ports, EIA series around Hurricane Harvey
└─ snapshots/       last-known-valid copies of the live feeds (refreshed at build)

Live, keyless, CORS-enabled services
└─ USGS earthquake feed · NASA EONET · NASA GIBS tiles · OpenFreeMap tiles
```

## Rules the code follows

1. **Every number has a class.** `OBSERVED`, `HISTORICAL`, `MODELED`, `HYPOTHETICAL` or
   `RESEARCH HYPOTHESIS` (`src/data/types.ts`), rendered by `Badge`.
2. **Provenance travels with data.** `SourceMeta` carries provider, dataset, URL, retrieval time,
   newest observation time and whether a cache is in use. `freshnessStatus()` is the only place a
   freshness label is decided.
3. **Adapters validate.** Feed parsers reject malformed records and count them. Missing values
   stay null.
4. **The simulator is pure.** `runScenario(params, refineries, ports)` has no side effects and no
   randomness. The UI recomputes on every input change (about 10 ms).
5. **One timeline position** (`simPos`, 0–1) drives the map layers and the graph through
   `timelineState()`. The first 64% maps to modelled hours; the rest are illustrative stages.
6. **Selection is shared.** `selection` in the store is read by the globe (highlight ring), the
   graph (chain highlight) and the inspector.
7. **No fabricated geography.** The only arc drawn stands for one documented relationship.

## Why MapLibre's globe instead of a custom Three.js globe

One renderer gives a 3D globe at low zoom and a detailed map at high zoom with the same layers,
picking and camera, and works on integrated graphics. A bespoke shader globe was not needed to
meet the design, and a second renderer would have doubled the surface for defects. See
DECISIONS.md.

## Failure behaviour

| Failure | Behaviour |
|---|---|
| WebGL unavailable | Message in place of the globe; panels and calculations still work |
| OpenFreeMap down | Bundled land outlines; no labels |
| USGS or EONET down | Bundled snapshot, labelled CACHED with its age |
| GIBS down | The imagery layer does not draw |
| Infrastructure file missing | Simulator disabled with "Insufficient validated data" |
| Any render error | Error boundary with a reload button |

## Build and deploy

`npm run build` type-checks and writes `dist/`. The MapLibre worker is copied untouched to
`public/vendor/` (bundlers cannot be relied on to emit it at a resolvable path under a sub-path).
GitHub Actions runs type-check, unit tests, a snapshot refresh and the build, then publishes
`dist/` to GitHub Pages.
