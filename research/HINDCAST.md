# Hindcast: wind-exposure screen against Hurricane Harvey (2017) and Hurricane Ike (2008)

Task T05. Run on 16 November 2026 (UTC). Every number below is either read from a file downloaded
for this project or computed from such files by code in this repository. Nothing was tuned.

**Verdict: the wind-exposure screen is NOT validated by this hindcast.** For Harvey it fails, as
expected for a wind-only model. For Ike the footprint is of the right order of magnitude, but the
list of refineries that actually closed was not retrieved, so membership cannot be scored.

## 1. Data

| Input | Source | Notes |
|---|---|---|
| Best tracks | NOAA NHC, Atlantic HURDAT2 1851-2025, https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2025-092326.txt (retrieved 2026-11-16T03:42:59Z) | Format: Landsea (April 2022), https://www.nhc.noaa.gov/data/hurdat/hurdat2-format-atl-1851-2021.pdf. Only AL092017 (74 fixes) and AL092008 (62 fixes) are extracted, unchanged, to `public/data/hindcast/best_tracks.json` by `research/scripts/build_best_tracks.py`. |
| Refineries | EIA Refinery Capacity Report, capacity **as of 1 January 2026**, `public/data/infrastructure/refineries.json` | 124 sites with coordinates, 18,081,793 b/d in total. **This is not the 2017 or the 2008 fleet**: refineries have opened, closed, changed owner and changed capacity since. |
| Documented outcomes | `research/HARVEY_FACTS.md` (DOE situation reports, NHC Tropical Cyclone Reports) | Quoted there with URLs. |

Parsing check against facts verified independently in `HARVEY_FACTS.md` (NHC Tropical Cyclone Reports):

| Fact (NHC report) | HURDAT2 record | Agrees |
|---|---|---|
| Harvey landfall 0300 UTC 26 Aug 2017, 115 kt, 937 mb | `20170826, 0300, L, HU, 28.0N, 96.9W, 115, 937` | yes |
| Harvey second landfall 3 h later, 105 kt, 948 mb | `20170826, 0600, L, HU, 28.2N, 97.1W, 105, 948` | yes |
| Ike landfall 0700 UTC 13 Sep 2008, 95 kt | `20080913, 0700, L, HU, 29.3N, 94.7W, 95, 950` | yes |

## 2. Method

Code: `src/sim/hindcast.ts` (pure, 25 unit tests in `src/sim/hindcast.test.ts`). Runner:
`node research/scripts/run_hindcast.mjs`, which writes `research/hindcast_results.json` (full
refinery lists with first-exposure times).

1. **Track.** Each interval between consecutive best-track fixes is divided into equal parts of at
   most one hour. Position, maximum wind and each wind radius are interpolated linearly in time.
   The whole life of each system is used, including the extratropical stage.
2. **Observed-radii footprint.** A refinery is "inside" if, at any interpolated time, its
   great-circle distance from the centre is no more than the best-track radius for that wind speed
   (34, 50 or 64 kt) in the quadrant it lies in (NE 0-90, SE 90-180, SW 180-270, NW 270-360 degrees
   by bearing from the centre). 1 nm = 1.852 km. A radius of 0 or a missing radius exposes nothing.
3. **Holland-profile footprint.** The app's own wind profile (`hollandWindKt`, Holland 1980,
   symmetric) evaluated along the observed track with the observed maximum wind at each time,
   Holland B = 1.5 and a fixed Rmax of 20, 35 or 50 km. No decay model is applied because the
   observed winds already weaken. A refinery is "inside" if the profile wind reaches the threshold.
4. **Capacity.** Sum of EIA atmospheric crude distillation capacity over the refineries inside.
   Sites without a capacity value are counted separately and never zero-filled.

Rmax is an assumption: HURDAT2 best-tracks the radius of maximum wind only from 2021. The file does
carry a value on three landfall fixes here: 10 nm (18.5 km) for Harvey at 0300 and 0600 UTC
26 August 2017, and 30 nm (55.6 km) for Ike at 0700 UTC 13 September 2008. The nearest tested Rmax
is therefore 20 km for Harvey and 50 km for Ike. No Rmax was fitted.

## 3. Results

"Share" is the share of the 18,081,793 b/d in the 2026 EIA file. "No cap." counts sites inside the
footprint that have no crude distillation capacity in the EIA file (they are in the count, not in
the capacity).

### Hurricane Harvey (AL092017)

Documented (DOE Update #9, 30 August 2017): 6 Corpus Christi + 7 Houston/Galveston +
2 Beaumont/Port Arthur refineries (15 by addition) "shut down or in the process of shutting down",
3,871,449 b/d, 20.9% of U.S. refining capacity.

| Footprint | Refineries | No cap. | Capacity (b/d) | Share | Capacity as % of DOE's 3,871,449 |
|---|---|---|---|---|---|
| Observed 64-kt radii | 0 | 0 | 0 | 0.0% | 0% |
| Observed 50-kt radii | 7 | 0 | 956,500 | 5.3% | 24.7% |
| Observed 34-kt radii | 29 | 3 | 6,336,050 | 35.0% | 163.7% |
| Holland 64 kt, Rmax 20 km | 6 | 0 | 942,500 | 5.2% | 24.3% |
| Holland 64 kt, Rmax 35 km | 7 | 0 | 1,031,500 | 5.7% | 26.6% |
| Holland 64 kt, Rmax 50 km | 9 | 0 | 1,322,500 | 7.3% | 34.2% |
| Holland 34 kt, Rmax 20 km | 13 | 1 | 2,192,900 | 12.1% | 56.6% |
| Holland 34 kt, Rmax 35 km | 28 | 2 | 6,336,050 | 35.0% | 163.7% |
| Holland 34 kt, Rmax 50 km | 29 | 3 | 6,336,050 | 35.0% | 163.7% |

Which refineries (EIA site names, 2026 file):

- **Observed 64-kt radii: none.** The Corpus Christi sites were 53 to 58 km from the track; the
  best-track 64-kt radius on that side of the storm was 20 to 25 nm (37 to 46 km).
- **Observed 50-kt radii (7):** the six Corpus Christi sites (CORPUS CHRISTI WEST and EAST, Flint
  Hills; CORPUS CHRISTI, Valero; CORPUS CHRISTI, Citgo; CORPUS CHRISTI, Buckeye Texas Processing;
  CORPUS CHRISTI, Magellan Processing) and NIXON (Lazarus Energy).
- **Holland 64 kt:** the same six Corpus Christi sites at Rmax 20 km; plus THREE RIVERS at 35 km;
  plus SWEENY and NIXON at 50 km. **No Houston, Galveston Bay, Texas City, Beaumont or Port Arthur
  site at any tested Rmax.**
- **Observed 34-kt radii (29):** the seven above, plus THREE RIVERS and SAN ANTONIO, SWEENY, the
  Houston Ship Channel and Galveston Bay sites (GALVESTON BAY, BAYTOWN, DEER PARK, TEXAS CITY,
  HOUSTON x2, PASADENA, GALENA PARK, CHANNELVIEW x2), BEAUMONT, PORT ARTHUR x3, SILSBEE, and four
  Louisiana sites (LAKE CHARLES x2, WESTLAKE x2). The Houston-area sites first enter at 11:00 to
  12:00 UTC 27 August, when Harvey was a 35-kt tropical storm whose best-track 34-kt radius in the
  north-east quadrant was 150 nm (278 km); over the whole track they were never closer than 115 to
  160 km to the centre. Beaumont and Port Arthur enter on 28 August.

### Hurricane Ike (AL092008)

Documented (NHC Tropical Cyclone Report, citing DOE): "14 oil refineries were closed by the storm".
No capacity figure and no list of names was verified.

| Footprint | Refineries | No cap. | Capacity (b/d) | Share | Of which Texas + Louisiana |
|---|---|---|---|---|---|
| Observed 64-kt radii | 19 | 3 | 4,993,550 | 27.6% | 19 refineries, 4,993,550 b/d |
| Observed 50-kt radii | 31 | 3 | 6,487,150 | 35.9% | 21 refineries, 5,344,550 b/d |
| Observed 34-kt radii | 44 | 3 | 9,402,123 | 52.0% | 32 refineries, 7,479,523 b/d |
| Holland 64 kt, Rmax 20 km | 10 | 1 | 2,231,750 | 12.3% | all |
| Holland 64 kt, Rmax 35 km | 13 | 1 | 3,885,150 | 21.5% | all |
| Holland 64 kt, Rmax 50 km | 16 | 2 | 4,400,150 | 24.3% | all |
| Holland 34 kt, Rmax 20 km | 18 | 2 | 4,620,150 | 25.6% | 17 refineries, 4,474,150 b/d |
| Holland 34 kt, Rmax 35 km | 26 | 3 | 6,412,150 | 35.5% | 21 refineries, 5,344,550 b/d |
| Holland 34 kt, Rmax 50 km | 42 | 3 | 8,839,450 | 48.9% | 35 refineries, 7,153,850 b/d |

- **Observed 64-kt radii (19, all first reached on 13 September 2008):** GALVESTON BAY, TEXAS CITY,
  BAYTOWN, DEER PARK, HOUSTON x2, PASADENA, GALENA PARK, CHANNELVIEW x2, BEAUMONT, PORT ARTHUR x3,
  SILSBEE, LAKE CHARLES x2, WESTLAKE x2. Three of the 19 (Channelview/Equistar, Silsbee/Trecora,
  Westlake/Excel Paralubes) have no crude distillation capacity in the EIA file, leaving 16.
- **Holland 64 kt, Rmax 50 km (16):** the same Texas sites plus SWEENY, and **none of the four
  Lake Charles and Westlake sites**. Those were 159 to 168 km from the track on the storm's
  eastern side, where the best-track 64-kt radius was 110 nm (204 km) against 45 nm (83 km) to the
  north-west. A symmetric profile cannot represent that.
- The 50-kt and 34-kt observed footprints also pick up 10 and 12 refineries in Illinois, Indiana,
  Michigan, Ohio, Pennsylvania and West Virginia on 14 and 15 September, when Ike was an
  extratropical low with 40 to 50 kt winds. Nothing retrieved here says whether any of those closed.

## 4. Where the screen fails, and why

**Harvey: fails.**

- At the app's default 64-kt threshold the wind footprint holds about a quarter to a third of the
  capacity DOE reported shut (24% to 34%, depending on Rmax), and by the observed 64-kt radii it
  holds none. It finds only the Corpus Christi cluster and, at larger Rmax, three sites nearer the
  track. It finds no site on the Houston Ship Channel, at Galveston Bay or Texas City, or at Beaumont
  or Port Arthur, so essentially none of the nine refineries DOE counted in the Houston/Galveston
  and Beaumont/Port Arthur areas. (The one possible exception is SWEENY, 277,000 b/d, inside at
  Rmax 50 km only, if DOE grouped it with Houston/Galveston; the DOE table of names was not
  transcribed.)
- Lowering the threshold to 34 kt does not fix it; it overshoots instead: 29 sites and 164% of the
  DOE capacity figure, including Lake Charles, Westlake, San Antonio and others outside DOE's three
  areas. No threshold reproduces the documented outcome, and choosing one after the fact to match
  it would be tuning.
- This is expected. NHC: Harvey "stalled, with its center over or near the Texas coast for four
  days, dropping historic amounts of rainfall of more than 60 inches over southeastern Texas". From
  27 to 30 August, the days DOE's counts rose to their highest, the best track has Harvey as a 35 to
  45 kt tropical storm. Hurricane-force wind at the plants cannot explain the Houston and
  Beaumont/Port Arthur shutdowns, and the model has no rainfall, flooding or surge.
- DOE's figure counts refineries "shut down or in the process of shutting down, according to public
  reports". That includes precautionary shutdowns before the storm and shutdowns for flooding, power,
  staffing, crude supply or port closure. None of these is a wind threshold at the plant.
- DOE's 3,871,449 b/d is the nameplate capacity of affected refineries, not lost output. Neither is
  the model's "capacity in footprint". EIA measured the output effect separately: Gulf Coast gross
  inputs fell 3.2 million b/d in the week ending 1 September 2017.
- The Holland profile is also too broad for Harvey even at the Rmax closest to the best-track value.
  With Rmax 20 km and B = 1.5 it gives 73 to 79 kt at the Corpus Christi sites, where the best track
  places them outside the 64-kt radius and inside the 50-kt radius. The agreement in count with the
  observed **50-kt** footprint (6 or 7 sites) is therefore an error in the profile, not a success.

**Ike: inconclusive, leaning plausible.**

- 14 refineries were reported closed. The observed 64-kt footprint holds 19 sites of the 2026 fleet
  (16 with crude distillation capacity); the Holland 64-kt footprint holds 10, 13 or 16 depending on
  Rmax. The counts are of the same order, and Ike was a large wind and surge event whose core
  crossed Galveston Bay and the Houston Ship Channel, so a wind footprint is at least a reasonable
  proxy for where the damage was.
- But this is a comparison of two counts across different fleets (2008 and 2026), with no list of
  the 14 refineries and no capacity figure. A matching count is not a matching set. The Holland
  count moves from 10 to 16 with an assumed Rmax, so agreement at one value (13 at 35 km) means little.
- The symmetric profile misses the Lake Charles area entirely, which the observed radii include.

## 5. Caveats

1. **2026 fleet, not the historical one.** Counts and capacities use EIA data as of 1 January 2026.
   The percentages against DOE's 2017 figure mix a 2026 numerator with a 2017 denominator. That the
   2026 file has six Corpus Christi sites and DOE counted six Corpus Christi refineries in 2017 does
   not show they are the same six; the DOE table of names was not transcribed.
2. **Best-track radii are maximum extents.** HURDAT2 gives the largest distance in each quadrant at
   which the wind speed occurs, so a quadrant sector built from it overstates the area with that
   wind. The observed-radii footprints are upper bounds.
3. **Radii and winds are over-water estimates** for the storm as a whole, to the nearest 5 nm and
   5 kt; they are not winds measured at any refinery. No anemometer data were used.
4. **6-hourly fixes**, plus a few landfall fixes, interpolated linearly. Radii can change sharply
   between fixes (Ike's NE 64-kt radius goes from 110 nm at landfall to 50 nm five hours later).
5. **Wind only.** No surge, rainfall, flooding, power loss, port closure or precautionary shutdown.
6. **Exposure is not shutdown.** No vulnerability curve is applied; none has been validated.
7. **Assumed Rmax and B**, held constant along the whole track; symmetric profile; no asymmetry
   from forward motion; no land roughness.
8. **Two storms.** Even a good match on two events would not validate a model.
9. **"Shut down" is DOE's wording** for 30 August 2017, the highest figure among the reports read
   (#8 to #14 and #22), not a proven peak. The Ike figure is NHC quoting DOE; DOE's own Ike reports
   were not retrieved.
10. The extratropical stage is included. It adds Midwestern refineries to Ike's 34-kt and 50-kt
    footprints; the table gives the Texas + Louisiana subset separately.

## 6. Reproduce

```bash
python -I research/scripts/build_best_tracks.py     # needs research/raw/hurdat2/ (see the script header)
node research/scripts/run_hindcast.mjs              # writes research/hindcast_results.json
npx vitest run src/sim/hindcast.test.ts             # 25 tests, including these numbers as regression values
```
