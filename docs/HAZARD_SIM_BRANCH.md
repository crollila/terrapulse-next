# Hazard simulation research branch

Branch `research/hazard-sim`, worktree `../terrapulse-sim`. Started 15 November 2026 from `cc5b89a`;
`main` (showcase page and final demo video, `db5c4b6`) was merged in on 16 November with no conflicts.

**Published on 16 November 2026.** The Team Owner approved it; the branch was merged into `main`
as `c716b17` and deployed to https://crollila.github.io/terrapulse-next/. The 36 browser tests
passed against the live URL afterwards (see `DEPLOYMENT.md`). The NASA submission video files were
not changed by the merge, and the original `crollila/terrapulse` repository is untouched. Tag
`pre-hazard-merge-2026-11-16` marks `main` as it was before (`db5c4b6`).

Publishing does not change any status below: the rainfall screen and the wildfire proximity screen
remain experimental and are labelled so in the app.

## What was added

| Area | In the app | Science record |
|---|---|---|
| Hurricane rainfall and flood evidence | Simulator → "Hurricane rainfall · Harvey 2017, observed record" | `research/RAINFALL_FLOOD.md` |
| Wildfire | Simulator → "Wildfire · observed record, three U.S. fires" | `research/WILDFIRE.md` |
| Economic connections | "Economic network" tab in both views; one network builder for every hazard | sections 5 and 7 of the rainfall report, section 4 of the wildfire report |
| R-CLIPER rainfall for hypothetical storms | A context line on a selected site in the wind scenario | section 6 of the rainfall report |

## What is validated, what is experimental, what was refused

| Item | Status | Evidence |
|---|---|---|
| Harvey rainfall, terrain and flood evidence at 69 sites (NOAA Stage IV, NASA IMERG and MERRA-2, NOAA Atlas 14, USGS elevation and 2,364 high-water marks, FEMA zones) | **Validated as data** | Provenance and hashes in every file; Stage IV against 1,129 rain gauges: r = 0.98, mean absolute difference 24 mm |
| EIA refinery fleet as of 1 January 2017 | **Validated as data** | National total 18,617,027 b/d reproduced from the EIA workbook |
| DOE's count of refineries shut, Updates #1 to #9 | **Reconstructed**, one fitting set per report | DOE names no refinery; arithmetic plus DOE's regional counts; stable for any area radius from 108 to 166 km |
| DOE's count, Updates #10 to #22 | **Unresolved** | No regional counts printed; hundreds of sets fit |
| Rainfall screen (observed rainfall against Atlas 14) | **Experimental** | Hindcast on one storm: finds 8 of 14 counted refineries, includes 6 not counted |
| 50-kt wind or 100-year rainfall | **Experimental** | 13 of 14, with 7 not counted |
| R-CLIPER modelled rainfall | **Fails on Harvey; context only** | 16% of observed rainfall where more than 750 mm fell |
| Observed perimeters and satellite detections of three fires | **Validated as a record** | 99.6%, 98.4% and 88.4% of detections within one pixel of the separately mapped final perimeters |
| Wildfire proximity screen | **Experimental** | Geometry only; distance is not damage |
| Wind network after the builder was generalised | **Unchanged** | SHA-256 fingerprints of three scenarios identical before and after |
| Flood depth, inundation, damage, outage duration | **Not built** | No trustworthy method was established |
| Wildfire spread simulation | **Not offered** | Inputs unverified, model outside its stated domain, no validation |
| Prices, losses, company or portfolio returns | **Not estimated anywhere** | By rule |

## Tests (16 November 2026, after merging `main`)

| Suite | Result |
|---|---|
| Type-check (`tsc --noEmit`, strict) | clean |
| Unit and integration (Vitest) | **450 passed**, 0 failed: 357 existing + 22 rainfall arithmetic + 29 rainfall data and hindcast + 18 R-CLIPER + 8 network + 16 wildfire |
| Browser, production build, Chromium (Playwright) | **36 passed**, 0 failed: 22 in `app.spec.ts` (including the showcase's) + 8 in `hazards.spec.ts` + 6 in `wildfire.spec.ts` |
| Build | succeeds; bundle 1.78 MB (515 kB gzip); new data 2.7 MB uncompressed |

After publishing, the same 36 browser tests passed against the live URL (Chromium).
Not run: Firefox and WebKit for the new specs; real phones.

Browser tests ran against `vite preview --port 4183` with `TP_BASE_URL=http://localhost:4183/`, so
they could not pick up another workstream's server on the default port.

## Screenshots

`docs/screenshots/sim/`, taken from the production build by `scripts/capture-hazards.mjs`:
`01` rainfall whole record · `02` 27 August with wind radii · `03` a site's evidence (Port Arthur) ·
`04` hindcast table · `05` rainfall economic network · `06` Camp Fire, 40 hours in · `07` Smokehouse
Creek network · `08` Marshall Fire evidence · `09` wind scenario with the R-CLIPER line · `10` methods.

## Demonstration paths

1. **Why wind was not enough.** Simulator → Hurricane rainfall. Read the left table: observed 64-kt
   radii hold 0.00 million b/d; the 100-year rainfall screen holds 4.40; DOE counted 3.87.
2. **Watch it happen.** Press play. Rainfall steps day by day; the storm marker and wind radii move
   hourly; ticks on the bar are the landfall and each DOE report.
3. **One site.** Click Motiva Port Arthur: 1,222 mm against a 1,000-year 4-day depth; NASA IMERG saw
   601 mm; 11 high-water marks within 5 km; counted as shut from DOE Update #9.
4. **Honest scoring.** Evidence tab, hindcast table. Change the threshold: the table follows it.
5. **To the economy.** Economic network tab: sites to operators to commodities; the portfolio screen;
   DOE's and EIA's recorded impacts on one axis; a table of what is and is not claimed.
6. **A fire, replayed.** Simulator → Wildfire. Scrub the Camp Fire: satellite detections by overpass
   and the perimeter mapped by each date. Switch to Smokehouse Creek and set 10 km: the Borger
   refinery is 7.8 km from the perimeter.

## Merging

`main` merges into this branch cleanly as of `db5c4b6`. Shared files this branch edits:
`src/App.tsx` (two branches of the simulator switch), `src/state/store.ts` (hazard types and two
view states), `src/components/Globe.tsx` (two hook calls, one camera branch, one condition),
`src/components/Methods.tsx` (cards and source rows), `src/components/SimPanel.tsx`,
`DroughtLab.tsx` (shared hazard selector), `Inspector.tsx` (R-CLIPER line), `ImpactGraph.tsx`
(optional graph prop), `src/sim/graph.ts` (generalised builder), `src/styles.css` (one appended block).
New browser tests live in their own spec files. Everything else is new files.

Merged into `main` on 16 November 2026 (`c716b17`, a merge commit, so one revert undoes it:
`git revert -m 1 c716b17 && git push origin main`). Further hazard work should again happen on this
branch and be merged only after review.

## Remaining data gaps and research needs

Rainfall and flood: section 9 of `research/RAINFALL_FLOOD.md`. Wildfire: section 7 of
`research/WILDFIRE.md`. The largest:

1. Named refinery status after 30 August 2017, and causes, from a primary source.
2. More storms for the rainfall record, and 6-hourly rainfall.
3. Observed inundation (USGS maps) and facility footprints instead of points.
4. Ike (2008) scored by refinery: DOE's named table and the EIA 2008 workbook are downloaded, unused.
5. A rainfall model that works for stalled storms; none verifiable was found.
6. The Camp Fire's cause and fatalities from a saved primary source.
7. Sub-daily fire timeline (NOAA HMS / GOES) and dated perimeters for more fires.
8. A transmission-line layer with clear redistribution terms; a substation layer.
9. A human-verified ticker table for utilities before any wildfire company or portfolio exposure.
10. Hazards outside the United States.
