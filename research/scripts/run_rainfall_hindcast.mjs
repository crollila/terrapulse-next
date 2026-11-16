/**
 * Rainfall hindcast runner: scores the wind and rainfall screens (src/sim/harveyHindcast.ts) against
 * the reconstructed DOE record for Hurricane Harvey and writes research/rainfall_hindcast_results.json
 * (the numbers quoted in research/RAINFALL_FLOOD.md).
 *
 * The TypeScript modules are loaded through Vite's SSR loader, so the code that runs is exactly the
 * code under test. No result is typed in here; the settings below are the run configuration.
 *
 * Run from the project root: node research/scripts/run_rainfall_hindcast.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createServer } from "vite";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

/** Thresholds are every tabulated level the app offers; none is selected after seeing the scores. */
const ARIS = [10, 25, 100, 500, 1000];
const READINGS = ["estimate", "conservative", "liberal"];
const RAIN_FACTORS = [0.8, 1, 1.2];

const server = await createServer({ root: ROOT, configFile: false, logLevel: "error", appType: "custom", server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const hh = await server.ssrLoadModule("/src/sim/harveyHindcast.ts");
  const rf = await server.ssrLoadModule("/src/sim/rainfall.ts");
  const rr = await server.ssrLoadModule("/src/sim/rainRecord.ts");

  const tracks = read("public/data/hindcast/best_tracks.json");
  const storm = tracks.storms.find((s) => s.id === "AL092017");
  const fleet = read("public/data/hindcast/refineries_2017.json");
  const doe = read("public/data/hindcast/doe_harvey_record.json");
  const rain = read("public/data/rainfall/harvey_2017_assets.json");

  const name = new Map(fleet.facilities.map((f) => [f.id, `${f.company} | ${f.name}`]));
  const slim = (h) => ({
    asOfUtc: h.asOfUtc,
    rainDaysCompleted: h.rainDays,
    universeCount: h.universe.length,
    universeCapacityBpd: h.universe.reduce((s, f) => s + (f.capacityBpd ?? 0), 0),
    recordedInUniverse: h.recorded.length,
    recordedCapacityBpd: h.recordedCapacityBpd,
    recordedOutsideUniverse: h.recordedOutsideUniverse,
    screens: h.screens.map((s) => ({
      key: s.key,
      label: s.label,
      count: s.ids.length,
      capacityBpd: s.capacityBpd,
      hits: s.score.hits.length,
      misses: s.score.misses.length,
      falseAlarms: s.score.falseAlarms.length,
      correctNegatives: s.score.correctNegatives.length,
      hitRate: s.score.hitRate,
      falseAlarmRatio: s.score.falseAlarmRatio,
      criticalSuccessIndex: s.score.criticalSuccessIndex,
      missed: s.score.misses.map((id) => name.get(id)),
      extra: s.score.falseAlarms.map((id) => name.get(id)),
    })),
  });

  const resolved = doe.reports.filter((r) => r.shut.resolved);
  const recordedIds = (r) => doe.refineries.filter((x) => x.shutInReports.includes(r.report) && x.eiaId).map((x) => x.eiaId);
  const noPosition = (r) => doe.refineries.filter((x) => x.shutInReports.includes(r.report) && !x.eiaId).map((x) => x.key);
  const run = (r, ariYears, reading = "estimate", rainFactor = 1) => hh.harveyHindcast({ fleet: fleet.facilities, rain: rain.assets, days: rain.meta.days, storm, recordedIds: recordedIds(r), asOfUtc: r.asOfUtc, ariYears, reading, rainFactor });

  const peak = resolved.reduce((a, b) => (b.shut.capacityBpd > a.shut.capacityBpd ? b : a));
  const byReport = resolved.map((r) => ({ report: r.report, asOfPrinted: r.asOfPrinted, doeCount: r.shut.count, doeCapacityBpd: r.shut.capacityBpd, recordedWithoutPosition: noPosition(r), ...slim(run(r, 100)) }));
  const byThreshold = ARIS.map((a) => ({ ariYears: a, ...slim(run(peak, a)) }));
  const byReading = READINGS.map((x) => ({ reading: x, ...slim(run(peak, 100, x)) }));
  const byRainFactor = RAIN_FACTORS.map((f) => ({ rainFactor: f, ...slim(run(peak, 100, "estimate", f)) }));

  // Site table at the reference report: what each refinery of the 2017 fleet had received by then.
  const ref = run(peak, 100);
  const w = rr.recordWindow(rain.meta.days);
  const ex = new Map(rr.exposuresToDate(rain.assets, ref.rainDays).map((e) => [e.id, e]));
  const exFull = new Map(rr.exposuresToDate(rain.assets, w.nDays).map((e) => [e.id, e]));
  const on = rr.windOnsets(storm, ref.universe);
  const ms = Date.parse(peak.asOfUtc);
  const rec = new Set(ref.recorded);
  const firstShut = new Map();
  for (const x of doe.refineries) if (x.eiaId) firstShut.set(x.eiaId, Math.min(...x.shutInReports));
  const sites = ref.universe
    .map((s) => {
      const e = ex.get(s.id);
      const a = rain.assets.find((x) => x.id === s.id);
      return {
        id: s.id,
        company: s.company,
        site: s.name,
        capacityBpd2017: s.capacityBpd,
        recordedShut: rec.has(s.id),
        firstShutInReport: firstShut.get(s.id) ?? null,
        rainToReportMm: e.totalMm === null ? null : Math.round(e.totalMm),
        rainWholeRecordMm: exFull.get(s.id).totalMm === null ? null : Math.round(exFull.get(s.id).totalMm),
        ariReachedByReport: e.peakAri,
        ariReachedByReportUpperBound: e.peakAriConservative,
        ariReachedByReportLowerBound: e.peakAriLiberal,
        peakDuration: e.peakDuration,
        ratioTo100yr: e.peakRatioTo100yr === null ? null : Math.round(e.peakRatioTo100yr * 100) / 100,
        windClassByReportKt: rr.windClassBy(on, s.id, ms),
        elevationM: a.elevationM,
        femaZone: a.nfhl?.zone ?? null,
        femaSfha: a.nfhl?.sfha ?? null,
        hwmWithin5km: a.hwm.within5km,
        hwmMaxHeightFtWithin5km: a.hwm.maxHeightFtWithin5km,
      };
    })
    .sort((a, b) => (b.rainToReportMm ?? 0) - (a.rainToReportMm ?? 0));

  const out = {
    generatedAt: new Date().toISOString(),
    generatedBy: "research/scripts/run_rainfall_hindcast.mjs",
    settings: { arisTested: ARIS, readingsTested: READINGS, rainFactorsTested: RAIN_FACTORS, referenceReport: peak.report, referenceAriYears: 100 },
    referenceReport: { report: peak.report, asOfPrinted: peak.asOfPrinted, asOfUtc: peak.asOfUtc, doeCount: peak.shut.count, doeCapacityBpd: peak.shut.capacityBpd, summaryQuote: peak.summaryQuote },
    byReport,
    byThreshold,
    byReading,
    byRainFactor,
    sitesAtReferenceReport: sites,
  };
  writeFileSync(resolve(ROOT, "research/rainfall_hindcast_results.json"), JSON.stringify(out, null, 1));

  const pct = (x) => (x === null ? "  n/a" : `${(x * 100).toFixed(0).padStart(4)}%`);
  const line = (s) => `${s.label.padEnd(46)} n=${String(s.count).padStart(2)} cap=${(s.capacityBpd / 1e6).toFixed(2)} hit=${s.hits} miss=${s.misses} extra=${s.falseAlarms} | POD${pct(s.hitRate)} FAR${pct(s.falseAlarmRatio)} CSI${pct(s.criticalSuccessIndex)}`;
  console.log(`Reference: DOE Update #${peak.report} (${peak.asOfUtc}), ${peak.shut.count} refineries, ${peak.shut.capacityBpd.toLocaleString("en-US")} b/d; universe ${ref.universe.length}; recorded in universe ${ref.recorded.length}; rain days ${ref.rainDays}`);
  for (const s of slim(ref).screens) console.log("  " + line(s));
  console.log("By threshold (rain, wind50orRain):");
  for (const t of byThreshold) console.log(`  ARI ${String(t.ariYears).padStart(4)}: ` + line(t.screens.find((s) => s.key === "rain")) + "\n            " + line(t.screens.find((s) => s.key === "wind50orRain")));
  console.log("By reading / rain factor (rain screen at 100 yr):");
  for (const t of byReading) console.log(`  ${t.reading.padEnd(12)} ` + line(t.screens.find((s) => s.key === "rain")));
  for (const t of byRainFactor) console.log(`  x${t.rainFactor}         ` + line(t.screens.find((s) => s.key === "rain")));
  console.log("By report (rain 100 yr | wind50orRain):");
  for (const r of byReport) console.log(`  #${r.report} days=${r.rainDaysCompleted} rec=${r.recordedInUniverse} | ` + ["wind50", "rain", "wind50orRain"].map((k) => { const s = r.screens.find((x) => x.key === k); return `${k}: n=${s.count} hit=${s.hits} miss=${s.misses} extra=${s.falseAlarms}`; }).join(" | "));
  console.log("Sites at the reference report:");
  for (const s of sites) console.log(`  ${(s.recordedShut ? "SHUT#" + s.firstShutInReport : "     ").padEnd(7)} ${s.site.slice(0, 15).padEnd(15)} ${s.company.slice(0, 24).padEnd(24)} rain=${String(s.rainToReportMm).padStart(4)}mm ari>=${String(s.ariReachedByReport).padStart(4)} (${s.ariReachedByReportUpperBound}-${s.ariReachedByReportLowerBound}) x100yr=${s.ratioTo100yr} wind=${s.windClassByReportKt} elev=${s.elevationM} zone=${s.femaZone} hwm5=${s.hwmWithin5km}/${s.hwmMaxHeightFtWithin5km}`);
} finally {
  await server.close();
}
