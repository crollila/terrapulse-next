# Progress

Last updated: 2026-11-15 20:40 MST. Check this file against `git log`, `npm test` and the live URL
before trusting it.

## Deployment

- Live: https://crollila.github.io/terrapulse-next/
- Repository: https://github.com/crollila/terrapulse-next
- Last verified: 2026-11-15 20:35 MST, commit `713bcc4`: all 12 browser tests passed against the
  live URL (`TP_BASE_URL=https://crollila.github.io/terrapulse-next/ npm run test:e2e`).
- Original project untouched: `crollila/terrapulse` last push 2026-11-15T20:59:38Z (before this
  work began); the reference clone has its push URL disabled.

## NASA submission

- **Not submitted by this work.** The Team Owner must provide the demo link and press "Submit for
  Judging" before 23:59 MST on 15 November 2026. See `docs/NASA_SUBMISSION_KIT.md`.

## Completed and verified

| Feature | Evidence |
|---|---|
| App shell, design system, responsive layout | browser tests at 1440, 1280, 768, 390 px; screenshots in `docs/screenshots/` |
| 3D globe, camera, place and coordinate search | browser tests 1, 8 |
| Live hazard layers with freshness labels and offline fallback | browser tests 1, 2, 3, 9; unit tests on adapters and labels |
| NASA GIBS imagery layers | browser test 2; tiles checked with HTTP 200 |
| Refinery and port layers with source metadata | browser test 2; data tests |
| Trend explorer (statistics ported and reproduced) | 211 unit tests; browser test 7 |
| Amazon 2005 data-quality case | browser test 7 |
| Hurricane wind-exposure model with inland decay | 85 unit and data tests |
| Houston flagship from the homepage; timeline play, pause, rewind, scrub | browser test 4 |
| Parameters change outputs; reset | browser test 5; unit tests |
| Economic network, evidence on edges, globe ↔ network sync, filters, reset view | browser test 6; unit tests |
| Markets: withheld forecast plus Hurricane Harvey record with EIA series | browser test 6 |
| Portfolio exposure screen, local storage, JSON import and export | browser test 6; unit tests |
| Scenario JSON export and import | built; not covered by an automated test |
| Methods dialog, AI disclosure | browser test 8 |
| CI: type-check, unit tests, snapshot refresh, build, deploy | GitHub Actions run succeeded |
| Demo video (29.4 s) and screenshots from the real app | `public/media/`, `docs/screenshots/` |

Test counts at the last run: 296 unit tests passed; 12 browser tests passed (Chromium, software
WebGL) locally and against the live URL.

## In progress

- Engineering records (this set of files), local status script and dashboard.

## Not done

See `TASK_QUEUE.json` and `BLOCKERS.md`. The largest gaps against the full specification:

- Drought and wildfire models; any model for other hazards.
- Infrastructure outside the United States; energy infrastructure other than refineries and ports.
- Hindcast validation of the hurricane model against Harvey and Ike.
- Verification of the inland decay constants against Kaplan and DeMaria (1995).
- Equity or commodity price history beyond the Harvey window.
- Developer-only Claude-assisted research workflow.
- Cross-browser runs (Firefox, WebKit) and a formal accessibility audit.
- Expand and collapse per branch in the network is per tier only; panel comparison is basic.
- The map's detailed "transition into mapping" is the same MapLibre view zoomed in; no separate
  city-level datasets.

## Recent commits

```
3dff26e Demo capture, screenshots, submission kit, validation and data records
713bcc4 Inland wind decay, integration tests, Playwright browser suite
2b60e9e TerraPulse Next: globe, live hazards, trend explorer, hurricane exposure simulator
```

## Outstanding test failures

None at the last run.

## Next executable task

`TASK_QUEUE.json` → first item with status `todo`: hindcast the hurricane model against Hurricane
Harvey (NHC best track from HURDAT2) and record the comparison in `MODEL_VALIDATION.md`.
