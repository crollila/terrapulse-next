import { useEffect, useRef } from "react";
import { Map as MlMap, NavigationControl, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";
import { useStore, type LayerId, type Selection } from "../state/store";
import { getScenario } from "../state/derived";
import { LAYERS, gibsTileUrl } from "../data/layers";
import { listingFor } from "../data/companies";
import { loadCatalog, loadOverview, verdictColor } from "../data/trends";
import { T_END_H, T_START_H, stormCenter, swathPolygon, timelineState, windAtKt, windRings, TS_FORCE_KT } from "../sim/hurricane";
import { EARTH_RADIUS_KM, destination, greatCircle, haversineKm } from "../sim/geo";
import type { HazardEvent } from "../data/types";
import { useRainfallLayers } from "./globe/rainfallLayers";

// The worker is served untouched from public/vendor (copied by scripts/copy-map-worker.mjs).
setWorkerUrl(new URL(`${import.meta.env.BASE_URL}vendor/maplibre-gl-worker.mjs`, document.baseURI).href);

const OCEAN = "#3d8bfd";
const LAND = "#f2f6fc";
const FONT = ["Noto Sans Regular"];
const FONT_BOLD = ["Noto Sans Bold"];

type FC = GeoJSON.FeatureCollection;
const fc = (features: GeoJSON.Feature[] = []): FC => ({ type: "FeatureCollection", features });

function graticule(): FC {
  const feats: GeoJSON.Feature[] = [];
  for (let lon = -180; lon < 180; lon += 15) {
    const c: [number, number][] = [];
    for (let lat = -85; lat <= 85; lat += 5) c.push([lon, lat]);
    feats.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } });
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const c: [number, number][] = [];
    for (let lon = -180; lon <= 180; lon += 5) c.push([lon, lat]);
    feats.push({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } });
  }
  return fc(feats);
}

const landFC = feature(world as any, (world as any).objects.countries) as unknown as FC;

function baseStyle(): StyleSpecification {
  const nameField: any = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
  return {
    version: 8,
    projection: { type: "globe" },
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.9, 5, 0.6, 7, 0] } as any,
    sources: {
      land: { type: "geojson", data: landFC },
      graticule: { type: "geojson", data: graticule() },
      ofm: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' },
      regions: { type: "geojson", data: fc() },
      hazards: { type: "geojson", data: fc() },
      refineries: { type: "geojson", data: fc() },
      ports: { type: "geojson", data: fc() },
      "sim-swath": { type: "geojson", data: fc() },
      "sim-rings": { type: "geojson", data: fc() },
      "sim-track": { type: "geojson", data: fc() },
      "sim-center": { type: "geojson", data: fc() },
      arcs: { type: "geojson", data: fc() },
      highlight: { type: "geojson", data: fc() },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": OCEAN } },
      { id: "land-fill", type: "fill", source: "land", paint: { "fill-color": LAND, "fill-antialias": true } },
      { id: "ofm-water", type: "fill", source: "ofm", "source-layer": "water", layout: { visibility: "none" }, paint: { "fill-color": OCEAN } },
      { id: "graticule", type: "line", source: "graticule", paint: { "line-color": "#ffffff", "line-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.22, 4, 0.1, 6, 0], "line-width": 0.6 } },
      { id: "land-line", type: "line", source: "land", maxzoom: 4, paint: { "line-color": "#8fbaf5", "line-width": 0.6, "line-opacity": 0.8 } },
      { id: "overlay-anchor", type: "background", paint: { "background-opacity": 0 } },
      { id: "ofm-boundary", type: "line", source: "ofm", "source-layer": "boundary", minzoom: 3, filter: ["all", ["<=", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]], paint: { "line-color": "#6f9fe6", "line-opacity": 0.55, "line-width": ["case", ["<=", ["get", "admin_level"], 2], 1, 0.5] } },
      { id: "ofm-roads", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 6, filter: ["match", ["get", "class"], ["motorway", "trunk", "primary"], true, false], paint: { "line-color": "#c9d6e8", "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 10, 1.6] } },

      { id: "regions-fill", type: "fill", source: "regions", paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["boolean", ["get", "selected"], false], 0.34, 0.16] } },
      { id: "regions-line", type: "line", source: "regions", paint: { "line-color": ["get", "color"], "line-width": ["case", ["boolean", ["get", "selected"], false], 2.6, 1.4] } },

      { id: "sim-swath", type: "fill", source: "sim-swath", paint: { "fill-color": ["get", "color"], "fill-opacity": ["get", "opacity"] } },
      { id: "sim-track", type: "line", source: "sim-track", paint: { "line-color": "#0b2a5b", "line-opacity": ["get", "opacity"], "line-width": 1.6, "line-dasharray": [2, 2] } },
      { id: "sim-rings", type: "line", source: "sim-rings", paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 0.9 } },
      { id: "arcs", type: "line", source: "arcs", layout: { "line-cap": "round" }, paint: { "line-color": "#00a3c4", "line-width": 2.2, "line-opacity": 0.85, "line-dasharray": [0.2, 1.8] } },

      { id: "ports", type: "circle", source: "ports", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "color"], "circle-opacity": 0.85, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1 } },
      { id: "refineries", type: "circle", source: "refineries", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "color"], "circle-opacity": 0.9, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.2 } },
      { id: "hazards-halo", type: "circle", source: "hazards", paint: { "circle-radius": ["*", ["get", "r"], 2.1], "circle-color": ["get", "color"], "circle-opacity": 0.16 } },
      { id: "hazards", type: "circle", source: "hazards", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "color"], "circle-opacity": 0.92, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.2 } },
      { id: "sim-center", type: "circle", source: "sim-center", paint: { "circle-radius": 7, "circle-color": "#ffffff", "circle-stroke-color": "#e5484d", "circle-stroke-width": 3 } },
      { id: "highlight", type: "circle", source: "highlight", paint: { "circle-radius": ["get", "r"], "circle-color": "rgba(29,107,255,0.10)", "circle-stroke-color": ["get", "color"], "circle-stroke-width": 2.5 } },

      { id: "ofm-country", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 1.6, maxzoom: 6, filter: ["==", ["get", "class"], "country"], layout: { "text-field": nameField, "text-font": FONT_BOLD, "text-size": ["interpolate", ["linear"], ["zoom"], 2, 10, 5, 14], "text-max-width": 7, "text-transform": "uppercase", "text-letter-spacing": 0.08 }, paint: { "text-color": "#33507a", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.4 } },
      { id: "ofm-state", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 4, maxzoom: 8, filter: ["==", ["get", "class"], "state"], layout: { "text-field": nameField, "text-font": FONT, "text-size": 11, "text-transform": "uppercase", "text-letter-spacing": 0.1 }, paint: { "text-color": "#5f7699", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.2 } },
      { id: "ofm-city", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 4.5, filter: ["match", ["get", "class"], ["city", "town"], true, false], layout: { "text-field": nameField, "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 5, 11, 10, 15], "symbol-sort-key": ["get", "rank"] }, paint: { "text-color": "#1b2a44", "text-halo-color": "rgba(255,255,255,0.92)", "text-halo-width": 1.4 } },
      { id: "regions-label", type: "symbol", source: "regions", layout: { "text-field": ["get", "label"], "text-font": FONT_BOLD, "text-size": 11, "text-anchor": "top", "text-offset": [0, 0.3], "text-allow-overlap": false }, paint: { "text-color": "#0b2a5b", "text-halo-color": "rgba(255,255,255,0.95)", "text-halo-width": 1.5 } },
      { id: "asset-label", type: "symbol", source: "refineries", minzoom: 6.2, layout: { "text-field": ["get", "label"], "text-font": FONT, "text-size": 10.5, "text-anchor": "left", "text-offset": [0.9, 0], "text-optional": true }, paint: { "text-color": "#0b2a5b", "text-halo-color": "rgba(255,255,255,0.95)", "text-halo-width": 1.4 } },
    ],
  } as StyleSpecification;
}

const HAZARD_COLOR: Record<HazardEvent["kind"], string> = {
  earthquake: "#e5484d",
  wildfire: "#f76808",
  severeStorm: "#6e56cf",
  volcano: "#b42318",
  flood: "#0b7fd6",
  drought: "#b7791f",
  seaLakeIce: "#0091a7",
  other: "#5b6b82",
};

const hazardLayer = (k: HazardEvent["kind"]): LayerId => (k === "earthquake" ? "earthquakes" : k === "wildfire" ? "wildfires" : k === "severeStorm" ? "storms" : "otherEvents");

const HOUSTON = { lat: 29.76, lon: -95.37 };
const NY_HARBOR = { lat: 40.66, lon: -74.05 };

const INTERACTIVE = ["hazards", "refineries", "ports", "regions-fill"];

export function Globe() {
  const el = useRef<HTMLDivElement>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const regionsRef = useRef<{ catalog: Awaited<ReturnType<typeof loadCatalog>> | null }>({ catalog: null });

  // ---- create the map once ----
  useEffect(() => {
    if (!el.current) return;
    let map: MlMap;
    try {
      map = new MlMap({
        container: el.current,
        center: [-52, 24],
        zoom: 1.55,
        minZoom: 0.6,
        maxZoom: 13,
        attributionControl: { compact: true },
        dragRotate: true,
        maxPitch: 60,
        fadeDuration: 150,
      } as any);
    } catch (err) {
      useStore.getState().setMapError((err as Error).message || "WebGL is not available");
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), "bottom-right");

    let ofmOk = false;
    (window as any).__tpMap = map;
    map.on("error", (e: any) => {
      // Tile and glyph failures are tolerated: the bundled land layer keeps the globe usable.
      console.warn("[map]", e?.error?.message ?? e?.message ?? e, e?.sourceId ?? "");
      if (!readyRef.current && e?.error?.message && /webgl/i.test(e.error.message)) useStore.getState().setMapError(e.error.message);
    });
    map.on("sourcedata", (e: any) => {
      if (ofmOk || e.sourceId !== "ofm" || !e.isSourceLoaded || !map.getLayer("ofm-water")) return;
      if (!map.querySourceFeatures("ofm", { sourceLayer: "water" }).length) return;
      ofmOk = true;
      // Detailed mode: vector water over a land-coloured sphere gives accurate coastlines at every zoom.
      map.setPaintProperty("bg", "background-color", LAND);
      map.setLayoutProperty("ofm-water", "visibility", "visible");
      map.setLayoutProperty("land-fill", "visibility", "none");
    });

    (window as any).__tpStyle = baseStyle;
    map.setStyle(baseStyle());

    const updateHalo = () => {
      const h = haloRef.current;
      if (!h) return;
      const z = map.getZoom();
      const c = map.getCenter();
      const p = map.project(c);
      // Screen radius measured from the map itself: a point 80 degrees of arc from the centre sits at R * sin(80 deg).
      const q80 = destination(c.lat, c.lng, 90, (80 * Math.PI * EARTH_RADIUS_KM) / 180);
      const q = map.project([q80.lon, q80.lat]);
      const r = Math.hypot(q.x - p.x, q.y - p.y) / Math.sin((80 * Math.PI) / 180);
      const size = r * 2 * 1.22;
      h.style.width = h.style.height = `${size}px`;
      h.style.transform = `translate(${p.x - size / 2}px, ${p.y - size / 2}px)`;
      h.style.opacity = String(Math.max(0, Math.min(1, (5.2 - z) / 1.5)));
    };
    map.on("move", updateHalo);
    map.on("resize", updateHalo);

    map.on("load", () => {
      readyRef.current = true;
      useStore.getState().setMapReady(true);
      updateHalo();
    });

    map.on("click", (e) => {
      const st = useStore.getState();
      if (st.pickingLandfall && st.tab === "sim") {
        st.setSim({ landfallLat: Math.max(-60, Math.min(60, +e.lngLat.lat.toFixed(3))), landfallLon: +e.lngLat.wrap().lng.toFixed(3) });
        st.setPickingLandfall(false);
        return;
      }
      const layers = INTERACTIVE.filter((id) => map.getLayer(id));
      const hits = map.queryRenderedFeatures([[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]], { layers });
      const order = ["hazards", "refineries", "ports", "regions-fill"];
      hits.sort((a, b) => order.indexOf(a.layer.id) - order.indexOf(b.layer.id));
      const f = hits[0];
      if (!f) {
        st.select(null);
        return;
      }
      const id = String(f.properties?.id);
      const type: Selection["type"] = f.layer.id === "hazards" ? "hazard" : f.layer.id === "refineries" ? "refinery" : f.layer.id === "ports" ? "port" : "region";
      if (type === "region" && st.tab === "sim") {
        if (st.hazard === "drought") st.setDrought({ regionId: id });
        return;
      }
      st.select({ type, id });
      if (type === "region") {
        st.setTrend({ regionId: id });
        st.setTrendOpen(true);
      }
    });
    for (const id of INTERACTIVE) {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = useStore.getState().pickingLandfall ? "crosshair" : ""));
    }

    // gentle idle rotation on the world view
    let last = performance.now();
    let idleSince = performance.now();
    let raf = 0;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const touch = () => (idleSince = performance.now());
    for (const ev of ["mousedown", "touchstart", "wheel", "dragstart", "zoomstart", "pitchstart"]) map.on(ev as any, touch);
    const spin = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const st = useStore.getState();
      if (!reduce && readyRef.current && st.tab === "world" && !st.selection && !st.trendOpen && map.getZoom() < 2.6 && now - idleSince > 4000 && !map.isMoving() && !document.hidden) {
        const c = map.getCenter();
        map.jumpTo({ center: [c.lng + dt * 3, c.lat] });
      }
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);

    loadCatalog().then((c) => {
      regionsRef.current.catalog = c;
      useStore.setState({}); // trigger the data effects once the catalogue is in
    }, () => undefined);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  const mapReady = useStore((s) => s.mapReady);
  const tab = useStore((s) => s.tab);
  const layers = useStore((s) => s.layers);
  const feeds = useStore((s) => s.feeds);
  const refineries = useStore((s) => s.refineries);
  const ports = useStore((s) => s.ports);
  const selection = useStore((s) => s.selection);
  const trend = useStore((s) => s.trend);
  const sim = useStore((s) => s.sim);
  const simPos = useStore((s) => s.simPos);
  const simStarted = useStore((s) => s.simStarted);
  const camera = useStore((s) => s.camera);
  const picking = useStore((s) => s.pickingLandfall);
  const hazard = useStore((s) => s.hazard);
  const droughtRegion = useStore((s) => s.drought.regionId);
  const caseId = useStore((s) => s.caseId);

  const setData = (id: string, data: FC) => (mapRef.current?.getSource(id) as GeoJSONSource | undefined)?.setData(data);

  // ---- observed rainfall record (its own sources and layers) ----
  useRainfallLayers(mapRef, mapReady);

  // ---- NASA GIBS raster overlays ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    for (const def of LAYERS) {
      if (!def.gibs) continue;
      const lid = `gibs-${def.id}`;
      const on = layers[def.id];
      if (on && !map.getLayer(lid)) {
        if (!map.getSource(lid)) map.addSource(lid, { type: "raster", tiles: [gibsTileUrl(def.gibs)], tileSize: 256, maxzoom: def.gibs.maxzoom, attribution: "Imagery: NASA GIBS" });
        map.addLayer({ id: lid, type: "raster", source: lid, paint: { "raster-opacity": def.gibs.opacity, "raster-fade-duration": 200 } }, "overlay-anchor");
      } else if (!on && map.getLayer(lid)) {
        map.removeLayer(lid);
      }
    }
  }, [mapReady, layers]);

  // ---- hazards ----
  useEffect(() => {
    if (!mapReady) return;
    // The trends view shows only the study regions, so the science is not competing with live events.
    const evs = tab === "trends" ? [] : [...(feeds.usgs?.events ?? []), ...(feeds.eonet?.events ?? [])].filter((e) => layers[hazardLayer(e.kind)]);
    setData(
      "hazards",
      fc(
        evs.map((e) => ({
          type: "Feature",
          properties: { id: e.id, color: HAZARD_COLOR[e.kind], r: e.kind === "earthquake" && e.magnitude ? 3 + (e.magnitude - 4.5) * 3.2 : 5.5 },
          geometry: { type: "Point", coordinates: [e.lon, e.lat] },
        })),
      ),
    );
  }, [mapReady, feeds, layers, tab]);

  // ---- trend regions ----
  useEffect(() => {
    if (!mapReady) return;
    const cat = regionsRef.current.catalog;
    const droughtView = tab === "sim" && hazard === "drought";
    if (droughtView && cat) {
      setData(
        "regions",
        fc(
          cat.regions.map((r) => {
            const [w, s, e, n] = r.bbox;
            const on = r.id === droughtRegion;
            return { type: "Feature", properties: { id: r.id, label: r.short_name, color: on ? "#d9541e" : "#8b97a8", selected: on }, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
          }),
        ),
      );
      return;
    }
    const trendsView = tab === "trends";
    if (!cat || !(trendsView || (layers.trendRegions && tab === "world"))) {
      setData("regions", fc());
      return;
    }
    let live = true;
    loadOverview(trend.variableId).then((ov) => {
      if (!live) return;
      setData(
        "regions",
        fc(
          cat.regions.map((r) => {
            const [w, s, e, n] = r.bbox;
            const o = ov.regions.find((x) => x.region === r.id);
            return {
              type: "Feature",
              properties: { id: r.id, label: r.short_name, color: verdictColor(o), selected: trendsView ? r.id === trend.regionId : selection?.type === "region" && selection.id === r.id },
              geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
            };
          }),
        ),
      );
    }, () => undefined);
    return () => {
      live = false;
    };
  }, [mapReady, layers.trendRegions, trend.variableId, trend.regionId, selection, tab, feeds, hazard, droughtRegion]);

  // ---- infrastructure + simulation ----
  useEffect(() => {
    if (!mapReady) return;
    const simOn = tab === "sim" && hazard === "hurricane";
    const sc = simOn && refineries.length ? getScenario(sim, refineries, ports) : null;
    const tl = sc ? timelineState(simPos, sc.result) : null;
    const t = tl ? tl.drawTH : T_START_H;
    const active = !!sc && (simStarted || simPos > 0);
    const expR = new Map(sc?.result.refineries.map((r) => [r.id, r]));
    const expP = new Map(sc?.result.ports.map((p) => [p.id, p]));
    const stateColor = (ex: { tOnset34H: number | null; tOnsetThresholdH: number | null } | undefined, base: string) => {
      if (!active || !ex) return base;
      if (ex.tOnsetThresholdH !== null && t >= ex.tOnsetThresholdH) return "#e5484d";
      if (ex.tOnset34H !== null && t >= ex.tOnset34H) return "#f5a524";
      return base;
    };

    setData(
      "refineries",
      fc(
        (layers.refineries && tab !== "trends" ? refineries : [])
          .filter((r) => !layers.listedOnly || listingFor(r.corporation)?.ticker)
          .map((r) => {
            const l = listingFor(r.corporation);
            return {
              type: "Feature",
              properties: {
                id: r.id,
                r: 3.5 + Math.sqrt((r.capacityBpd ?? 0) / 650_000) * 9,
                color: stateColor(expR.get(r.id), "#0b4fd6"),
                label: layers.listedOnly && l?.ticker ? `${l.ticker}` : r.name.charAt(0) + r.name.slice(1).toLowerCase(),
              },
              geometry: { type: "Point", coordinates: [r.lon, r.lat] },
            };
          }),
      ),
    );
    setData(
      "ports",
      fc(
        (layers.ports && tab !== "trends" ? ports : []).map((p) => ({
          type: "Feature",
          properties: { id: p.id, r: 2.5 + Math.sqrt((p.totalTons ?? 0) / 310e6) * 8, color: stateColor(expP.get(p.id), "#0091a7") },
          geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        })),
      ),
    );

    if (!sc || !tl) {
      for (const id of ["sim-swath", "sim-rings", "sim-track", "sim-center", "arcs"]) setData(id, fc());
      return;
    }
    const p = sc.result.params;
    const track = (a: number, b: number) => {
      const pts: [number, number][] = [];
      for (let h = a; h <= b + 1e-9; h += 3) {
        const c = stormCenter(p, h);
        pts.push([c.lon, c.lat]);
      }
      return pts;
    };
    setData("sim-track", fc([{ type: "Feature", properties: { opacity: active ? 0.75 : 0.45 }, geometry: { type: "LineString", coordinates: track(T_START_H, T_END_H) } }]));
    const c = stormCenter(p, t);
    setData("sim-center", fc([{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [c.lon, c.lat] } }]));
    const ringStyle: Record<number, { color: string; width: number }> = { 34: { color: "#f5a524", width: 1.4 }, 64: { color: "#e5484d", width: 2 }, 96: { color: "#a1151b", width: 2.2 } };
    setData(
      "sim-rings",
      fc(windRings(p, t).map((r) => ({ type: "Feature", properties: { ...ringStyle[r.thresholdKt], kt: r.thresholdKt }, geometry: { type: "LineString", coordinates: r.ring } }))),
    );
    const swaths: GeoJSON.Feature[] = [];
    if (active && t > T_START_H) {
      const r34 = sc.result.radiiKm.r34;
      const rThr = sc.result.radiiKm.threshold;
      const s34 = r34 ? swathPolygon(p, TS_FORCE_KT, T_START_H, t) : null;
      const sThr = rThr && p.exposureThresholdKt > TS_FORCE_KT ? swathPolygon(p, p.exposureThresholdKt, T_START_H, t) : null;
      if (s34) swaths.push({ type: "Feature", properties: { color: "#f5a524", opacity: 0.1 }, geometry: { type: "Polygon", coordinates: [s34] } });
      if (sThr) swaths.push({ type: "Feature", properties: { color: "#e5484d", opacity: 0.16 }, geometry: { type: "Polygon", coordinates: [sThr] } });
    }
    setData("sim-swath", fc(swaths));

    // One documented geographic link: Colonial Pipeline, Houston to New York Harbor (EIA, 11 Sep 2017).
    const houstonExposed = sc.result.refineriesInFootprint.some((r) => haversineKm(r.lat, r.lon, HOUSTON.lat, HOUSTON.lon) < 90);
    setData(
      "arcs",
      fc(
        tl.stageIndex >= 4 && houstonExposed
          ? [{ type: "Feature", properties: { id: "colonial" }, geometry: { type: "LineString", coordinates: greatCircle(HOUSTON.lat, HOUSTON.lon, NY_HARBOR.lat, NY_HARBOR.lon, 48) } }]
          : [],
      ),
    );
    void windAtKt;
  }, [mapReady, tab, hazard, layers.refineries, layers.ports, layers.listedOnly, refineries, ports, sim, simPos, simStarted]);

  // ---- selection highlight (globe <- graph and panels) ----
  useEffect(() => {
    if (!mapReady) return;
    const pts: GeoJSON.Feature[] = [];
    const ring = (lon: number, lat: number, r = 14, color = "#1d6bff") => pts.push({ type: "Feature", properties: { r, color }, geometry: { type: "Point", coordinates: [lon, lat] } });
    const findAsset = (id: string) => refineries.find((r) => r.id === id) ?? ports.find((p) => p.id === id);
    if (selection) {
      if (selection.type === "refinery" || selection.type === "port") {
        const a = findAsset(selection.id);
        if (a) ring(a.lon, a.lat, 16);
      } else if (selection.type === "hazard") {
        const h = [...(feeds.usgs?.events ?? []), ...(feeds.eonet?.events ?? [])].find((e) => e.id === selection.id);
        if (h) ring(h.lon, h.lat, 16, "#e5484d");
      } else if (selection.type === "node" && refineries.length) {
        const node = getScenario(sim, refineries, ports).graph.nodes.find((n) => n.id === selection.id);
        for (const id of [node?.assetId, ...(node?.assetIds ?? [])]) {
          const a = id ? findAsset(id) : undefined;
          if (a) ring(a.lon, a.lat, 13);
        }
      }
    }
    setData("highlight", fc(pts));
  }, [mapReady, selection, refineries, ports, feeds, sim]);

  // ---- camera ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const wide = window.innerWidth >= 1000;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (tab === "trends") return; // handled by the trends camera effect below
    const padding = tab === "sim" && wide ? { left: 340, right: 470, top: 20, bottom: 110 } : wide ? { left: 300, right: 0, top: 0, bottom: 0 } : { left: 0, right: 0, top: 0, bottom: 0 };
    if (tab === "sim" && hazard === "drought") map.easeTo({ padding, duration: 0 });
    else if (tab === "sim" && hazard === "rainfall") map.flyTo({ center: [-95.25, 29.55], zoom: wide ? 6.3 : 5.2, pitch: 0, bearing: 0, padding, duration: reduce ? 0 : 2400, essential: true });
    else if (tab === "sim") map.flyTo({ center: [sim.landfallLon + 0.4, sim.landfallLat + 0.6], zoom: wide ? 5.4 : 4.6, pitch: 0, bearing: 0, padding, duration: reduce ? 0 : 2600, essential: true });
    else map.flyTo({ center: [-52, 24], zoom: wide ? 1.75 : 0.9, pitch: 0, bearing: 0, padding, duration: reduce ? 0 : 2200, essential: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, tab, hazard]);

  // ---- trends view: glide to the selected study region; closer for a featured investigation ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || tab !== "trends") return;
    let live = true;
    loadCatalog().then((cat) => {
      if (!live) return;
      const r = cat.regions.find((x) => x.id === trend.regionId);
      if (!r) return;
      const wide = window.innerWidth >= 1000;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const [w, s, e, n] = r.bbox;
      map.flyTo({
        center: [(w + e) / 2, Math.max(-60, Math.min(60, (s + n) / 2))],
        zoom: (caseId ? 3.3 : 2.35) - (wide ? 0 : 0.9),
        pitch: 0,
        bearing: 0,
        padding: wide ? { left: 372, right: 580, top: 10, bottom: 10 } : { left: 0, right: 0, top: 0, bottom: 0 },
        duration: reduce ? 0 : 2400,
        essential: true,
      });
    }, () => undefined);
    return () => {
      live = false;
    };
  }, [mapReady, tab, trend.regionId, caseId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !camera) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    map.flyTo({ center: [camera.lon, camera.lat], zoom: camera.zoom, pitch: camera.pitch ?? 0, bearing: camera.bearing ?? 0, duration: reduce ? 0 : 2200, essential: true });
  }, [mapReady, camera]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = picking ? "crosshair" : "";
  }, [picking]);

  return (
    <div className="globe-wrap" data-testid="globe">
      <div className="globe-halo" ref={haloRef} aria-hidden="true" />
      <div className="globe-canvas" ref={el} role="application" aria-label="Interactive globe. Drag to rotate, scroll to zoom." />
    </div>
  );
}
