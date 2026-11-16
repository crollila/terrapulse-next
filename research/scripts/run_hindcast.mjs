/**
 * Hindcast runner: evaluates src/sim/hindcast.ts on the bundled best tracks and the EIA refinery
 * file and writes research/hindcast_results.json (the numbers quoted in research/HINDCAST.md).
 *
 * It loads the TypeScript module through Vite's SSR loader, so the code that runs is exactly the
 * code under test. No number is typed in here: thresholds, Rmax values and B are the run settings.
 *
 * Run from the project root: node research/scripts/run_hindcast.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

const RMAX_KM = [20, 35, 50];
const HOLLAND_B = 1.5;
const STEP_HOURS = 1;

const server = await createServer({
  root: ROOT,
  configFile: false,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const hc = await server.ssrLoadModule("/src/sim/hindcast.ts");
  const infra = await server.ssrLoadModule("/src/data/infrastructure.ts");

  const tracks = read("public/data/hindcast/best_tracks.json");
  const refFile = read("public/data/infrastructure/refineries.json");
  const refineries = infra.validateRefineries(refFile);
  const datasetCapacityBpd = refineries.reduce((s, r) => s + (r.capacityBpd ?? 0), 0);

  const slim = (res) => ({
    count: res.count,
    capacityBpd: res.capacityBpd,
    capacityUnknown: res.capacityUnknown,
    shareOfDatasetCapacity: datasetCapacityBpd > 0 ? res.capacityBpd / datasetCapacityBpd : null,
    byState: Object.fromEntries(
      [...new Set(res.exposed.map((r) => r.state))].sort().map((st) => {
        const xs = res.exposed.filter((r) => r.state === st);
        return [st, { count: xs.length, capacityBpd: xs.reduce((s, r) => s + (r.capacityBpd ?? 0), 0) }];
      }),
    ),
    refineries: res.exposed
      .map((r) => ({
        id: r.id,
        site: r.name,
        company: r.company,
        state: r.state,
        refiningDistrict: r.refiningDistrict ?? null,
        capacityBpd: r.capacityBpd,
        firstExposedAt: r.firstExposedAt,
        statusAtFirstExposure: r.statusAtFirstExposure,
        closestApproachKm: Math.round(r.closestApproachKm * 10) / 10,
        peakWindKt: r.peakWindKt === null ? null : Math.round(r.peakWindKt * 10) / 10,
      }))
      .sort((a, b) => (b.capacityBpd ?? 0) - (a.capacityBpd ?? 0) || a.id.localeCompare(b.id)),
  });

  const out = {
    meta: {
      generatedBy: "research/scripts/run_hindcast.mjs",
      generatedAt: new Date().toISOString(),
      bestTracks: { sourceUrl: tracks.meta.sourceUrl, retrievedAt: tracks.meta.retrievedAt },
      refineries: { sourceUrl: refFile.meta.sourceUrl, dataAsOf: refFile.meta.dataAsOf, count: refineries.length, datasetCapacityBpd },
      settings: { stepHours: STEP_HOURS, hollandB: HOLLAND_B, rmaxKm: RMAX_KM },
      note: "Exposure counts, not shutdowns. Refinery fleet and capacities are as of the EIA file date, not the storm year.",
    },
    storms: tracks.storms.map((storm) => ({
      id: storm.id,
      name: storm.name,
      year: storm.year,
      fixes: storm.fixes.length,
      interpolatedPoints: hc.interpolateTrack(storm, STEP_HOURS).length,
      observedRadii: Object.fromEntries([64, 50, 34].map((thr) => [`r${thr}`, slim(hc.observedRadiiExposure(storm, refineries, thr, STEP_HOURS))])),
      holland: Object.fromEntries(
        [64, 34].flatMap((thr) => RMAX_KM.map((rm) => [`v${thr}_rmax${rm}`, slim(hc.hollandTrackExposure(storm, refineries, thr, rm, HOLLAND_B, STEP_HOURS))])),
      ),
    })),
  };

  writeFileSync(resolve(ROOT, "research/hindcast_results.json"), JSON.stringify(out, null, 1) + "\n");

  const fmt = (r) => `${String(r.count).padStart(3)} refineries, ${String(r.capacityBpd).padStart(9)} b/d (${(100 * r.shareOfDatasetCapacity).toFixed(1)}%), unknown cap ${r.capacityUnknown}`;
  console.log(`dataset: ${refineries.length} refineries, ${datasetCapacityBpd} b/d`);
  for (const s of out.storms) {
    console.log(`\n${s.id} ${s.name} ${s.year}: ${s.fixes} fixes, ${s.interpolatedPoints} points`);
    for (const [k, v] of Object.entries(s.observedRadii)) console.log(`  observed ${k}: ${fmt(v)}  ${JSON.stringify(Object.fromEntries(Object.entries(v.byState).map(([a, b]) => [a, b.count])))}`);
    for (const [k, v] of Object.entries(s.holland)) console.log(`  holland ${k}: ${fmt(v)}  ${JSON.stringify(Object.fromEntries(Object.entries(v.byState).map(([a, b]) => [a, b.count])))}`);
  }
} finally {
  await server.close();
}
