# Progress

Last updated: 2026-11-15 22:02 MST. Check this file against `git log`, `npm run status` and the
live URL before trusting it.

## Deployment

- Live: https://crollila.github.io/terrapulse-next/
- Repository: https://github.com/crollila/terrapulse-next
- Last verified: 2026-11-15 21:57 MST, commit `44220c1`: 18 of 18 browser tests passed against the
  live URL. Commit `d8f34f0` added only the revised video and documentation.
- Demo videos: revised, science first, 29.30 s with narration:
  https://crollila.github.io/terrapulse-next/media/terrapulse-demo-v2.mp4 (verified 22:00 MST);
  earlier fallback, 29.4 s silent: https://crollila.github.io/terrapulse-next/media/terrapulse-next-demo-30s.mp4
- Original project untouched: `crollila/terrapulse` last push 2026-11-15T20:59:38Z, before this
  work began; its live demo returns 200; the reference clone has its push URL disabled.

## NASA submission

- **Not submitted by this work.** The Team Owner must provide the demo link and press "Submit for
  Judging" before 23:59 MST on 15 November 2026. See `docs/NASA_SUBMISSION_KIT.md`.

## Completed and verified

| Feature | Evidence |
|---|---|
| Opens on Earth-System Trends: the four NASA questions for any variable, region and window | 4 browser tests (NASA challenge group) |
| The Amazon Rainfall Mystery and Northern Alaska warming investigations, with the team's GPCP and GISTEMP series charted | 10 unit tests against the published results; browser tests |
| Guided tour and a marked path from trends to the simulator | browser test |
| App shell, design system, responsive layout | browser tests at 1440, 1280, 768, 390 px; screenshots in `docs/screenshots/` |
| 3D globe, camera, place and coordinate search | browser tests 1, 8 |
| Live hazard layers with freshness labels and offline fallback | browser tests 1, 2, 3, 10; unit tests |
| NASA GIBS imagery layers | browser test 2; tiles checked with HTTP 200; viewed (sea surface temperature) |
| Refinery and port layers with source metadata | browser test 2; data tests |
| Trend explorer (statistics ported and reproduced) | 211 unit tests; browser test 7 |
| Every-window trend map | browser test 7 |
| Amazon 2005 data-quality case | browser test 7 |
| Hurricane wind-exposure model with inland decay | 43 unit tests |
| Hindcast against Harvey and Ike (model **not** validated) | 25 tests; `research/HINDCAST.md`; statements pinned by tests and shown in the app |
| Houston flagship from the homepage; timeline play, pause, rewind, scrub | browser test 4 |
| Parameters change outputs; reset | browser test 5; unit tests |
| Economic network, evidence on edges, globe ↔ network sync, filters, reset view | browser test 6; unit tests |
| Markets: withheld forecast plus Hurricane Harvey record with EIA series | browser test 6 |
| Portfolio exposure screen, local storage, JSON export | browser test 6; unit tests |
| Scenario JSON export and Markdown evidence report | browser test 9; unit tests |
| Drought what-if on the NASA regional series (index, episodes, soil and NDVI response) | 17 unit tests; browser test 10 |
| Methods dialog, model card, AI disclosure | browser test 8 |
| CI: type-check, unit tests, snapshot refresh, build, deploy | GitHub Actions runs succeeded |
| Demo video (29.4 s) and screenshots from the real app | `public/media/`, `docs/screenshots/` |
| Status script, resume script, local dashboard, local research script | run and checked by hand |

Test counts at the last run: 357 unit tests passed; 18 browser tests passed in Chromium locally and
against the live URL. The four new NASA-flow tests have not been run in Firefox or WebKit yet (the
other 14 passed there earlier).

## In progress

- Nothing. Next: T08 (wildfire footprint model) or T23 (rainfall and flood exposure for hurricanes).

## Not done

See `TASK_QUEUE.json` and `BLOCKERS.md`. The largest gaps against the full specification:

- A hurricane model that passes a hindcast: rainfall or flood exposure (T23), wind asymmetry (T24).
- Wildfire model; models for other hazards; economic exposure for drought (T25).
- Infrastructure outside the United States; energy infrastructure other than refineries and ports.
- Verification of the inland decay constants against Kaplan and DeMaria (1995).
- Equity or commodity price history beyond the Harvey window.
- Importing AI-drafted research notes into the app; scenario and portfolio import are untested.
- Accessibility audit; real devices.

## Recent commits

```
de15eb5 Drought what-if on the NASA regional series; records
82a486d Progress checkpoint and deployment verification log
10abb08 Hindcast against Harvey and Ike; findings in the model card; records
38f8178 Cross-browser projects for the browser suite (Firefox, WebKit); docs
ce70ac8 Trend explorer: every-window map from the published pipeline output
2796166 Evidence report export, local research workflow, phone layout order
794f683 Engineering records, status and resume scripts, local dashboard
3dff26e Demo capture, screenshots, submission kit, validation and data records
713bcc4 Inland wind decay, integration tests, Playwright browser suite
2b60e9e TerraPulse Next: globe, live hazards, trend explorer, hurricane exposure simulator
```

## Outstanding test failures

None at the last run.

## Next executable task

`npm run resume` prints it.
