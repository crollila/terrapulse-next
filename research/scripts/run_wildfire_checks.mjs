/**
 * Wildfire record checks: for each bundled fire, how well the satellite detections and the mapped
 * perimeters agree, what the proximity screen holds at each distance, and the conditions on the
 * start day. Writes research/wildfire_checks.json (the numbers quoted in research/WILDFIRE.md).
 *
 * Nothing is fitted and nothing is predicted: these are consistency checks on observations.
 * Run from the project root: node research/scripts/run_wildfire_checks.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const server = await createServer({ root: ROOT, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const wf = await server.ssrLoadModule("/src/sim/wildfire.ts");
  const index = read("public/data/wildfire/index.json");
  const out = { generatedAt: new Date().toISOString(), generatedBy: "research/scripts/run_wildfire_checks.mjs", fires: [] };
  for (const e of index.events) {
    const ev = read(`public/data/wildfire/${e.file}`);
    const w = wf.fireWindow(ev);
    const n = ev.detections.count;
    const insideFinal = ev.detections.rows.filter((r) => wf.pointInGeometry(r[2], r[1], ev.perimeter.geometry)).length;
    const day = ev.meta.start.slice(0, 10);
    const g = ev.conditions.gridmet;
    const i = g.erc ? g.erc.dates.indexOf(day) : -1;
    const fire = {
      id: ev.meta.id,
      name: ev.meta.name,
      start: ev.meta.start,
      windowHours: w.hours,
      reportedAcres: ev.perimeter.reportedAcres,
      displayedShapeAcres: Math.round(wf.areaKm2(ev.perimeter.geometry) * wf.ACRES_PER_KM2),
      displayedOverReported: Math.round((wf.areaKm2(ev.perimeter.geometry) * wf.ACRES_PER_KM2 * 1000) / ev.perimeter.reportedAcres) / 1000,
      detections: n,
      overpasses: ev.detections.overpasses.length,
      insideDisplayedFinalPerimeter: insideFinal,
      withinOnePixelOfFinalPerimeter: ev.detections.withinOnePixelOfFinalPerimeter,
      shareWithinOnePixel: Math.round((ev.detections.withinOnePixelOfFinalPerimeter / n) * 1000) / 1000,
      moreThan2kmOutside: n - ev.detections.within2kmOfFinalPerimeter,
      datedPerimeters: ev.progression.map((p) => {
        const a = wf.agreementAt(ev, p);
        return { time: p.time, acres: p.acres, method: p.method, areaOfDisplayedShapeAcres: Math.round(wf.areaKm2(p.geometry) * wf.ACRES_PER_KM2), detectionsSoFar: a.detections, insidePerimeter: a.inside, share: a.share === null ? null : Math.round(a.share * 1000) / 1000 };
      }),
      screens: wf.FIRE_BUFFERS_KM.map((km) => {
        const s = wf.fireScreen(ev, km);
        return { bufferKm: km, plants: s.plants.length, plantMw: Math.round(s.plantMw * 10) / 10, refineries: s.sites.filter((x) => x.kind === "refinery").map((x) => `${x.name} (${x.kmFromPerimeter} km)`), ports: s.sites.filter((x) => x.kind === "port").length };
      }),
      transmission: ev.infrastructure.transmission,
      gasPipelineKmInside: Math.round(ev.infrastructure.gasPipelineSummary.reduce((s, x) => s + x.kmInside, 0) * 10) / 10,
      conditionsOnStartDay: i >= 0 ? Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.values[i]])) : null,
      drought: ev.conditions.drought,
      facts: ev.facts.length,
      gaps: ev.meta.gaps,
    };
    out.fires.push(fire);
    console.log(`${fire.name}: ${n} detections in ${fire.overpasses} overpasses over ${w.hours} h; ${(fire.shareWithinOnePixel * 100).toFixed(1)}% within one pixel; ${fire.insideDisplayedFinalPerimeter} strictly inside; displayed/reported area ${fire.displayedOverReported}`);
    for (const p of fire.datedPerimeters) console.log(`   ${p.time} ${String(p.acres).padStart(9)} ac (${String(p.areaOfDisplayedShapeAcres).padStart(7)} drawn) ${String(p.method).padEnd(14)} det ${String(p.detectionsSoFar).padStart(5)} inside ${String(p.insidePerimeter).padStart(5)} = ${p.share}`);
    for (const s of fire.screens) console.log(`   buffer ${String(s.bufferKm).padStart(2)} km: ${s.plants} plants, ${s.plantMw} MW; refineries ${JSON.stringify(s.refineries)}; ports ${s.ports}`);
    console.log("   start day:", JSON.stringify(fire.conditionsOnStartDay));
  }
  writeFileSync(resolve(ROOT, "research/wildfire_checks.json"), JSON.stringify(out, null, 1));
} finally {
  await server.close();
}
