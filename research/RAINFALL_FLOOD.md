# Hurricane rainfall and flood exposure: research, method, hindcast, limits

Task T23. Work done 15 to 16 November 2026 on branch `research/hazard-sim`. Every number below is
read from a file downloaded for this project or computed from such files by code in this repository.
Nothing was tuned to the outcome. Where something could not be established it is listed in section 9.

**Verdicts**

| Capability | Status | Why |
|---|---|---|
| Observed rainfall, terrain and flood evidence for Hurricane Harvey at every Gulf Coast refinery and port | **Validated as data**: provenance on every figure; the rainfall analysis agrees with 1,129 rain gauges (r = 0.98; not a fully independent test, see section 3) | section 3 |
| Rainfall screen (observed k-day rainfall against NOAA Atlas 14) | **Experimental**: the arithmetic is tested; as a predictor of shutdowns it is tested on one storm and has as many wrong inclusions as it removes misses | section 5 |
| Reconstructed list of the refineries DOE counted as shut | **Reconstructed, unique for Updates #1 to #9; unresolved for #10 to #22** | section 4 |
| R-CLIPER modelled rainfall for hypothetical storms | **Fails on Harvey; shown as context only, never counted** | section 6 |
| Flood depth, inundation, damage, outage duration, price | **Not built. No trustworthy method was established.** | section 8 |

## 1. The problem

The wind-only hindcast (`research/HINDCAST.md`) found that hurricane-force wind explains at most the
Corpus Christi refineries and none of those in Houston, Galveston Bay, Beaumont or Port Arthur.
NHC attributes those to rain: "Flooding induced by widespread rainfall amounts of 40 inches resulted
in several oil and gas refineries in the Golden Triangle area (southeastern Texas between Beaumont,
Port Arthur and Orange) going offline for days" (Blake and Zelinsky 2018, p. 9), and "The Phillips 66
refinery took on water near Little Linville Bayou" (p. 10).

The question for this work: can rainfall be brought in defensibly, and how far can it be taken
before the evidence runs out?

## 2. Data

| Need | Source | How it is used | Evidence class |
|---|---|---|---|
| Rainfall field and rainfall at each site | NOAA NWS/NCEP **Stage IV** daily multisensor analysis, `water.noaa.gov/resources/downloads/precip/stageIV/`, ten files, 24 hours ending 1200 UTC 24 Aug to 2 Sep 2017 | Value of the HRAP cell containing each site; nearest cell at each 0.05° point for the map | OBSERVED |
| Second and third rainfall estimates | **NASA GPM IMERG** and **NASA MERRA-2** daily values from the NASA POWER point API (`IMERG_PRECTOT`, `PRECTOTCORR`) | Shown beside Stage IV at each site as a guide to how well the rainfall is known | OBSERVED / reanalysis |
| Rainfall rarity | **NOAA Atlas 14** point precipitation frequency estimates with 90% bounds (HDSC text service), 1, 2, 3, 4 and 7 days, 1 to 1,000 years | Threshold table for the screen | Published estimate |
| Independent check of the rainfall analysis | **NOAA NCEI GHCN-Daily** rain gauges in the domain | Section 3 | OBSERVED |
| Ground elevation | **USGS 3DEP** Elevation Point Query Service | Shown per site; not used in the screen | OBSERVED |
| Regulatory flood zone | **FEMA National Flood Hazard Layer**, layer 28, at each site point | Shown per site; not used in the screen | Regulatory map |
| Observed flooding | **USGS Flood Event Data**, event "2017 Harvey": 2,364 approved high-water marks | Shown on the map; count and highest mark within 5 km of each site | OBSERVED |
| Storm track and wind radii | NOAA NHC HURDAT2 (already in the repository) | Timeline, wind screens | OBSERVED |
| Refinery fleet at the time | **EIA Refinery Capacity Report as of 1 January 2017** (`refcap17.xls`) | Hindcast universe and DOE reconstruction | OBSERVED |
| What actually shut | **U.S. DOE Hurricane Harvey event reports, Updates #1 to #22** | Hindcast target (section 4) | HISTORICAL |

All are U.S. Government works in the public domain or NASA open data; all were retrieved without
keys or accounts. Scripts: `research/scripts/fetch_harvey_rainfall.py`, `build_harvey_rainfall.py`,
`build_historical_fleet.py`, `build_doe_harvey_record.py`. Raw downloads stay in `research/raw/`
(git-ignored); the built files in `public/data/rainfall/` and `public/data/hindcast/` carry provider,
URL, retrieval time and SHA-256 hashes in their `meta` blocks.

Domain: 26 to 33°N, 100 to 89.5°W, fixed before any rainfall was read. It holds 42 refineries of the
current EIA file, 42 of the 2017 fleet (45 distinct sites) and 24 principal ports.

**What Stage IV is.** "a mosaic of regional multi-sensor analysis produced by NWS River Forecast
Centers (RFCs) and benefits from the RFCs' manual quality control step" (Lin and Mitchell 2005, p. 1),
on "a 1121x881 polar stereographic grid ... The resolution is 4.7625km at 60N" (NCEP/EMC Q&A). A daily
file covers 1200 UTC to 1200 UTC. The files used here carry the unit "Inches"; the build converts
with 1 inch = 25.4 mm and asserts the grid's projection parameters against each file. The projection
code was checked by requiring every site's cell centre to lie within 3.6 km of the site.

**What Atlas 14 is.** "NOAA Atlas 14 Volume 11 provides precipitation frequency estimates for
durations of 5-minute through 60-day at average recurrence intervals of 1-year through 1,000-year for
the State of Texas. The estimates and associated upper and lower bounds of the 90% confidence interval
are provided at 30-arc second resolution" (Perica et al. 2018, p. 3). Average recurrence interval:
"Average time between cases of a particular precipitation magnitude for a specified duration and at a
given location".

**Precedent for the method.** NOAA's own Hydrometeorological Design Studies Center analysed Harvey
this way: its map "Hurricane Harvey, 25 - 31 August 2017: Annual Exceedance Probabilities (AEPs) for
the Worst Case 4-day Rainfall" states "Rainfall values come from 6-hour Stage IV data" and "Rainfall
frequency estimates are from preliminary NOAA Atlas 14, Volume 11, Version 1". The screen here is the
same comparison at site points, with daily instead of 6-hourly rainfall and the final Version 2
estimates. It is a rainfall-rarity statement, not a flood statement, and HDSC words it that way.

## 3. Is the rainfall analysis right? Stage IV against rain gauges

`research/rainfall_gauge_check.json`. Ten-day totals (24 Aug to 2 Sep 2017) at GHCN-Daily stations
against the Stage IV cell containing each station. Of 2,218 stations in the domain, 1,129 have a
value on all ten dates with no quality flag (4 stations had flagged values and were dropped whole).

| Stations | n | Gauge mean (mm) | Stage IV mean (mm) | Mean difference | Mean absolute difference | RMS difference | Correlation |
|---|---|---|---|---|---|---|---|
| All | 1,129 | 187.3 | 192.7 | +5.4 | 23.7 | 42.0 | 0.984 |
| Gauge ≥ 250 mm | 274 | 529.2 | 535.0 | +5.8 | 53.1 | 75.2 | 0.949 |
| Gauge ≥ 750 mm | 45 | 947.1 | 946.3 | −0.8 | 74.5 (8%) | 97.3 | 0.753 |

Caveats, stated in the file itself: this is **not an independent test**, because Stage IV is itself
adjusted with rain gauges and some of these stations may be among them; a gauge samples a few
hundred square centimetres and a cell about 15 km²; observer days differ (about 7 a.m. local for many,
midnight to midnight at airports); gauges under-catch in wind and stations that failed are absent.

At the national record gauge (NHC: "60.58 inches near Nederland", 1,539 mm) the cell on the display
grid holds 1,247 mm, and the wettest native cell in the domain holds 1,379 mm (54.3 in). A cell
average below the largest point value is expected; it also means **the screen understates rarity at
the wettest points.**

The two NASA estimates are much lower where rain was heaviest. At the Motiva Port Arthur refinery:
Stage IV 1,222 mm, IMERG 601 mm, MERRA-2 646 mm. The app shows all three at every site. For
site-level work on this storm the radar and gauge analysis is the one to use; the satellite product
alone would have halved the rainfall.

## 4. What actually shut: reconstructing DOE's count

`research/doe_harvey_aggregates.json`, `public/data/hindcast/doe_harvey_record.json`.

**DOE does not name refineries.** All 22 event reports were downloaded and read (text layer and
embedded images). Each gives only a count and a combined capacity "according to public reports".
An earlier note in this repository said the reports contain a table of names: that was wrong and is
corrected here. Every transcribed capacity figure (50 of them) was re-found by script in the text of
its PDF.

Membership is therefore **reconstructed**:

1. For each report, every set of N refineries from the 55 PADD 3 refineries with a capacity in the
   EIA table of 1 January 2017 was tested against DOE's printed total. **Arithmetic alone is not
   enough:** 141 different sets of six fit 924,720 b/d, and more than 200 sets fit each later total.
2. Updates #1 to #9 also print the number of refineries in each of three named areas (for example
   "all six refineries in the Corpus Christi area, seven refineries in the Houston/Galveston area, and
   two refineries in the Beaumont/Port Arthur area"). Each Texas refinery is assigned to the nearest
   reference city (Corpus Christi; Houston or Galveston; Beaumont or Port Arthur) within 125 km. The
   assignment is the same for any radius from 108 to 166 km.
3. With both constraints, **exactly one set fits each of Updates #1 to #9**, and the nine sets are
   nested: no refinery leaves the count between reports.

| Update | As of (UTC) | DOE count | DOE capacity (b/d) | Sets fitting the total alone | Sets fitting total and regions |
|---|---|---|---|---|---|
| #1 to #3 | 26 Aug 12:00 to 27 Aug 12:00 | 6 | 924,720 | 141 | 1 |
| #4 | 27 Aug 19:00 | 8 | 1,810,920 | > 200 | 1 |
| #5, #6 | 28 Aug 12:00, 19:00 | 10 | 2,170,149 | > 200 | 1 |
| #7 | 29 Aug 12:00 | 11 | 2,361,149 | > 200 | 1 |
| #8 | 29 Aug 19:00 | 14 | 3,268,449 | > 200 | 1 |
| **#9** | **30 Aug 12:00** | **15** | **3,871,449** | > 200 | **1** |
| #10 to #22 | 30 Aug 19:00 to 7 Sep | 10 down to 5 | 3,075,229 down to 1,060,000 | > 200 | no regional counts printed: **unresolved** |

Reconstructed order: the six Corpus Christi area refineries (Flint Hills, Valero, Citgo, Buckeye,
Magellan, and Valero Three Rivers) from Update #1; ExxonMobil Baytown and Deer Park from #4; Phillips
66 Sweeny and Pasadena from #5; Valero Houston from #7; Marathon Galveston Bay, Marathon Texas City
and ExxonMobil Beaumont from #8; Motiva Port Arthur from #9.

Assumptions (DOE states neither): that DOE built its totals from the EIA capacities of January 2017,
which the exact agreement supports; and that DOE's area names mean what the nearest-city rule says.
The rule puts exactly six refineries in the Corpus Christi area, matching DOE's "all six", with
capacities adding to DOE's 924,720 b/d.

What the count is not: "shut down or in the process of shutting down, according to public reports"
mixes precautionary shutdowns with flooding, power loss, port closure and crude supply. DOE gives no
cause for any refinery. Refineries at reduced rates are a separate, unnamed count. Nameplate capacity
is not lost output (EIA measured that separately: Gulf Coast gross inputs fell 3.2 million b/d in the
week ending 1 September 2017).

## 5. The rainfall screen and its hindcast

### Method (`src/sim/rainfall.ts`)

```
P_d        = largest total over d consecutive days at the site's cell, d = 1, 2, 3, 4, 7
A_d(T)     = NOAA Atlas 14 depth for duration d and recurrence interval T at the site
reached_d  = largest tabulated T (1 ... 1,000 yr) with P_d >= A_d(T)
in screen  = max over d of reached_d >= chosen T
```

Nothing is extrapolated beyond 1,000 years. The screen is repeated with the lower and upper 90% bounds
of Atlas 14 and with rainfall scaled by 0.8 and 1.2. No vulnerability curve, flood depth or shutdown
probability is applied.

### Hindcast (`src/sim/harveyHindcast.ts`, `research/rainfall_hindcast_results.json`)

Universe: the 39 refineries of the **2017** fleet in the domain that have a capacity, a position and
rainfall data (8,146,610 b/d). Target: DOE Update #9, as of 1200 UTC 30 August 2017: 15 refineries,
3,871,449 b/d; 14 are in the universe (3,785,449 b/d). Marathon's Texas City refinery (86,000 b/d) is
not, because it merged into Galveston Bay in 2018 and has no point in the EIA layer.
Every screen uses only what had been observed by the report time: best-track wind radii up to that
hour and the 7 rainfall days completed by then.

| Screen | Sites | Capacity (million b/d) | In DOE's count | Missed | Not in DOE's count | Hit rate | False-alarm ratio | CSI |
|---|---|---|---|---|---|---|---|---|
| Wind, observed 64-kt radii | 0 | 0.00 | 0 | 14 | 0 | 0% | n/a | 0% |
| Wind, observed 50-kt radii | 6 | 0.85 | 5 | 9 | 1 | 36% | 17% | 33% |
| Wind, observed 34-kt radii | 25 | 5.77 | 14 | 0 | 11 | 100% | 44% | 56% |
| **Rainfall, 100-year depth** | 14 | 4.02 | 8 | 6 | 6 | 57% | 43% | 40% |
| 50-kt wind or 100-year rainfall | 20 | 4.87 | 13 | 1 | 7 | 93% | 35% | 62% |

- **Rainfall finds what wind missed.** The 8 hits are every counted refinery from Houston to Port
  Arthur that is in the universe (Baytown, Deer Park, Pasadena, Valero Houston, Galveston Bay, Sweeny,
  Beaumont, Motiva Port Arthur). The 6 misses are the Corpus Christi area refineries, which had
  169 to 190 mm of rain (58 mm at Three Rivers) and shut for the wind and ahead of it.
- **It also includes 6 that DOE did not count at that time:** Total and Premcor (Valero) Port Arthur,
  Houston Refining, Kinder Morgan Galena Park, Petromax Houston and Valero Texas City. All six had
  691 to 1,288 mm. Whether they were running, at reduced rates or shut a few hours later cannot be
  established from DOE's unnamed counts. They are reported as not counted, nothing more.
- The combined screen misses only Three Rivers (34-kt wind, 58 mm of rain, 107 km inland from Corpus
  Christi).
- The 34-kt wind radii also find all 14, with 11 extras. On this storm, tropical-storm-force wind
  extent and extreme rainfall overlap heavily; one storm cannot separate them.

The result holds across thresholds, which are all reported so that none can be chosen after the fact:

| Rainfall threshold | Sites | In DOE's count | Missed | Not counted | With 50-kt wind: sites / hits / missed / not counted |
|---|---|---|---|---|---|
| 10-year | 18 | 8 | 6 | 10 | 23 / 13 / 1 / 10 |
| 25-year | 17 | 8 | 6 | 9 | 22 / 13 / 1 / 9 |
| 100-year | 14 | 8 | 6 | 6 | 20 / 13 / 1 / 7 |
| 500-year | 11 | 6 | 8 | 5 | 17 / 11 / 3 / 6 |
| 1,000-year | 8 | 4 | 10 | 4 | 14 / 9 / 5 / 5 |

Through time (100-year depth; counts are sites / in DOE's count / missed / not counted):

| Update | As of (UTC) | Rain days | DOE count in universe | Wind 50 kt | Rainfall | 50-kt wind or rainfall |
|---|---|---|---|---|---|---|
| #1 | 26 Aug 12:00 | 3 | 6 | 5 / 5 / 1 / 0 | 0 / 0 / 6 / 0 | 5 / 5 / 1 / 0 |
| #3 | 27 Aug 12:00 | 4 | 6 | 6 / 5 / 1 / 1 | 4 / 0 / 6 / 4 | 10 / 5 / 1 / 5 |
| #5 | 28 Aug 12:00 | 5 | 10 | 6 / 5 / 5 / 1 | 7 / 3 / 7 / 4 | 13 / 8 / 2 / 5 |
| #7 | 29 Aug 12:00 | 6 | 11 | 6 / 5 / 6 / 1 | 13 / 5 / 6 / 8 | 19 / 10 / 1 / 9 |
| #9 | 30 Aug 12:00 | 7 | 14 | 6 / 5 / 9 / 1 | 14 / 8 / 6 / 6 | 20 / 13 / 1 / 7 |

Four Houston Ship Channel sites (Houston Refining, Kinder Morgan Galena Park, Pasadena, Valero
Houston) had reached the 100-year depth by 27 August 12:00 UTC, before DOE counted any Houston
refinery (Update #4, seven hours later). That is a description of this storm, not a lead
time that can be promised for another.

### Uncertainty

| Variation | Rainfall screen, sites | In DOE's count | Not counted |
|---|---|---|---|
| Atlas 14 estimate (reference) | 14 | 8 | 6 |
| Atlas 14 upper 90% bound | 11 | 6 | 5 |
| Atlas 14 lower 90% bound | 17 | 8 | 9 |
| Rainfall × 0.8 | 11 | 6 | 5 |
| Rainfall × 1.2 | 15 | 8 | 7 |

The ±20% rainfall factor was fixed before the gauge comparison was run. It is wider than the 8%
mean absolute difference found at the heaviest gauges, so it is a conservative envelope.

### What this does and does not show

It shows that adding observed rainfall rarity moves the screen from finding 0 to 36% of DOE's count
(wind at 64 or 50 kt) to finding 93%, on the one storm for which wind failed.

It does **not** validate a predictor. One storm; a target that mixes causes and is reconstructed; a
false-alarm ratio of 35 to 43%; and a simpler screen (34-kt wind) that does as well on hits. The model
card and the app say so. The rainfall screen stays EXPERIMENTAL.

## 6. Modelled rainfall for hypothetical storms: R-CLIPER fails

A hypothetical storm has no observed rainfall. The only simple, published, operational model is
R-CLIPER (Tuleya, DeMaria and Kuligowski 2007, Eqs. 3 to 5 and Table 2, "NHC" rows), implemented in
`src/sim/rcliper.ts` exactly as printed and checked against the publisher's table image:

```
TRR(r) = T0 + (Tm - T0)(r / rm)   for r < rm;    Tm exp(-(r - rm) / re)   for r >= rm     [in/day]
T0 = -1.10 + 3.96 U,  Tm = -1.60 + 4.80 U,  rm = 64.5 - 13.0 U km,  re = 150 - 16.0 U km
U = 1 + (Vmax - 35) / 33,  Vmax in knots
```

The same constants appear, converted to mm/h, in Angkanasirikul, Jian and Lo (2024) and in the CLIMADA
source code; these are restatements, not independent derivations. Three choices here are not in the
paper and are conservative: zero beyond 500 km (the radius the fit used), no negative rate, and zero
where `rm` or `re` is not positive.

Hindcast (`research/rcliper_hindcast_results.json`): the model run along the NHC best track with
observed maximum winds, 0.5-hour steps, over the same ten days as Stage IV, at all 69 sites.

| Sites | n | Observed mean (mm) | Model mean (mm) | Model ÷ observed | Mean absolute error | Correlation |
|---|---|---|---|---|---|---|
| All | 69 | 462.9 | 153.5 | 0.33 | 367 mm | 0.22 |
| Refineries | 45 | 490.9 | 158.3 | 0.32 | 392 mm | 0.20 |
| Observed ≥ 750 mm | 20 | 1,064.3 | 172.8 | **0.16** | 892 mm | **−0.21** |
| Whole field, every second grid cell | 6,874 | 165.8 | 117.3 | 0.71 | 125 mm | 0.33 |

It also puts the rain in the wrong place: 318 to 331 mm at Corpus Christi where 173 to 190 mm fell,
and 159 to 165 mm at Port Arthur where 1,133 to 1,326 mm fell. This is the failure its authors
describe ("asymmetries will not be taken into account"; about 60% of observed rain volume; low bias
for heavy rain), at its worst for a stalled storm.

**Decision:** R-CLIPER output appears in the app only as a labelled context line on a site in the
wind scenario ("Context only: not used in any count"), with its Harvey result beside it. No exposure
is counted with it. Kraft's rule of thumb (Pfost 2000: "an estimate for the maximum rainfall from a
landfalling tropical cyclone in inches is 100 divided by the storm speed in knots") is shown as a
labelled hint on the forward-speed control.

## 7. In the application

Simulator → Disaster type → "Hurricane rainfall · Harvey 2017, observed record".

- Globe: accumulated Stage IV rainfall in whole days, the NHC best track and its 34/50/64-kt radii
  hour by hour, 2,364 USGS high-water marks, and each refinery and port coloured by the rarest
  rainfall depth reached so far.
- Left panel: capacity in the screen, threshold (10 to 1,000 years), Atlas 14 reading (estimate or
  either 90% bound), the uncertainty range, and wind beside rainfall beside DOE's count.
- Right panel: evidence for a selected site (daily rainfall from three sources, the Atlas 14
  comparison for five durations, elevation, flood zone, high-water marks nearby, wind radii, DOE
  status); the hindcast table, which follows the chosen threshold; the economic network; limits and
  sources.
- Tests: 51 unit tests on the rainfall code and data, 18 on R-CLIPER, 8 on the network; 8 browser
  tests (`tests/e2e/hazards.spec.ts`).

## 8. What was not built, and why

- **Flood depth or inundation at a site.** Rainfall does not convert to depth without a hydrologic
  and hydraulic model: drainage network, river and bayou stage, levees, pumps, tide, and site
  grading. None is available keyless at the resolution of a refinery. High-water marks are point
  observations where crews went, not a surface.
- **A vulnerability or shutdown probability.** One storm with a mixed-cause, reconstructed target
  cannot support one.
- **Rainfall exposure for a hypothetical storm.** The only simple model fails on the storm that
  matters most (section 6).
- **Outage duration, lost output, prices, company or portfolio returns.** Not estimated anywhere.

## 9. Data gaps and research needs

1. **Names in DOE's reports from 30 August afternoon onward.** Unresolved here. Company statements,
   EIA-820 follow-up or Texas Commission on Environmental Quality emission-event filings would name
   refineries and causes.
2. **Causes.** No source retrieved attributes an individual shutdown to flooding rather than
   precaution, power, port closure or crude supply.
3. **More storms.** The keyless NWS address returned 404 for the Stage IV daily files of September
   2008, so Ike cannot be done this way; where that archive begins was not established. Later storms
   (for example Imelda 2019, Laura 2020, Ida 2021, Beryl 2024) are candidates, not yet checked.
   DOE did publish a named refinery table for Ike (Situation Report #3, 15 September 2008: 14
   refineries shut, 3,573,120 b/d). It was transcribed by a research pass and is not yet re-checked
   or used; it would allow the wind screens to be scored by refinery.
4. **Sub-daily rainfall.** Daily 1200 UTC windows understate the largest 24-hour amount. NOAA used
   6-hourly Stage IV for its own Harvey analysis; those files were not retrieved.
5. **Site footprints.** Each refinery is one point. Facility polygons and site grading would allow a
   proper overlap with flood-hazard zones and high-water marks.
6. **Observed inundation.** USGS published 19 inundation maps for Harvey (Watson et al. 2018); FEMA
   and satellite flood extents also exist. None is integrated.
7. **Atlas 14 is not independent of Harvey.** Volume 11 was published in 2018 and includes the storm.
8. **Marathon's Texas City refinery** has no position in the EIA layer and is left out of the scoring.
9. **The six "not counted" refineries.** Their status on 30 August is unknown.
10. **A rainfall model that works for stalled storms.** PHRaM (Lonfat et al. 2007) adds shear and
    topography but its coefficients are not printed in the paper; nothing verifiable was found.

## 10. Reproduce

```bash
python -m venv research/venv && research/venv/Scripts/python -m pip install numpy netCDF4 pypdf xlrd pyshp shapely
research/venv/Scripts/python -I research/scripts/build_historical_fleet.py 2017   # needs refcap17.xls and the EIA shapefile in research/raw/
research/venv/Scripts/python -I research/scripts/fetch_harvey_rainfall.py         # about 400 keyless requests, cached
research/venv/Scripts/python -I research/scripts/build_harvey_rainfall.py
research/venv/Scripts/python -I research/scripts/build_doe_harvey_record.py
node research/scripts/run_rainfall_hindcast.mjs
node research/scripts/run_rcliper_hindcast.mjs
npx vitest run src/sim/rainfall.test.ts src/sim/rainfall.data.test.ts src/sim/rcliper.test.ts src/sim/rainGraph.test.ts
```

## References

- Blake, E. S., and D. A. Zelinsky, 2018: National Hurricane Center Tropical Cyclone Report, Hurricane Harvey (AL092017). https://www.nhc.noaa.gov/data/tcr/AL092017_Harvey.pdf
- Lin, Y., and K. E. Mitchell, 2005: The NCEP Stage II/IV hourly precipitation analyses: development and applications. 19th Conf. on Hydrology, Amer. Meteor. Soc., 1.2. https://ams.confex.com/ams/pdfpapers/83847.pdf
- Perica, S., and Coauthors, 2018: NOAA Atlas 14, Volume 11, Version 2.0: Texas. https://www.weather.gov/media/owp/oh/hdsc/docs/Atlas14_Volume11.pdf
- NOAA HDSC, 2017: Hurricane Harvey, 25 - 31 August 2017, Annual Exceedance Probabilities for the Worst Case 4-day Rainfall. https://hdsc.nws.noaa.gov/pub/hdsc/data/aep/201708_Harvey/AEP_HurricaneHarvey_August2017.pdf
- Tuleya, R. E., M. DeMaria, and R. J. Kuligowski, 2007: Evaluation of GFDL and simple statistical model rainfall forecasts for U.S. landfalling tropical storms. Wea. Forecasting, 22, 56-70.
- Pfost, R. L., 2000: Operational tropical cyclone quantitative precipitation forecasting. Natl. Wea. Dig., 24, 61-66.
- Watson, K. M., and Coauthors, 2018: USGS Scientific Investigations Report 2018-5070. https://pubs.usgs.gov/sir/2018/5070/sir20185070.pdf
- U.S. Department of Energy, 2017: Hurricane Harvey Event Reports, Updates #1 to #22. https://www.energy.gov/ceser/articles/hurricanes-maria-irma-and-harvey-situation-reports-archived-august-26-2017-september
- U.S. EIA, 2017: Refinery Capacity Report, data as of 1 January 2017. https://www.eia.gov/petroleum/refinerycapacity/archive/2017/refcap2017.php
