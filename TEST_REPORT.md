# Test report

Run on 15 November 2026 (MST), Windows 11, Node 26.4. Re-run with `npm run test:all` and
`npm run check:live`; `npm run status` records the current numbers in `status/status.json`.

## Summary

| Suite | Tool | Result |
|---|---|---|
| Trend statistics | Vitest | 211 passed |
| Hurricane model, geometry, decay, timeline | Vitest | 43 passed |
| Datasets, scenario on real data, network, portfolio, parser, freshness, adapters, layers, hindcast statements | Vitest | 45 passed |
| Hindcast (best-track parsing, quadrant logic, regression values) | Vitest | 25 passed |
| Evidence report | Vitest | 6 passed |
| Drought index and what-if | Vitest | 17 passed |
| **Unit and integration total** | Vitest | **357 passed, 0 failed, 0 skipped** locally (10 added for the two investigations) (41 statistics tests that read the original repository's CSVs skip in CI, where that folder is absent) |
| Browser, production build, Chromium | Playwright, headless, software WebGL | **18 passed** (4 added for the NASA trends flow) |
| Browser, production build, Firefox | Playwright | 14 passed earlier; the 4 new tests not yet run |
| Browser, production build, WebKit | Playwright | 14 passed earlier; the 4 new tests not yet run |
| Browser, live site, Chromium | `TP_BASE_URL` set | all passed at each deploy (see DEPLOYMENT.md for commits, counts and times) |
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
   significant; 2005 data-quality panel; 496-window map and click-to-select; northern Alaska
   temperature +0.51 °C per decade.
8. Command bar builds a custom scenario; methods dialog opens and closes.
9. Scenario JSON and the Markdown evidence report download with the computed figures.
10. Drought what-if: index and class from the NASA regional series; severity and duration change
   the result; beyond-the-record case withholds a return period; the Amazon box shows the 2005 data
   warning; switching back restores the hurricane scenario.
11. With USGS and EONET blocked, layers show CACHED with the snapshot age and never "LIVE FEED".
12–14. Laptop (1280×720), tablet (768×1024) and mobile (390×844): no horizontal overflow; panels,
   timeline and results visible.

## Model validation tests

The hindcast (`research/HINDCAST.md`) is a test the hurricane model **did not pass**: it fails on
Hurricane Harvey and is inconclusive on Hurricane Ike. The 25 hindcast tests check the method and
pin the published figures; they do not assert that the model is right. See MODEL_VALIDATION.md.

## Visual review

Screenshots at 1440, 1280, 768 and 390 px are in `docs/screenshots/` and were inspected by eye for
overflow, overlap and legibility. Fixed during review: map container collapsing to zero height;
glow ring larger than the globe; network too tall for its panel; clock label overlapping the stage
badge; network lines measured before layout settled; on phones the details panel sat below the
layer list; panels too transparent over busy map areas.

Still imperfect:
- On screens around 1024–1280 px wide the timeline is narrow and stage names are abbreviated.
- On phones the panels stack below the globe and need scrolling; the network is dense.
- Network lines cross behind chips in the infrastructure row.

## Defects found by tests and fixed

| Found by | Defect | Fix |
|---|---|---|
| Integration test on real data | Without weakening over land, hurricane-force winds reached Oklahoma and inflated exposed capacity (4.63 → 4.40 million b/d after the fix) | Added inland decay; decay-off kept as an explicit upper bound |
| Hindcast | The wind-only screen misses flood-driven shutdowns (Harvey) and the symmetric profile misses one side of a large storm (Ike) | Not fixed. Stated in the model card, the simulator panel and the markets view; tasks T23 and T24 |
| Unit test | A hand-computed expected value was wrong in the third decimal | Recomputed by hand; the code was right |
| Browser run | Map style expression rejected by validation | Wrapped the property in a boolean assertion |
| Browser run | A stale production build was tested after a type error stopped the build | Build now runs before the browser suite in `test:all` |

## Not tested

- Real Safari, real mobile devices, screen readers, colour-contrast audit.
- Scenario and portfolio file **import** (manual check only; exports are tested).
- Performance on low-end GPUs (only software WebGL in headless browsers, a slow case, where every
  test ran in under 10 seconds).
- Long sessions, tab suspension, very slow networks.
