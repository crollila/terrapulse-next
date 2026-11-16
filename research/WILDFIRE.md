# Wildfire: observed record, proximity screen, and why no spread is simulated

Task T08. Work done 16 November 2026 on branch `research/hazard-sim`. Every number is read from a
file downloaded for this project or computed from such files by code in this repository.

**Verdicts**

| Capability | Status | Why |
|---|---|---|
| Observed perimeters and satellite detections of three historical fires, replayed in time | **Validated as a record**: two independent observing systems agree (section 3) | |
| Proximity screen (infrastructure inside or within a chosen distance of the final perimeter) | **Experimental**: geometry on published layers; distance is not damage | section 4 |
| Fire-spread simulation or any forecast of where a fire will go | **Not built, and marked as not offered in the app** | section 5 |
| Damage, outages, prices, company or portfolio effects | **Not estimated** | section 6 |

## 1. Data

| Need | Source | Access | Notes |
|---|---|---|---|
| Final perimeters | NIFC Open Data: `InterAgencyFirePerimeterHistory_All_Years_View` (Camp, 2018) and `WFIGS_Interagency_Perimeters` (Marshall 2021, Smokehouse Creek 2024) | keyless ArcGIS REST, GeoJSON | Simplified by the server to about 22 to 56 m for display |
| Dated perimeters | `Historic_Geomac_Perimeters_2018`: **28 perimeters** for the Camp Fire, 8 to 25 November 2018, from infrared flights and "mixed methods" | keyless | GeoMAC: "not the final or official perimeter for any incident" |
| Active-fire detections | NASA FIRMS yearly country archive, **VIIRS 375 m** on Suomi NPP and NOAA-20 | keyless CSV, 44 MB per satellite-year | Only presumed vegetation fires (type 0) are kept |
| Fire weather at the origin | gridMET (Abatzoglou 2013) daily ERC, burning index, 100-hour fuel moisture, wind, minimum humidity, vapour pressure deficit, precipitation, through the THREDDS NetCDF Subset Service | keyless | A 4-km gridded estimate |
| Regional weather | NASA POWER daily (MERRA-2) | keyless | About 50 km |
| Drought | U.S. Drought Monitor county statistics | keyless | Use with attribution |
| Power plants, gas pipelines | U.S. EIA map-layer shapefiles | keyless, public domain | The current asset list, not the list on the day of each fire |
| Transmission lines | HIFLD "U.S. Electric Power Transmission Lines (Archive)", last updated 30 September 2024 | keyless | Redistribution terms of the archived copy were not verified: **only derived lengths are stored, never the lines** |
| Refineries, ports | The app's EIA and USACE layers | bundled | |
| Documented facts | CAL FIRE incident API and DINS damage inspections; U.S. Census TIGERweb; Texas House committee report; Texas A&M Forest Service; Boulder County | keyless | Each quote is checked by script against the saved copy of its source; a quote that cannot be found is dropped |

Script: `research/scripts/build_wildfires.py` (downloads cached in `research/raw/wildfire_build/`).
Output: `public/data/wildfire/index.json` and one file per fire, with provider, URL, retrieval time
and hashes in `meta.sources`.

Two traps found while building, both caught by reading the files rather than trusting the service:

- **gridMET point subsets return packed integers without their scale factors.** A wind speed of
  11.3 m/s arrives as 113 and 100-hour fuel moisture of 4.4% as 44. The build reads each variable's
  `scale_factor` and `add_offset` from the dataset's own attribute listing, refuses a variable whose
  packing it cannot read, and asserts that a subset never already carries a scale factor.
- **The interagency "discovery time" can be later than the first satellite detection.** For the
  Marshall Fire the record says 22:38 UTC; VIIRS saw fire 3.2 hours earlier. The record's time is
  shown as printed and the discrepancy is listed among that fire's gaps.

## 2. The three fires

| | Camp Fire | Marshall Fire | Smokehouse Creek Fire |
|---|---|---|---|
| Place | Butte County, California | Boulder County, Colorado | Texas Panhandle and western Oklahoma |
| Start on the record (UTC) | 8 Nov 2018, 14:33 | 30 Dec 2021, 22:38 | 26 Feb 2024, 20:16 |
| Size on the record (acres) | 153,336 | 6,080 | 1,054,153 |
| Area of the shape drawn (acres) | 152,450 (99.4%) | 6,045 (99.4%) | 1,049,609 (99.6%) |
| VIIRS detections kept | 8,636 in 72 overpasses | 186 in 6 overpasses | 5,701 in 32 overpasses |
| Dated perimeters | 28 | none published | none usable |
| gridMET on the start day: ERC / burning index | 89 / 143 | 70 / 86 | 55 / 68 |
| gridMET mean wind (m/s) / minimum humidity (%) / 100-h fuel moisture (%) | 11.3 / 3.9 / 4.4 | 7.3 / 15.1 / 9.2 | 7.5 / 22.4 / 8.5 |
| County drought class (U.S. Drought Monitor) | 100% abnormally dry (D0), none in drought | 100% moderate drought or worse, 60% extreme | no part of the county in any class |
| Power plants inside the perimeter (EIA) | 4, 194 MW | 0 | 1, 3 MW |
| Transmission line inside (km) | 237.8 | 22.8 | 156.1 |
| Gas pipeline inside (km, EIA schematic layer) | 52.6 | 0 | 876 |
| Nearest refinery | none within 150 km | Commerce City, 22 km | Borger, 7.8 km |

Documented facts carried in the app (each with its quote and source):

- **Camp:** 18,804 structures inspected as destroyed (CAL FIRE DINS record count); population of the
  Town of Paradise 26,218 in the 2010 Census and 4,764 in the 2020 Census (the change is not
  attributed to any single cause). **The cause is not stated**: CAL FIRE's incident page and the
  Butte County District Attorney's report refuse automated requests, so there is no saved copy to
  check a quote against.
- **Marshall:** gusts of 70 to 100 mph, cured grass, humidity around 20%; 1,084 homes destroyed
  (county after-action report) and 1,109 homes destroyed (county recovery page): both figures are
  shown with their source because the county's documents differ. Cause on the interagency record:
  "Undetermined"; later local findings were not retrieved from a primary source.
- **Smokehouse Creek:** 1,054,153 acres (Texas A&M Forest Service); "a decayed power pole broke at
  ground level and caused the three-wire power line atop it to fall", and "Both the Smokehouse Creek
  and Reamer Creek fires were caused by downed power poles owned by Xcel Energy" (Texas House
  committee report); more than 15,000 cattle and an estimated 138 homes and businesses.

The drought row is worth reading twice: the largest fire in Texas history started in a county with
no drought classification, and the most destructive fire in California history in a county that was
only "abnormally dry". Drought class alone did not mark these days out; wind and fuel dryness did.

## 3. Do the two observing systems agree?

`research/wildfire_checks.json`, `src/sim/wildfire.test.ts`.

Satellite detections (NASA) and mapped perimeters (ground crews and aircraft) are independent. If
the record is sound, detections should fall inside the perimeter.

| Fire | Detections in the search box | Within one pixel (375 m) of the final perimeter | More than 2 km outside |
|---|---|---|---|
| Camp | 8,636 | 8,602 (99.6%) | 0 |
| Marshall | 186 | 183 (98.4%) | 2 |
| Smokehouse Creek | 5,701 | 5,042 (88.4%) | 656 |

Smokehouse Creek's 656 distant detections are other fires burning in the Panhandle at the same time
(the Texas House report names the Windy Deuce and Reamer Creek fires). They are kept, drawn grey and
listed as a gap, not deleted.

For the Camp Fire each of the 28 dated perimeters can be tested against the detections acquired up
to its time (strict point-in-polygon on the simplified shape, no pixel tolerance):

| Perimeter mapped (UTC) | Method | Acres | Detections so far | Inside it |
|---|---|---|---|---|
| 8 Nov 17:54 | Infrared image | 54,586 | 0 | n/a |
| 9 Nov 00:00 | Mixed methods | 70,454 | 1,142 | 95.9% |
| 9 Nov 19:02 | Infrared image | 109,503 | 2,973 | 94.6% |
| 10 Nov 21:10 | Infrared image | 114,866 | 4,230 | 93.9% |
| 12 Nov 22:05 | Infrared image | 138,127 | 6,362 | 94.8% |
| 13 Nov 02:53 | Mixed methods | 128,816 | 6,362 | 87.1% (lowest) |
| 15 Nov 17:43 | Infrared image | 151,575 | 7,486 | 94.7% |
| 20 Nov 18:08 | Infrared image | 153,438 | 8,603 | 93.7% |
| 25 Nov 18:22 | Mixed methods | 153,336 | 8,636 | 93.5% |

Across the 27 perimeters with detections the share is 87.1% to 95.9%. Two things are visible in the
record and are left as they are:

- **Mapped size is not monotonic.** Infrared flights and "mixed methods" perimeters alternate and
  several later maps are smaller than earlier ones (138,127 then 128,816 acres on 12 to 13 November).
  The app shows the latest mapped perimeter at each time, whatever its size.
- **The first perimeter (17:54 UTC) precedes the first overpass (19:50 UTC).** Satellites pass twice
  a day each; the 54,586 acres mapped three hours after ignition were not seen from orbit until later.

This is a consistency check of observations. **It validates no prediction, because nothing is
predicted.**

## 4. The proximity screen

`src/sim/wildfire.ts`.

```
detections by time t   = detections with acquisition time <= t
perimeter at time t    = latest dated perimeter mapped at or before t (Camp only)
site is "near"         = straight-line distance from the site to the final perimeter <= d
capacity near the fire = sum of nameplate capacity over those sites
```

`d` is chosen by the user from 0 (inside), 2, 10, 25 and 50 km. Distances are computed in the build
with a local equirectangular projection (error under 0.5% at these scales) and the browser's own
area calculation agrees with the build's to within 1%.

| Distance | Camp: plants / MW | Marshall: plants / MW | Smokehouse Creek: plants / MW; refineries |
|---|---|---|---|
| inside | 4 / 194 | 0 / 0 | 1 / 3 |
| 2 km | 6 / 204 | 0 / 0 | 1 / 3 |
| 10 km | 16 / 1,319 | 9 / 396 | 6 / 642; Borger (7.8 km) |
| 25 km | 22 / 1,553 | 23 / 1,370; Commerce City West and East (22 km) | 11 / 1,260; Borger |
| 50 km | 37 / 2,260 | 57 / 4,290; Commerce City | 28 / 3,023; Borger, Sunray (36.6 km) |

The economic network uses the same builder as the hurricane views (`buildExposureGraph`). For a fire
it adds power plants, transmission lines and gas pipelines, the activities they serve (electricity
generation and transmission, gas transmission) and the commodities, and it brings in the refinery
network only when a refinery is within the chosen distance. Every link carries its meaning, basis and
source; every effect (outage, price, financial) reads "Not estimated" or "Cannot be estimated".
Utilities have no verified listing table in this project, so the portfolio screen is not offered for
wildfire: the app says "Insufficient validated data".

**Proximity is not damage.** Four hydroelectric and biomass plants lie inside the Camp Fire perimeter;
nothing retrieved here says what happened to them. The screen answers "what was near", nothing more.

## 5. Why no fire spread is simulated

The standard operational surface-fire model is Rothermel (1972), documented at length by Andrews
(2018). It was read for this work. What it needs, for every cell (Andrews 2018, Table 5): fuel
particle heat content, mineral content and density; surface-area-to-volume ratio, fuel load and bed
depth by size class, dead and live; moisture of extinction; fuel moisture; "Midflame wind speed";
"Slope steepness".

Of these, keyless public sources supply a fuel-model code (LANDFIRE), 100-hour and 1,000-hour dead
fuel moisture (gridMET) and a 10 m wind on a 4-km grid interpolated from a 32-km analysis. **One-hour
and ten-hour dead fuel moisture, live fuel moisture, the reduction from 10 m wind to midflame wind,
and slope were not obtained from any verified source.**

More fundamentally, the model's own documentation excludes the processes that drove these three fires:

- "The model is for fire burning upslope with the wind through uniform fuel." (Andrews 2018, p. 1)
- "The model is not applicable to crown fire in overstory trees, smoldering ground fire, or
  post-frontal combustion" (Andrews 2018, p. 2)
- "Contributions to the spread of the fire by firebrands have not been included." and "the model has
  been designed to simulate a fire that has stabilized into a quasi-steady spread condition"
  (Rothermel 1972, preface)
- "High spread rates are likely a result of short range spotting and rolling debris, violating the
  model's simplifying assumptions." (Andrews 2018, p. 26)

The fires here were not steady fires in uniform fuel. The Marshall Fire "spread rapidly in cured
grass fuels (dry grass materials) with relative humidity around 20% and winds up to 100 mph" (Boulder
County after-action report); the Smokehouse Creek Fire "advanced 95 miles, stretching into Oklahoma"
(Texas House report). No numeric accuracy statement for the model was found in either document. A spread simulation here would have unverified inputs, a
model outside its stated domain, and no validation. So none is offered: the hazard list in the app
shows "Wildfire spread simulation · not offered (no validated model)", and the model card explains why.

## 6. What is and is not claimed

| Statement | Class | Basis |
|---|---|---|
| Where the fire was mapped and where satellites saw fire | OBSERVED | NIFC, NASA FIRMS |
| Which assets were inside or near the perimeter | MODELED | Geometry on published layers, distance chosen by the user |
| Cause, structures destroyed, losses | HISTORICAL | Only where an official document says so, quoted |
| Outage, damage to a named asset, price, company or portfolio effect | RESEARCH HYPOTHESIS | Not quantified; "Cannot be estimated" |

## 7. Data gaps and research needs

1. **Cause of the Camp Fire** and CAL FIRE's fatality figure: sources refuse automated requests; a
   person can open them and save the pages so the quotes can be checked and added.
2. **Marshall Fire cause findings** by local authorities (June 2023): not retrieved from a primary source.
3. **Dated perimeters** exist only for the Camp Fire. For 2020 onward the operational archive holds
   placeholder and sketch records (Smokehouse Creek jumps from a 100,000-acre hand sketch to 1.1
   million acres between two records).
4. **Sub-daily timeline.** NOAA's Hazard Mapping System carries GOES detections every few minutes
   (328 points at 130 distinct times for the Marshall Fire). It is keyless but was not integrated.
5. **Transmission lines:** no authoritative public layer with clear redistribution terms was found
   (HIFLD Open has been retired). Lines are not drawn; only lengths inside the perimeter are stored.
   Substations: no authoritative public layer found.
6. **Asset layers are current, not historical.** Plants and lines are those listed today.
7. **Observed damage to energy infrastructure** was not found in any retrieved document, for any of
   the three fires.
8. **Structures and population:** building footprints are present-day (2024 imagery); CAL FIRE DINS
   per-structure records have no stated open licence, so only the count is used.
9. **Utilities are not in the ticker table**, so company and portfolio exposure is not computed.
10. **Three fires, one country.** Fires outside the United States need FIRMS country files and
    national perimeter sources that were not tested.
11. **Fuel and terrain inputs** for any future spread work: LANDFIRE fuel models answer keyless point
    queries; slope needs a DEM; live and fine dead fuel moisture need the National Fuel Moisture
    Database or weather-station data. None would remove the need for validation against observed
    progression, for which only the Camp Fire's 28 perimeters are in hand.

## 8. In the application

Simulator → Disaster type → "Wildfire · observed record, three U.S. fires".

- Globe: final perimeter (dashed), the perimeter mapped by the time on the timeline (Camp), satellite
  detections coloured by age (last 12 hours, 12 to 48 hours, older; grey for other fires), the origin
  on the record, power plants and gas pipelines.
- Left panel: fire selector, size on the record, detections and mapped perimeter at the current time,
  the distance control and what it lists.
- Right panel: facts with quotes and sources; conditions at the origin; the agreement table; known
  gaps; the economic network; limits and data.
- Tests: 16 unit tests (`src/sim/wildfire.test.ts`), 6 browser tests (`tests/e2e/wildfire.spec.ts`).

## 9. Reproduce

```bash
research/venv/Scripts/python -I research/scripts/build_wildfires.py   # about 300 MB of keyless downloads on first run, cached
node research/scripts/run_wildfire_checks.mjs
npx vitest run src/sim/wildfire.test.ts
```

## References

- Abatzoglou, J. T., 2013: Development of gridded surface meteorological data for ecological applications and modelling. Int. J. Climatol., 33, 121-131.
- Andrews, P. L., 2018: The Rothermel surface fire spread model and associated developments: a comprehensive explanation. USDA Forest Service Gen. Tech. Rep. RMRS-GTR-371. https://www.fs.usda.gov/rm/pubs_series/rmrs/gtr/rmrs_gtr371.pdf
- Rothermel, R. C., 1972: A mathematical model for predicting fire spread in wildland fuels. USDA Forest Service Res. Pap. INT-115. https://www.fs.usda.gov/rm/pubs_int/int_rp115.pdf
- NASA FIRMS: Frequently asked questions. https://www.earthdata.nasa.gov/data/tools/firms/faq
- Texas House of Representatives, 2024: Investigative Committee on the Panhandle Wildfires, report. https://www.house.texas.gov/pdfs/committees/reports/interim/88interim/House-Interim-Committee-on-The-Panhandle-Wildfires-Report.pdf
- Boulder County: Marshall Fire Operational After-Action Report. https://assets.bouldercounty.gov/wp-content/uploads/2025/03/marshall-fire-operational-after-action-report-003.pdf
