/**
 * Map layers for the observed rainfall record (Hurricane Harvey, 2017): the accumulated Stage IV
 * rainfall field, the NHC best track with its wind radii, USGS high-water marks, and each site
 * coloured by the rarity of the rainfall it has received so far. Everything drawn here is an
 * observation or simple arithmetic on observations; nothing is simulated.
 */
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Popup, type GeoJSONSource, type ImageSource, type Map as MlMap } from "maplibre-gl";
import { useStore } from "../../state/store";
import { loadHarveyRain, type HarveyRainData } from "../../data/rainfall";
import { MM_PER_INCH, RAIN_STOPS, accumulate, ariColor, ariFor, rainClass, type RainGridFile } from "../../sim/rainfall";
import { completedDays, exposuresToDate, hourlyTrack, radiiOutline, recordWindow, timeAt, trackAt } from "../../sim/rainRecord";

type FC = GeoJSON.FeatureCollection;
const fc = (features: GeoJSON.Feature[] = []): FC => ({ type: "FeatureCollection", features });

const SOURCES = ["rain-wind", "rain-track", "rain-center", "rain-hwm", "rain-sites"] as const;
const LAYERS = ["rain-field", "rain-wind-fill", "rain-wind-line", "rain-track", "rain-hwm", "rain-sites", "rain-center"] as const;

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const invMercY = (y: number) => (Math.atan(Math.sinh(y)) * 180) / Math.PI;

/**
 * Paint an accumulated field to a canvas whose rows are evenly spaced in Web Mercator, which is
 * how MapLibre stretches an image between its corners. Each canvas pixel takes the colour class of
 * the grid cell that contains it, so cells are not blended or smoothed.
 */
export function paintField(g: RainGridFile["grid"], field: Float32Array, canvas: HTMLCanvasElement): void {
  const scale = 3;
  const W = g.nx * scale;
  const H = g.ny * scale;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(W, H);
  const yN = mercY(g.north);
  const yS = mercY(g.south);
  for (let r = 0; r < H; r++) {
    const lat = invMercY(yN - ((r + 0.5) / H) * (yN - yS));
    const j = Math.min(g.ny - 1, Math.max(0, Math.floor((lat - g.south) / g.step)));
    for (let c = 0; c < W; c++) {
      const v = field[j * g.nx + Math.floor(c / scale)];
      const k = Number.isFinite(v) ? rainClass(v) : -1;
      if (k < 0) continue;
      const rgb = RAIN_STOPS[k].rgb;
      const o = (r * W + c) * 4;
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
      // Light classes are drawn fainter so the base map stays readable under widespread light rain.
      img.data[o + 3] = Math.min(255, 120 + k * 22);
    }
  }
  ctx.putImageData(img, 0, 0);
}

const hwmColor = (hFt: number | null) => (hFt === null ? "#8b97a8" : hFt >= 10 ? "#3b1fa8" : hFt >= 5 ? "#0b4fd6" : hFt >= 2 ? "#0091c7" : "#63c5e6");

function ensureLayers(map: MlMap, firstImage: string, g: RainGridFile["grid"]) {
  if (map.getSource("rain-field")) return;
  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
    [g.west, g.north],
    [g.east, g.north],
    [g.east, g.south],
    [g.west, g.south],
  ];
  map.addSource("rain-field", { type: "image", url: firstImage, coordinates });
  for (const id of SOURCES) map.addSource(id, { type: "geojson", data: fc() });
  const before = (id: string) => (map.getLayer(id) ? id : undefined);
  map.addLayer({ id: "rain-field", type: "raster", source: "rain-field", paint: { "raster-opacity": 0.8, "raster-fade-duration": 0, "raster-resampling": "nearest" } }, before("ofm-boundary"));
  map.addLayer({ id: "rain-wind-fill", type: "fill", source: "rain-wind", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.07 } }, before("ports"));
  map.addLayer({ id: "rain-wind-line", type: "line", source: "rain-wind", paint: { "line-color": ["get", "color"], "line-width": ["get", "width"], "line-opacity": 0.9 } }, before("ports"));
  map.addLayer({ id: "rain-track", type: "line", source: "rain-track", paint: { "line-color": "#0b2a5b", "line-width": 1.6, "line-opacity": ["get", "opacity"], "line-dasharray": [2, 2] } }, before("ports"));
  map.addLayer({ id: "rain-hwm", type: "circle", source: "rain-hwm", minzoom: 4.5, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.6, 8, 3.2, 11, 5.5], "circle-color": ["get", "color"], "circle-opacity": 0.85, "circle-stroke-color": "#ffffff", "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 0.2, 9, 0.9] } }, before("ports"));
  map.addLayer({ id: "rain-sites", type: "circle", source: "rain-sites", paint: { "circle-radius": ["get", "r"], "circle-color": ["get", "color"], "circle-opacity": 0.96, "circle-stroke-color": ["get", "stroke"], "circle-stroke-width": ["get", "strokeWidth"] } }, before("hazards-halo"));
  map.addLayer({ id: "rain-center", type: "circle", source: "rain-center", paint: { "circle-radius": 7, "circle-color": "#ffffff", "circle-stroke-color": "#e5484d", "circle-stroke-width": 3 } }, before("highlight"));
}

export function useRainfallLayers(mapRef: RefObject<MlMap | null>, mapReady: boolean): void {
  const active = useStore((s) => s.tab === "sim" && s.hazard === "rainfall");
  const rain = useStore((s) => s.rain);
  const refineries = useStore((s) => s.refineries);
  const ports = useStore((s) => s.ports);
  const dataRef = useRef<HarveyRainData | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const shownDays = useRef<number>(-1);
  const loaded = useStore((s) => s.rainLoaded);

  // Load the record the first time the view is opened.
  useEffect(() => {
    if (!active || dataRef.current) return;
    let live = true;
    loadHarveyRain().then(
      (d) => {
        if (!live) return;
        dataRef.current = d;
        useStore.setState({ rainLoaded: true });
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [active]);

  const derived = useMemo(() => {
    const d = dataRef.current;
    if (!d || !loaded) return null;
    return { window: recordWindow(d.assets.meta.days), track: hourlyTrack(d.track) };
  }, [loaded]);

  // High-water-mark popups.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const onClick = (e: any) => {
      if (!map.getLayer("rain-hwm")) return;
      const f = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: ["rain-hwm"] })[0];
      popupRef.current?.remove();
      if (!f) return;
      const p = f.properties as Record<string, string | number | null>;
      const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
      const h = p.hFt === null || p.hFt === undefined || p.hFt === "" ? "not recorded" : `${Number(p.hFt).toFixed(1)} ft (${(Number(p.hFt) * 0.3048).toFixed(1)} m)`;
      const html = `<div class="tp-pop"><div class="tp-pop-k">USGS high-water mark · OBSERVED</div><div class="tp-pop-v">Water reached ${esc(h)} above ground</div><div class="tp-pop-n">${esc(p.water || "Water body not named")}${p.county ? ` · ${esc(p.county)}` : ""}<br>Elevation ${p.elevFt === null || p.elevFt === "" ? "n/a" : `${Number(p.elevFt).toFixed(1)} ft ${esc(p.vdatum)}`} · ${esc(p.type)} · ${esc(p.quality)}</div></div>`;
      popupRef.current = new Popup({ closeButton: false, maxWidth: "260px", offset: 8 }).setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).setHTML(html).addTo(map);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
      popupRef.current?.remove();
    };
  }, [mapReady, mapRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const d = dataRef.current;
    if (!active || !d || !derived) {
      for (const id of LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      popupRef.current?.remove();
      return;
    }
    const g = d.grid.grid;
    const count = completedDays(derived.window, rain.hours);
    canvasRef.current ??= document.createElement("canvas");
    const repaint = shownDays.current !== count || !map.getSource("rain-field");
    if (repaint) paintField(g, accumulate(d.grid, count - 1), canvasRef.current);
    if (!map.getSource("rain-field")) ensureLayers(map, canvasRef.current.toDataURL(), g);
    else if (repaint) (map.getSource("rain-field") as ImageSource).updateImage({ url: canvasRef.current.toDataURL() });
    shownDays.current = count;
    const show = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    show("rain-field", rain.showField);
    show("rain-hwm", rain.showMarks);
    show("rain-wind-fill", rain.showWind);
    show("rain-wind-line", rain.showWind);
    show("rain-track", true);
    show("rain-center", true);
    show("rain-sites", true);
    const set = (id: string, data: FC) => (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);

    // Best track and wind radii at the current time.
    const ms = timeAt(derived.window, rain.hours);
    const tr = derived.track;
    const line = (a: number, b: number) => tr.filter((p) => p.timeMs >= a && p.timeMs <= b).map((p) => [p.lon, p.lat]);
    const past = line(tr[0].timeMs, ms);
    const future = line(ms, tr[tr.length - 1].timeMs);
    set("rain-track", fc([...(past.length > 1 ? [{ type: "Feature" as const, properties: { opacity: 0.85 }, geometry: { type: "LineString" as const, coordinates: past } }] : []), ...(future.length > 1 ? [{ type: "Feature" as const, properties: { opacity: 0.3 }, geometry: { type: "LineString" as const, coordinates: future } }] : [])]));
    const now = trackAt(tr, ms);
    set("rain-center", fc(now ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [now.lon, now.lat] } }] : []));
    const style: Record<number, { color: string; width: number }> = { 34: { color: "#f5a524", width: 1.4 }, 50: { color: "#f76808", width: 1.6 }, 64: { color: "#e5484d", width: 2 } };
    const rings: GeoJSON.Feature[] = [];
    if (now)
      for (const thr of [34, 50, 64] as const) {
        const ring = radiiOutline(now, thr);
        if (ring) rings.push({ type: "Feature", properties: { ...style[thr], kt: thr }, geometry: { type: "Polygon", coordinates: [ring] } });
      }
    set("rain-wind", fc(rings));

    // High-water marks (static; set once the layer exists).
    if (!(map as any).__tpHwmSet) {
      set("rain-hwm", fc(d.hwms.marks.map((m) => ({ type: "Feature", properties: { id: m.id, hFt: m.hFt, elevFt: m.elevFt, vdatum: m.vdatum, quality: m.quality, type: m.type, water: m.water, county: m.county, color: hwmColor(m.hFt) }, geometry: { type: "Point", coordinates: [m.lon, m.lat] } }))));
      (map as any).__tpHwmSet = true;
    }

    // Sites coloured by the rarity of the rainfall received so far.
    const ex = exposuresToDate(d.assets.assets.filter((a) => !a.fleets || a.fleets.some((f) => f !== "2017")), count);
    const pos = new Map<string, { lat: number; lon: number; r: number }>();
    for (const r of refineries) pos.set(r.id, { lat: r.lat, lon: r.lon, r: 3.5 + Math.sqrt((r.capacityBpd ?? 0) / 650_000) * 9 });
    for (const p of ports) pos.set(p.id, { lat: p.lat, lon: p.lon, r: 2.5 + Math.sqrt((p.totalTons ?? 0) / 310e6) * 8 });
    set(
      "rain-sites",
      fc(
        ex.flatMap((e) => {
          const p = pos.get(e.id);
          if (!p) return [];
          const ari = ariFor(e, rain.reading);
          const inside = ari !== null && ari >= rain.ariYears;
          return [{ type: "Feature" as const, properties: { id: e.id, r: p.r + (inside ? 1.5 : 0), color: ariColor(ari), stroke: inside ? "#0b1f3f" : "#ffffff", strokeWidth: inside ? 2.2 : 1.1, totalIn: e.totalMm === null ? null : e.totalMm / MM_PER_INCH }, geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] } }];
        }),
      ),
    );
  }, [mapReady, mapRef, active, derived, rain, refineries, ports]);
}
