# Decisions

Dated 15 November 2026 unless noted. Each can be revisited.

1. **Separate repository.** `crollila/terrapulse-next`, public, MIT. The original
   `crollila/terrapulse` is only read; the local reference clone has its push URL disabled.
2. **Static site on GitHub Pages.** Free, no card, no server to fail. Rules out anything needing
   a backend or a secret.
3. **MapLibre GL JS globe projection** rather than a custom Three.js or React Three Fiber globe.
   Reason: one renderer for globe and detailed map, built-in picking and camera, light GPU load.
   The spec allows the choice ("a modular renderer such as …").
4. **OpenFreeMap vector base** with a custom white-and-blue style; NASA Blue Marble is an optional
   imagery layer rather than the base, so labels and data stay readable.
5. **Reuse the original pipeline's published JSON** for trends instead of re-downloading NASA
   data, and port the statistics to TypeScript so windows can be recomputed in the browser. The
   port is accepted only because tests reproduce the published results.
6. **Hurricane model = exposure screen.** Holland (1980) wind field on a straight track with
   optional Kaplan–DeMaria decay. Output is capacity inside a wind threshold. No vulnerability
   curve, because none has been validated here.
7. **No price or return forecast.** The app states "cannot be estimated" and shows the Hurricane
   Harvey record as history.
8. **Inland decay defaults are labelled assumptions** because the 1995 paper could not be
   retrieved; only the equation and R = 0.9 were verified from a NOAA report.
9. **Only one geographic arc** (Houston to New York Harbor, Colonial Pipeline, per EIA). Other
   product flows are not drawn because no route data was sourced.
10. **Funds are named but never quantified.** No verified, redistributable holdings file.
11. **Custom SVG for charts and the network** instead of Plotly or React Flow: smaller bundle and
    full control of evidence styling.
12. **React StrictMode is off.** Its development-only double mount creates and destroys two WebGL
    maps back to back. Production behaviour is unaffected.
13. **`window.__tpStore` and `window.__tpMap` are exposed** for browser tests. They hold no
    secrets.
14. **Commits use the GitHub no-reply address**, as the original repository does.
15. **Drought, wildfire and other hazard models are listed as "not built yet"** in the simulator
    rather than given a generic model of unknown quality.
