/**
 * R-CLIPER hindcast: the published operational rainfall baseline (src/sim/rcliper.ts) run along the
 * NHC best track of Hurricane Harvey with the observed maximum winds, against the observed Stage IV
 * rainfall at every refinery and port of the rainfall record. Writes research/rcliper_hindcast_results.json.
 *
 * Both totals cover the same window (1200 UTC 23 August to 1200 UTC 2 September 2017). Nothing is
 * fitted. Run from the project root: node research/scripts/run_rcliper_hindcast.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const server = await createServer({ root: ROOT, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const rc = await server.ssrLoadModule("/src/sim/rcliper.ts");
  const hc = await server.ssrLoadModule("/src/sim/hindcast.ts");
  const rf = await server.ssrLoadModule("/src/sim/rainfall.ts");
  const rr = await server.ssrLoadModule("/src/sim/rainRecord.ts");

  const storm = read("public/data/hindcast/best_tracks.json").storms.find((s) => s.id === "AL092017");
  const rain = read("public/data/rainfall/harvey_2017_assets.json");
  const grid = read("public/data/rainfall/harvey_2017_grid.json");
  const fleet = new Map(read("public/data/hindcast/refineries_2017.json").facilities.map((f) => [f.id, f]));
  const cur = new Map(read("public/data/infrastructure/refineries.json").facilities.map((f) => [f.id, f]));
  const ports = new Map(read("public/data/infrastructure/ports.json").ports.map((f) => [f.id, f]));

  const w = rr.recordWindow(rain.meta.days);
  const t0 = w.startMs;
  const t1 = w.startMs + w.hours * 3_600_000;
  const track = hc
    .interpolateTrack(storm, rc.RCLIPER_STEP_H)
    .filter((p) => p.timeMs >= t0 && p.timeMs <= t1)
    .map((p) => ({ tH: (p.timeMs - t0) / 3_600_000, lat: p.lat, lon: p.lon, vmaxKt: p.vmaxKt }));

  const sites = rain.assets.map((a) => {
    const meta = fleet.get(a.id) ?? cur.get(a.id) ?? ports.get(a.id);
    const observedMm = rf.total(a.stage4.dailyMm);
    const modelMm = rc.rcliperTotalMm(track, a.lat, a.lon);
    return { id: a.id, kind: a.kind, name: meta?.name ?? a.id, company: meta?.company ?? null, lat: a.lat, lon: a.lon, observedMm: Math.round(observedMm * 10) / 10, modelMm: Math.round(modelMm * 10) / 10, ratio: observedMm > 0 ? Math.round((modelMm / observedMm) * 1000) / 1000 : null };
  });

  const stats = (rows) => {
    const o = rows.map((r) => r.observedMm);
    const m = rows.map((r) => r.modelMm);
    const n = rows.length;
    const mean = (x) => x.reduce((s, v) => s + v, 0) / n;
    const mo = mean(o);
    const mm = mean(m);
    const cov = o.reduce((s, v, i) => s + (v - mo) * (m[i] - mm), 0);
    const so = Math.sqrt(o.reduce((s, v) => s + (v - mo) ** 2, 0));
    const sm = Math.sqrt(m.reduce((s, v) => s + (v - mm) ** 2, 0));
    const ratios = rows.map((r) => r.ratio).filter((x) => x !== null).sort((a, b) => a - b);
    return {
      n,
      observedMeanMm: Math.round(mo * 10) / 10,
      modelMeanMm: Math.round(mm * 10) / 10,
      modelOverObservedVolume: Math.round((mm / mo) * 1000) / 1000,
      meanErrorMm: Math.round((mm - mo) * 10) / 10,
      meanAbsoluteErrorMm: Math.round(mean(o.map((v, i) => Math.abs(m[i] - v))) * 10) / 10,
      rmsErrorMm: Math.round(Math.sqrt(mean(o.map((v, i) => (m[i] - v) ** 2))) * 10) / 10,
      pearsonR: so > 0 && sm > 0 ? Math.round((cov / (so * sm)) * 1000) / 1000 : null,
      medianRatio: ratios.length ? ratios[Math.floor(ratios.length / 2)] : null,
      observedMaxMm: Math.max(...o),
      modelMaxMm: Math.max(...m),
    };
  };

  // The whole rainfall field on the 0.05 degree display grid (land and sea cells with data).
  const g = grid.grid;
  const obsField = rf.accumulate(grid, grid.days.length - 1);
  const cells = [];
  for (let j = 0; j < g.ny; j += 2)
    for (let i = 0; i < g.nx; i += 2) {
      const v = obsField[j * g.nx + i];
      if (!Number.isFinite(v)) continue;
      const lat = g.south + (j + 0.5) * g.step;
      const lon = g.west + (i + 0.5) * g.step;
      cells.push({ observedMm: v, modelMm: rc.rcliperTotalMm(track, lat, lon), ratio: v > 0 ? rc.rcliperTotalMm(track, lat, lon) / v : null });
    }
  const wet = sites.filter((s) => s.observedMm >= 750);
  const refs = sites.filter((s) => s.kind === "refinery");

  const out = {
    generatedAt: new Date().toISOString(),
    generatedBy: "research/scripts/run_rcliper_hindcast.mjs",
    model: { name: rc.RCLIPER_CARD.name, constants: rc.RCLIPER_NHC, stepHours: rc.RCLIPER_STEP_H, maxRadiusKm: rc.RCLIPER_MAX_RADIUS_KM, source: rc.RCLIPER_CARD.references[0] },
    window: { startUtc: new Date(t0).toISOString(), endUtc: new Date(t1).toISOString(), trackSamples: track.length },
    allSites: stats(sites),
    refineries: stats(refs),
    sitesWithAtLeast750mmObserved: stats(wet),
    gridCellsEverySecondCell: stats(cells),
    sites: sites.sort((a, b) => b.observedMm - a.observedMm),
  };
  writeFileSync(resolve(ROOT, "research/rcliper_hindcast_results.json"), JSON.stringify(out, null, 1));
  console.log("track samples", track.length, "window", out.window.startUtc, "->", out.window.endUtc);
  for (const k of ["allSites", "refineries", "sitesWithAtLeast750mmObserved", "gridCellsEverySecondCell"]) console.log(k.padEnd(32), JSON.stringify(out[k]));
  for (const s of out.sites.slice(0, 16)) console.log(`  ${s.name.slice(0, 26).padEnd(26)} obs ${String(s.observedMm).padStart(7)} model ${String(s.modelMm).padStart(6)} ratio ${s.ratio}`);
  console.log("  ...");
  for (const s of out.sites.filter((x) => /CORPUS|Corpus/.test(x.name)).slice(0, 4)) console.log(`  ${s.name.slice(0, 26).padEnd(26)} obs ${String(s.observedMm).padStart(7)} model ${String(s.modelMm).padStart(6)} ratio ${s.ratio}`);
} finally {
  await server.close();
}
