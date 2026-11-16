# Test report

Run on 15 November 2026 (MST), Windows 11, Node 26.4. Re-run with `npm run test:all` and
`npm run check:live`; `npm run status` records the current numbers in `status/status.json`.

## Summary

| Suite | Tool | Result |
|---|---|---|
| Trend statistics | Vitest | 211 passed |
| Hurricane model, geometry, timeline | Vitest | 43 passed |
| Datasets, scenario on real data, network, portfolio, parser, freshness, adapters, layers | Vitest | 42 passed |
| **Unit and integration total** | Vitest | **296 passed, 0 failed, 0 skipped** locally (41 statistics tests that read the original repository's CSVs skip in CI, where that folder is absent) |
| Browser, production build | Playwright, Chromium headless, software WebGL | **12 passed** |
| Browser, live site | same, `TP_BASE_URL` set | **12 passed** (20:35 MST, commit `713bcc4`) |
| Type-check | `tsc --noEmit` (TypeScript 7, strict) | clean |
| Build | Vite 8 | succeeds; one bundle 1.55 MB (450 kB gzip) |

## Browser tests (`tests/e2e/app.spec.ts`)

1. Homepage loads; the WebGL globe has rendered features; layers show a real freshness label; no
   runtime errors.
2. Layer switches change what the map draws (hazards, refineries, a NASA GIBS layer); a layer name
   opens its source metadata.
3. Clicking a hazard on the globe opens its details; pinning works.
4. Houston scenario from the homepage; auto-start; pause holds position; resume advances; rewind
   returns to zero; scrubbing changes the stage, the storm rings and the number of network nodes.
5. Category, threshold and decay controls change the exposed capacity in the expected direction;
   a tropical storm exposes nothing at 64 kt; reset restores Scenario 001.
6. Network node → globe highlight; globe click → network selection; an edge shows its evidence;
   category filter and reset; markets pane withholds a forecast and shows the Harvey record;
   portfolio numbers respond to input.
7. Trend explorer: Amazon rainfall −0.541 mm/day per decade, significant; 1981–2004 not
   significant; 2005 data-quality panel; northern Alaska temperature +0.51 °C per decade.
8. Command bar builds a custom scenario; methods dialog opens and closes.
9. With USGS and EONET blocked, layers show CACHED with the snapshot age and never "LIVE FEED".
10–12. Laptop (1280×720), tablet (768×1024) and mobile (390×844): no horizontal overflow; panels,
   timeline and results visible.

## Visual review

Screenshots at 1440, 1280, 768 and 390 px are in `docs/screenshots/` and were inspected by eye for
overflow, overlap and legibility. Fixed during review: map container collapsing to zero height;
glow ring larger than the globe; network too tall for its panel; clock label overlapping the stage
badge; network lines measured before layout settled.

Still imperfect:
- On screens around 1024–1280 px wide the timeline is narrow and stage names are abbreviated.
- On phones the panels stack below the globe and need scrolling; the network is dense.
- Network lines cross behind chips in the infrastructure row.

## Defects found by tests and fixed

| Found by | Defect | Fix |
|---|---|---|
| Integration test on real data | Without weakening over land, hurricane-force winds reached Oklahoma and inflated exposed capacity (4.63 → 4.40 million b/d after the fix) | Added inland decay; decay-off kept as an explicit upper bound |
| Unit test | A hand-computed expected value was wrong in the third decimal | Recomputed by hand; the code was right |
| Browser run | Map style expression rejected by validation | Wrapped the property in a boolean assertion |
| Browser run | A stale production build was tested after a type error stopped the build | Build now runs before the browser suite in `test:all` |

## Not tested

- Firefox, WebKit, real mobile devices, screen readers, colour-contrast audit.
- Scenario and portfolio file import and export (manual check only).
- Performance on low-end GPUs (only software WebGL in headless Chromium, which is a slow case and
  ran every test in under 7 seconds).
- Long sessions, tab suspension, very slow networks.
