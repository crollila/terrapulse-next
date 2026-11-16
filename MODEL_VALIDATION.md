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

Numerically tested; **not validated against any historical storm.**

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

What is **not** established:
- **No hindcast.** Hurricane Harvey (2017) and Ike (2008) have not been reconstructed and compared
  with the DOE-reported shutdowns. This is the next validation task. A wind-only model is expected
  to do poorly on Harvey, whose refinery outages came with days of extreme rainfall; that expected
  failure should be recorded, not hidden.
- **Inland decay constants.** The equation and R = 0.9 are verified from Kaplan, Dunion, Carrasco
  and DeMaria (2007), NHC-hosted Joint Hurricane Testbed report. The default decay rate
  (0.095 per hour) and background wind (26.7 kt) are the values commonly quoted for Kaplan and
  DeMaria (1995); the paper itself was not retrieved (AOML pages were unreachable on
  15 November 2026). They are shown in the app as assumptions and the rate is user-adjustable.
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

## 5. Not modelled

Drought, wildfire, earthquake, flood and other hazards have no exposure model yet. The simulator
lists them as not built.
