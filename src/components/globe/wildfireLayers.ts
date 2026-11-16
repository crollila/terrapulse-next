/**
 * Map layers for the wildfire record: the mapped final perimeter, the dated perimeter in force at
 * the timeline's time (where dated perimeters exist), satellite fire detections up to that time,
 * the recorded point of origin, and nearby power plants and gas pipelines. Everything drawn is an
 * observation or a published asset position; no fire spread is simulated.
 */
import { useEffect, useRef, type RefObject } from "react";
import type { GeoJSONSource, Map as MlMap } from "maplibre-gl";
import { useStore } from "../../state/store";
import { loadFire } from "../../data/wildfire";
import { detectionMs, fireTime, fireWindow, perimeterAt, type FireEvent } from "../../sim/wildfire";

type FC = GeoJSON.FeatureCollection;
const fc = (features: GeoJSON.Feature[] = []): FC => ({ type: "FeatureCollection", features });
const SOURCES = ["wf-final", "wf-now", "wf-det", "wf-origin", "wf-plants", "wf-gas"] as const;
const LAYERS = ["wf-now-fill", "wf-final-line", "wf-now-line", "wf-gas", "wf-det", "wf-plants", "wf-origin"] as const;
const HOUR_MS = 3_600_000;

function ensure(map: MlMap) {
  if (map.getSource("wf-final")) return;
  for (const id of SOURCES) map.addSource(id, { type: "geojson", data: fc() });
  const before = (id: string) => (map.getLayer(id) ? id : undefined);
  map.addLayer({ id: "wf-now-fill", type: "fill", source: "wf-now", paint: { "fill-color": "#f76808", "fill-opacity": 0.2 } }, before("ofm-boundary"));
  map.addLayer({ id: "wf-final-line", type: "line", source: "wf-final", paint: { "line-color": "#7a2e0e", "line-width": 1.4, "line-dasharray": [3, 2], "line-opacity": 0.85 } }, before("ports"));
  map.addLayer({ id: "wf-now-line", type: "line", source: "wf-now", paint: { "line-color": "#d9541e", "line-width": 2 } }, before("ports"));
  map.addLayer({ id: "wf-gas", type: "line", source: "wf-gas", paint: { "line-color": "#6941c6", "line-width": 1.6, "line-opacity": 0.8 } }, before("ports"));
  map.addLayer({ id: "wf-det", type: "circle", source: "wf-det", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.4, 8, 2.4, 11, 4.5], "circle-color": ["get", "color"], "circle-opacity": ["get", "opacity"] } }, before("ports"));
  map.addLayer({ id: "wf-plants", type: "circle", source: "wf-plants", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "color"], "circle-opacity": 0.95, "circle-stroke-color": ["get", "stroke"], "circle-stroke-width": ["get", "strokeWidth"] } }, before("hazards-halo"));
  map.addLayer({ id: "wf-origin", type: "circle", source: "wf-origin", paint: { "circle-radius": 6, "circle-color": "#ffffff", "circle-stroke-color": "#b42318", "circle-stroke-width": 3 } }, before("highlight"));
}

export function useWildfireLayers(mapRef: RefObject<MlMap | null>, mapReady: boolean): void {
  const active = useStore((s) => s.tab === "sim" && s.hazard === "wildfire");
  const fire = useStore((s) => s.fire);
  const selection = useStore((s) => s.selection);
  const evRef = useRef<FireEvent | null>(null);
  const loadedId = useStore((s) => s.fireLoadedId);
  const flown = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let live = true;
    loadFire(fire.eventId).then(
      (ev) => {
        if (!live) return;
        evRef.current = ev;
        useStore.setState({ fireLoadedId: ev.meta.id });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [active, fire.eventId]);

  // Clicking a power plant selects it (the globe's own click handler has cleared the selection first).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const onClick = (e: any) => {
      if (!map.getLayer("wf-plants") || map.getLayoutProperty("wf-plants", "visibility") === "none") return;
      const f = map.queryRenderedFeatures([[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]], { layers: ["wf-plants"] })[0];
      if (f) setTimeout(() => useStore.getState().select({ type: "plant", id: String(f.properties?.id) }), 0);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [mapReady, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ev = evRef.current;
    if (!active || !ev || ev.meta.id !== fire.eventId || loadedId !== fire.eventId) {
      for (const id of LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      if (!active) flown.current = null;
      return;
    }
    ensure(map);
    const show = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    const set = (id: string, data: FC) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
    const w = fireWindow(ev);
    const hours = fire.hours < 0 ? w.hours : fire.hours;
    const ms = fireTime(w, hours);

    if (flown.current !== ev.meta.id) {
      flown.current = ev.meta.id;
      const [bw, bs, be, bn] = ev.perimeter.bbox;
      const wide = window.innerWidth >= 1000;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      map.fitBounds([[bw, bs], [be, bn]], { padding: wide ? { left: 370, right: 500, top: 60, bottom: 170 } : 30, duration: reduce ? 0 : 2200, maxZoom: 11, essential: true });
    }

    set("wf-final", fc([{ type: "Feature", properties: {}, geometry: ev.perimeter.geometry as GeoJSON.Geometry }]));
    const now = perimeterAt(ev, ms);
    set("wf-now", fc(now ? [{ type: "Feature", properties: { time: now.time }, geometry: now.geometry as GeoJSON.Geometry }] : []));
    set("wf-origin", fc([{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [ev.meta.ignition.lon, ev.meta.ignition.lat] } }]));

    // Detections up to now: the newest twelve hours are bright, older ones fade to a dull red, and
    // detections far outside this fire's perimeter (other fires) are grey.
    const feats: GeoJSON.Feature[] = [];
    for (const r of ev.detections.rows) {
      const t = detectionMs(ev, r);
      if (t > ms) break;
      const ageH = (ms - t) / HOUR_MS;
      const other = r[7] > 2;
      feats.push({ type: "Feature", properties: { color: other ? "#8b97a8" : ageH <= 12 ? "#ffb224" : ageH <= 48 ? "#f76808" : "#b42318", opacity: other ? 0.55 : ageH <= 12 ? 0.95 : 0.6 }, geometry: { type: "Point", coordinates: [r[2], r[1]] } });
    }
    set("wf-det", fc(feats));

    const selPlant = selection?.type === "plant" ? selection.id : null;
    set(
      "wf-plants",
      fc(
        ev.infrastructure.powerPlants.map((p) => {
          const near = p.kmFromPerimeter <= fire.bufferKm;
          return {
            type: "Feature" as const,
            properties: { id: p.id, r: 3.2 + Math.sqrt(Math.min(2000, p.capacityMw ?? 0) / 2000) * 9 + (p.id === selPlant ? 2 : 0), color: near ? "#6941c6" : "#b9c6d8", stroke: p.id === selPlant ? "#0b1f3f" : "#ffffff", strokeWidth: p.id === selPlant ? 2.4 : 1 },
            geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] },
          };
        }),
      ),
    );
    set("wf-gas", fc(ev.infrastructure.gasPipelines.map((g) => ({ type: "Feature" as const, properties: {}, geometry: g.geometry as GeoJSON.Geometry }))));

    show("wf-final-line", fire.showPerimeters);
    show("wf-now-fill", fire.showPerimeters);
    show("wf-now-line", fire.showPerimeters);
    show("wf-det", fire.showDetections);
    show("wf-plants", fire.showInfra);
    show("wf-gas", fire.showInfra);
    show("wf-origin", true);
  }, [mapReady, mapRef, active, fire, loadedId, selection]);
}
