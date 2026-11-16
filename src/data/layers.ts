import type { LayerId } from "../state/store";
import type { EvidenceClass } from "./types";

export interface LayerDef {
  id: LayerId;
  label: string;
  category: "Natural hazards" | "Environmental intelligence" | "Economic infrastructure" | "Financial exposure";
  color: string;
  explain: string;
  evidence: EvidenceClass;
  /** NASA GIBS raster overlay definition, when the layer is imagery. */
  gibs?: { layer: string; matrixSet: string; ext: "png" | "jpg" | "jpeg"; maxzoom: number; daily: boolean; opacity: number; product: string; units?: string; lagDays: number };
  feed?: "usgs" | "eonet";
  provider: string;
  sourceUrl: string;
  cadence: string;
}

const GIBS_DOC = "https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api";

export const LAYERS: LayerDef[] = [
  { id: "earthquakes", label: "Earthquakes M4.5+", category: "Natural hazards", color: "#e5484d", explain: "Earthquakes of magnitude 4.5 or greater in the last 7 days. Circle size grows with magnitude.", evidence: "OBSERVED", feed: "usgs", provider: "U.S. Geological Survey", sourceUrl: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php", cadence: "about every minute" },
  { id: "wildfires", label: "Wildfires", category: "Natural hazards", color: "#f76808", explain: "Open wildfire events tracked by NASA EONET (mostly U.S. incident reports from IRWIN). Not a satellite hot-spot map.", evidence: "OBSERVED", feed: "eonet", provider: "NASA EONET v3", sourceUrl: "https://eonet.gsfc.nasa.gov/", cadence: "curated, hours to days" },
  { id: "storms", label: "Severe storms", category: "Natural hazards", color: "#6e56cf", explain: "Open tropical cyclones and severe storms tracked by NASA EONET, at their latest reported position.", evidence: "OBSERVED", feed: "eonet", provider: "NASA EONET v3", sourceUrl: "https://eonet.gsfc.nasa.gov/", cadence: "curated, hours to days" },
  { id: "otherEvents", label: "Volcanoes, ice, floods, other", category: "Natural hazards", color: "#0091a7", explain: "Other open EONET events: volcanoes, sea and lake ice (icebergs), floods, drought and dust where reported. Categories with no open event show nothing.", evidence: "OBSERVED", feed: "eonet", provider: "NASA EONET v3", sourceUrl: "https://eonet.gsfc.nasa.gov/", cadence: "curated, hours to days" },

  { id: "trendRegions", label: "Trend study regions", category: "Environmental intelligence", color: "#1d6bff", explain: "Eight region boxes with decades of NASA MERRA-2 and MODIS data. Click a box to open the trend explorer.", evidence: "OBSERVED", provider: "NASA MERRA-2 via NASA POWER; MODIS MOD13C2", sourceUrl: "https://power.larc.nasa.gov/", cadence: "static snapshot (retrieved 2026-11-14)" },
  { id: "gibsPrecip", label: "Precipitation rate (IMERG)", category: "Environmental intelligence", color: "#2b9a66", explain: "Satellite-estimated precipitation rate from NASA GPM IMERG, for one day.", evidence: "OBSERVED", gibs: { layer: "IMERG_Precipitation_Rate", matrixSet: "GoogleMapsCompatible_Level6", ext: "png", maxzoom: 6, daily: true, opacity: 0.85, product: "GPM IMERG precipitation rate", units: "mm/hr", lagDays: 3 }, provider: "NASA GIBS", sourceUrl: GIBS_DOC, cadence: "daily imagery" },
  { id: "gibsLst", label: "Land surface temperature (day)", category: "Environmental intelligence", color: "#e5484d", explain: "Daytime land surface temperature from MODIS on Terra, for one day. Gaps are cloud or no overpass.", evidence: "OBSERVED", gibs: { layer: "MODIS_Terra_Land_Surface_Temp_Day", matrixSet: "GoogleMapsCompatible_Level7", ext: "png", maxzoom: 7, daily: true, opacity: 0.8, product: "MODIS/Terra land surface temperature (day)", units: "K", lagDays: 3 }, provider: "NASA GIBS", sourceUrl: GIBS_DOC, cadence: "daily imagery" },
  { id: "gibsSst", label: "Sea surface temperature", category: "Environmental intelligence", color: "#f76808", explain: "Sea surface temperature analysis (GHRSST MUR L4), for one day. Warm water is the energy source of hurricanes.", evidence: "OBSERVED", gibs: { layer: "GHRSST_L4_MUR_Sea_Surface_Temperature", matrixSet: "GoogleMapsCompatible_Level7", ext: "png", maxzoom: 7, daily: true, opacity: 0.8, product: "GHRSST MUR L4 sea surface temperature", units: "°C", lagDays: 3 }, provider: "NASA GIBS", sourceUrl: GIBS_DOC, cadence: "daily imagery" },
  { id: "gibsNdvi", label: "Vegetation greenness (NDVI)", category: "Environmental intelligence", color: "#30a46c", explain: "MODIS/Terra 8-day NDVI composite containing the date shown.", evidence: "OBSERVED", gibs: { layer: "MODIS_Terra_NDVI_8Day", matrixSet: "GoogleMapsCompatible_Level9", ext: "png", maxzoom: 9, daily: true, opacity: 0.85, product: "MODIS/Terra NDVI, 8-day", units: "NDVI", lagDays: 3 }, provider: "NASA GIBS", sourceUrl: GIBS_DOC, cadence: "8-day composites" },
  { id: "gibsTrueColor", label: "Satellite true colour", category: "Environmental intelligence", color: "#5b6b82", explain: "MODIS/Terra corrected reflectance for one day: what the planet looked like from orbit, clouds included.", evidence: "OBSERVED", gibs: { layer: "MODIS_Terra_CorrectedReflectance_TrueColor", matrixSet: "GoogleMapsCompatible_Level9", ext: "jpg", maxzoom: 9, daily: true, opacity: 1, product: "MODIS/Terra corrected reflectance (true colour)", lagDays: 3 }, provider: "NASA GIBS", sourceUrl: GIBS_DOC, cadence: "daily imagery" },
  { id: "blueMarble", label: "Blue Marble relief", category: "Environmental intelligence", color: "#3e63dd", explain: "NASA Blue Marble shaded relief and bathymetry: a cloud-free composite base image, not a current observation.", evidence: "HISTORICAL", gibs: { layer: "BlueMarble_ShadedRelief_Bathymetry", matrixSet: "GoogleMapsCompatible_Level8", ext: "jpeg", maxzoom: 8, daily: false, opacity: 1, product: "Blue Marble shaded relief and bathymetry", lagDays: 0 }, provider: "NASA GIBS", sourceUrl: GIBS_DOC, cadence: "static composite" },

  { id: "refineries", label: "Oil refineries", category: "Economic infrastructure", color: "#0b4fd6", explain: "U.S. petroleum refineries. Circle size grows with atmospheric crude distillation capacity (barrels per calendar day).", evidence: "OBSERVED", provider: "U.S. Energy Information Administration", sourceUrl: "https://www.eia.gov/petroleum/refinerycapacity/", cadence: "annual report" },
  { id: "ports", label: "Principal ports", category: "Economic infrastructure", color: "#0091a7", explain: "The 150 principal U.S. ports by cargo tonnage. Circle size grows with total short tons handled in the year.", evidence: "OBSERVED", provider: "U.S. Army Corps of Engineers / BTS", sourceUrl: "https://www.arcgis.com/home/item.html?id=e3b6065cce144be8a13a59e03c4195fe", cadence: "annual" },

  { id: "listedOnly", label: "Only refineries of U.S.-listed owners", category: "Financial exposure", color: "#8e4ec6", explain: "Filters the refinery layer to facilities whose corporate owner (per EIA) has a U.S. exchange listing, and shows that ticker. Private and state-owned refineries are hidden.", evidence: "OBSERVED", provider: "EIA ownership; listing mapping documented in the app", sourceUrl: "https://www.eia.gov/petroleum/refinerycapacity/", cadence: "annual report" },
];

export const LAYER_BY_ID = new Map(LAYERS.map((l) => [l.id, l]));
export const CATEGORIES = ["Natural hazards", "Environmental intelligence", "Economic infrastructure", "Financial exposure"] as const;

/** Date (UTC, YYYY-MM-DD) used for daily GIBS imagery: a few days back so the product exists. */
export function gibsDate(lagDays: number, now: Date = new Date()): string {
  return new Date(now.getTime() - lagDays * 86_400_000).toISOString().slice(0, 10);
}

export function gibsTileUrl(g: NonNullable<LayerDef["gibs"]>, now: Date = new Date()): string {
  const time = g.daily ? `${gibsDate(g.lagDays, now)}/` : "";
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${g.layer}/default/${time}${g.matrixSet}/{z}/{y}/{x}.${g.ext}`;
}
