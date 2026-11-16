# Model validation

Status as of 15 November 2026. A model that cannot pass its required tests is classed as
experimental or disabled. Nothing here is marked validated unless a test proves it.

## 1. Trend statistics (`src/science/stats.ts`): VALIDATED against the reference pipeline

A dependency-free TypeScript port of the original TerraPulse Python pipeline
(`backend/terrapulse/stats.py`), which is itself tested against statsmodels and pymannkendall.

- Method: monthly climatology over the full record, anomalies, least-squares slope with an
  AR(1)-adjusted t-test (Santer et al. 2008), Theil–Sen slope, Mann–Kendall with the Hamed–Rao
  correction, Weatherhead years-to-detect, and the level-shift test used for the 2005 break.
- Null hypothesis: zero slope (t-test) and no monotonic trend (Mann–Kendall).
- "Significant" requires p < 0.05 in **both** corrected tests.
- Minimum window: 15 calendar years inside the record with at least 8 valid months.

Evidence (211 tests, `src/science/stats.test.ts`):

| Input | Quantity | Largest error observed |
|---|---|---|
| Reference CSVs (5 decimals), 40 MERRA-2 series, full record and every window | slopes, intercept, r², residual std, Theil–Sen, tau | bit-identical |
| same | confidence limits, lag-1, n_eff | ≤ 1e-13 |
| same | ln p | ≤ 4e-12 |
| Published JSON (values rounded to 3–4 decimals), 32 series | slopes, confidence limits | ≤ 1e-3 relative |
| same | ln p | ≤ 0.042 |
| 2005 level shift (reference GPCP CSV) | step, interval, p | ≤ 1e-13 |

Known limits:
- The app ships the rounded series, so in-browser results differ from the published ones in the
  third or fourth significant figure. The explorer shows this as a "reproducibility check".
- The GPCP and GISTEMP series are not shipped, so the second opinion and the 2005 level-shift
  numbers shown in the app are the published values, not recomputed in the browser. They apply to
  the full record only and do not change with the chosen window.
- 41 tests read the original repository's CSVs from `../_reference` and skip when it is absent (as
  in CI). They pass locally.

## 2. Hurricane wind-exposure screen (`src/sim/hurricane.ts`): EXPERIMENTAL

Numerically tested and hindcast against two storms; **the hindcast does not validate it.**

What is tested (`src/sim/hurricane.test.ts`, `src/sim/engine.test.ts`, 85 tests):
- Holland (1980) profile: equals Vmax at Rmax; a hand calculation at r = 2 Rmax; monotone decrease.
- Saffir-Simpson category boundaries (NHC values in kt).
- Great-circle geometry: one degree of latitude, quarter circumference, round trips.
- Inland decay: hand calculation at 12 h; the 0.9 reduction at landfall; limit at the background
  wind; decay never raises a wind; decay-off is an upper bound for every asset.
- Scenario arithmetic: capacity in footprint equals the sum of its members; unknown capacities are
  counted and excluded, never zero-filled; determinism; monotonic response to intensity, size and
  threshold; input validation.
- Sanity on real data: Scenario 001 exposes only Texas and Louisiana refineries; aimed at Miami
  it exposes no Gulf Coast refining capacity.

Hindcast (16 November 2026, `research/HINDCAST.md`, `src/sim/hindcast.ts`, 25 tests in
`src/sim/hindcast.test.ts`). Wind footprints along the NHC HURDAT2 best tracks of Hurricane Harvey
(AL092017) and Hurricane Ike (AL092008), counted on the EIA refinery file as of 1 January 2026
(not the 2017 or 2008 fleet), for the best-track wind radii and for the app's Holland profile with
the observed maximum wind (B = 1.5, Rmax 20, 35 and 50 km, nothing fitted):
- **Harvey: the screen fails, as expected.** DOE reported 15 refineries and 3,871,449 b/d shut or
  shutting down on 30 August 2017. Observed 64-kt radii: 0 refineries. Holland 64 kt: 6 to 9
  refineries, 0.94 to 1.32 million b/d (24% to 34% of the DOE figure), the Corpus Christi cluster
  only and no Houston Ship Channel, Galveston Bay, Beaumont or Port Arthur site. At 34 kt it
  overshoots: 29 sites, 6.34 million b/d (164%). No threshold reproduces the outcome. Harvey's
  Houston and Beaumont/Port Arthur shutdowns came with a stalled 35 to 45 kt tropical storm and more
  than 60 inches of rain, which a wind-only screen cannot represent. The Holland profile is also
  too broad at Corpus Christi (73 to 79 kt where the best track has less than 64 kt).
- **Ike: inconclusive.** NHC, citing DOE: 14 refineries closed. Observed 64-kt radii: 19 sites of
  the 2026 fleet (16 with crude distillation capacity), 4.99 million b/d. Holland 64 kt: 10, 13 or
  16 sites, 2.23 to 4.40 million b/d, depending on the assumed Rmax; the symmetric profile misses
  the Lake Charles area. Same order of magnitude, but no list of the 14 refineries was retrieved,
  so membership cannot be scored.
- These are exposure counts on a later fleet, not shutdowns. Best-track radii are maximum extents
  per quadrant and overstate area. Two storms would not validate a model even if both matched.

What is **not** established:
- **Skill at predicting shutdowns.** See the hindcast above: not demonstrated for Harvey, not
  testable for Ike with the sources retrieved. Next steps would be the DOE refinery tables for both
  storms (names and dates) and a refinery list for the storm year.
- **Inland decay constants.** The equation and R = 0.9 are verified from Kaplan, Dunion, Carrasco
  and DeMaria (2007), NHC-hosted Joint Hurricane Testbed report. The default decay rate
  (0.095 per hour) and background wind (26.7 kt) are the values commonly quoted for Kaplan and
  DeMaria (1995); the paper itself was not retrieved (AOML pages were unreachable on
  15 November 2026; on 16 November AMS journal pages returned HTTP 403 and AOML timed out, and
  neither the paper's abstract, the 2007 JHT report nor the 2005 SHIPS paper states the two
  values). They are shown in the app as assumptions and the rate is user-adjustable. The hindcast
  does not use the decay model.
- The tropical-storm threshold (34 kt) follows the NHC glossary definition; the glossary page was
  confirmed reachable but its text was not machine-checked.
- No land mask: decay starts at the user's landfall point wherever it is.
- No storm surge, rainfall, flooding, wind asymmetry or terrain.
- No vulnerability curve. "Inside the footprint" is exposure only.

Scenario 001 output with the committed data (for regression): 16 refineries, 4.40 million b/d
inside the 64-kt footprint, 24.3% of the capacity in the EIA file; 10 principal ports.

## 3. Economic network (`src/sim/graph.ts`): STRUCTURAL CHECKS ONLY

Tests assert that every edge states its meaning and basis, that sourced and modelled edges cite a
source, that no price, return, margin or cost fact carries a number, and that company exposure
shares equal exposed capacity over total U.S. capacity from the EIA file. Relationships are
qualitative. No magnitude of economic transmission is modelled.

## 4. Portfolio exposure screen (`src/sim/portfolio.ts`): ARITHMETIC TESTED

A hand-calculated two-holding case, weight normalisation, duplicate merging, fund handling
(classified, never quantified) and the bound index ≤ directly exposed weight. It measures physical
exposure of U.S. refining assets only. It is not a return model.

## 5. Regional drought index and what-if (`src/sim/drought.ts`): EXPERIMENTAL

A non-parametric standardised precipitation index on the MERRA-2 regional series: k-month mean
precipitation ranked within its calendar month, Gringorten plotting position, standard normal
quantile. Classes follow McKee et al. (1993). The what-if holds rainfall at a chosen share of normal
and is placed in the record by counting years; a what-if drier than every year is reported as
beyond the record with no index and no return period.

Tested (`src/sim/drought.test.ts`, 17 tests): hand-calculated trailing means, plotting positions,
tie handling and class boundaries; a five-year case with a hand-checked quantile (-1.2299);
monotonicity; comparison within calendar months only; episode detection; the what-if by counting;
z-scores; and on the committed NASA series, a zero median, bounds consistent with a 45-year record
and lower soil wetness in dry months.

Not established:
- **No comparison with an operational drought monitor** or with gauge-based SPI.
- It is not the gamma-fitted SPI and cannot express anything rarer than the record.
- Input is a reanalysis. In the south-western Amazon box the documented 2005 rainfall shift biases
  the index dry after 2005; the app warns about this in place.
- Precipitation only; no evaporative demand.
- **No economic exposure**: no crop, water or production dataset is linked (task T25).

For the southern Murray-Darling box the longest episodes it finds are 2017-09 to 2020-03, 2002-06
to 2003-07, 2006-09 to 2007-10 and 1982-07 to 1983-06. These were not checked against a published
drought chronology in this build.

## 6. Not modelled

Wildfire, earthquake, flood and other hazards have no model yet. The simulator lists them as not
built. Drought has an index and what-if but no economic exposure.
