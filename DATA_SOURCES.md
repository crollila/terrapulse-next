# Data sources

Every dataset in the app, how it is obtained, its dates, its terms and its offline fallback.
No source needs an account, an API key or payment. Checked 15 November 2026.

## Fetched live in the browser

| Source | Endpoint | Auth | CORS | Cadence | Fallback |
|---|---|---|---|---|---|
| USGS earthquakes, M4.5+, 7 days | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson` | none | `*` | about every minute | `public/data/snapshots/earthquakes.json`, labelled CACHED |
| NASA EONET v3 open events, 20 days | `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=20` | none | `*` | curated, hours to days | `public/data/snapshots/eonet.json`, labelled CACHED |
| NASA GIBS WMTS imagery | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{layer}/default/{date}/{matrixSet}/{z}/{y}/{x}` | none | `*` | daily or static | layer simply does not draw |
| OpenFreeMap vector tiles and fonts | `https://tiles.openfreemap.org/planet` | none | `*` | weekly | bundled Natural Earth land outlines |

One request per feed per page load. Records that fail validation are dropped and counted, never
repaired. Snapshots are refreshed at build time by `npm run snapshot` and keep their real
retrieval time. GIBS layers verified (HTTP 200): `IMERG_Precipitation_Rate`,
`MODIS_Terra_Land_Surface_Temp_Day`, `GHRSST_L4_MUR_Sea_Surface_Temperature`,
`MODIS_Terra_NDVI_8Day`, `MODIS_Terra_CorrectedReflectance_TrueColor`,
`BlueMarble_ShadedRelief_Bathymetry`. `VIIRS_SNPP_Thermal_Anomalies_375m_All` returned 404 as a
raster tile and is not used. Daily imagery is requested for three days before today so the product
exists; it is labelled DELAYED, not live.

Terms: USGS and NASA data are U.S. Government works without copyright restriction (cite the
source). OpenStreetMap data are under the ODbL; attribution is shown on the map. OpenFreeMap is a
free public instance with no key; if it is unavailable the globe falls back to bundled outlines.

## Bundled static datasets

| File | Source | As of | Retrieved |
|---|---|---|---|
| `public/data/trends/**` | Original TerraPulse pipeline output: NASA MERRA-2 via NASA POWER API v2.10.0; MODIS MOD13C2 v6.1; second opinions from GISTEMP v4 and GPCP v2.3 | 1981–2025 (MERRA-2), Feb 2000 – Oct 2026 (NDVI) | 14 Nov 2026 |
| `public/data/infrastructure/refineries.json` | U.S. EIA Refinery Capacity Report, `refcap26.xlsx`; coordinates from EIA "U.S. Petroleum Refineries" map layer | capacity 1 Jan 2026; coordinates 1 Jan 2021 | 16 Nov 2026 UTC |
| `public/data/infrastructure/ports.json` | USACE Waterborne Commerce Statistics Center, via BTS NTAD "Principal Ports" | CY 2023 | 16 Nov 2026 UTC |
| `public/data/infrastructure/harvey_prices.json` | U.S. EIA petroleum history workbooks: RWTC, EER_EPMRU_PF4_RGC_DPG, EMM_EPMR_PTE_NUS_DPG, WGIRIP32, W_NA_YUP_R30_PER | 1 Jul – 30 Nov 2017 | 16 Nov 2026 UTC |
| `research/HARVEY_FACTS.md` | NHC tropical cyclone reports (Harvey, Ike); U.S. DOE Harvey event reports #8–14 and #22; EIA Today in Energy; NHC Saffir-Simpson page | 2008–2018 | 16 Nov 2026 UTC |
| `world-atlas` (npm) | Natural Earth 1:110m countries | n/a | package |

Build scripts for the infrastructure files are in `research/scripts/`. Raw downloads are not
committed.

### Caveats that matter

- **Refineries.** 124 sites. Capacity is atmospheric crude distillation in barrels per calendar
  day. The EIA Energy Atlas ArcGIS layer required a token on 15 November 2026, so the 2026 capacity
  file was joined to the 2021 coordinate file by site and company; 21 matches rest on site and
  state or on the corporation because a company name changed (flagged `coordMatch`). Six 2026 sites
  have no coordinates and are excluded (listed in the file's meta, including a 45,000 b/d site at
  Galveston). Three sites have no capacity and stay null. A refinery present in the 2021 map but
  absent from the 2026 report is not included.
- **Ports.** Positions are centroids of port polygons, so a large port can plot away from its
  main channel (Houston's centroid is at 29.86, −95.39). Tonnage is an annual total.
- **Trend data.** Region boxes are rectangles. MERRA-2 is a reanalysis. The published series are
  rounded to 3–4 decimals.
- **Harvey figures.** The DOE figure shown (3,871,449 b/d as of 30 August 2017) is the highest in
  the eight updates read; updates #1–7 and #15–21 were not read, so it is not called a peak.
- **Company listings.** Ownership comes from the EIA "corporation" field. `src/data/companies.ts`
  attaches a ticker only where that parent has a primary U.S. listing; a test checks every entry
  against the EIA file. The mapping is a maintained identifier table, not a data feed, and should
  be reviewed when the EIA report is updated.
- **Funds.** Only the index definition is used (issuer pages verified reachable). No holdings
  weights are included, so no fund-level number is computed.

## Considered and not used

- Equity prices: no free source with clear redistribution terms was verified. The app shows
  "Insufficient validated data".
- NASA FIRMS active fires: needs a MAP_KEY for the API; not used. EONET wildfire events are used.
- NHC `CurrentStorms.json`: CORS not verified; EONET severe storms are used.
- EIA API v2: needs a key; the no-key history workbooks are used instead.
- Space Apps participant offers (Microsoft, Google, Meteomatics, GoDaddy, Miro): not evaluated and
  not activated. None is needed.
