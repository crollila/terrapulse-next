// Status report: git state, unit tests, build, live URL. Writes status/status.json for the
// local dashboard. Every value is measured when the script runs; nothing is assumed.
//   node scripts/status.mjs            full report (runs tests and build)
//   node scripts/status.mjs --quick    skip tests and build
//   node scripts/status.mjs --e2e      also run the browser tests against the live URL
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";

const LIVE = "https://crollila.github.io/terrapulse-next/";
const quick = process.argv.includes("--quick");
const e2e = process.argv.includes("--e2e");
const sh = (cmd, opts = {}) => {
  try {
    return { ok: true, out: execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600_000, ...opts }).trim() };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}\n${e.stderr ?? ""}`.trim() };
  }
};
const now = new Date().toISOString();
const status = { generatedAt: now, live: { url: LIVE }, git: {}, tests: {}, build: {}, tasks: {}, screenshots: [] };

status.git.branch = sh("git rev-parse --abbrev-ref HEAD").out;
status.git.commit = sh("git log -1 --format=%h%x09%cI%x09%s").out;
status.git.recent = sh("git log -8 --format=%h%x09%cI%x09%s").out.split("\n");
status.git.dirty = sh("git status --porcelain").out.split("\n").filter(Boolean).length;
status.git.aheadBehind = sh("git rev-list --left-right --count origin/main...HEAD").out;

if (!quick) {
  const t = sh("npx vitest run --reporter=json --outputFile=test-results/unit.json");
  try {
    const j = JSON.parse(readFileSync("test-results/unit.json", "utf8"));
    status.tests.unit = { ranAt: now, passed: j.numPassedTests, failed: j.numFailedTests, skipped: j.numPendingTests, total: j.numTotalTests, ok: j.success };
    status.tests.unitFailures = j.testResults.flatMap((f) => f.assertionResults.filter((a) => a.status === "failed").map((a) => a.fullName)).slice(0, 20);
  } catch {
    status.tests.unit = { ranAt: now, ok: false, error: t.out.slice(-400) };
  }
  const tc = sh("npx tsc --noEmit");
  status.build.typecheck = { ok: tc.ok, detail: tc.ok ? "clean" : tc.out.slice(0, 400) };
  const b = sh("npx vite build");
  status.build.build = { ok: b.ok, detail: (b.out.match(/built in .*/) ?? [b.out.slice(-200)])[0] };
}
if (e2e) {
  const r = sh("npx playwright test", { env: { ...process.env, TP_BASE_URL: LIVE } });
  try {
    const j = JSON.parse(readFileSync("test-results/e2e.json", "utf8"));
    status.tests.e2eLive = { ranAt: now, target: LIVE, passed: j.stats.expected, failed: j.stats.unexpected, flaky: j.stats.flaky, ok: j.stats.unexpected === 0 };
  } catch {
    status.tests.e2eLive = { ranAt: now, ok: false, error: r.out.slice(-400) };
  }
}
// Carry forward results that were not re-measured in this run, each with its own timestamp.
if (existsSync("status/status.json")) {
  try {
    const prev = JSON.parse(readFileSync("status/status.json", "utf8"));
    if (!e2e && prev.tests?.e2eLive) status.tests.e2eLive = prev.tests.e2eLive;
    if (quick) {
      if (prev.tests?.unit) status.tests.unit = prev.tests.unit;
      status.build = prev.build ?? {};
    }
  } catch {
    /* no previous status */
  }
}

try {
  const res = await fetch(LIVE, { signal: AbortSignal.timeout(15_000) });
  const html = await res.text();
  const asset = html.match(/assets\/index-[\w-]+\.js/)?.[0] ?? null;
  let assetOk = null;
  if (asset) assetOk = (await fetch(LIVE + asset, { method: "HEAD", signal: AbortSignal.timeout(15_000) })).ok;
  status.live = { url: LIVE, checkedAt: new Date().toISOString(), httpStatus: res.status, ok: res.ok && assetOk === true, bundle: asset, bundleReachable: assetOk };
} catch (e) {
  status.live = { url: LIVE, checkedAt: new Date().toISOString(), ok: false, error: String(e.message ?? e) };
}

try {
  const q = JSON.parse(readFileSync("TASK_QUEUE.json", "utf8"));
  const by = (s) => q.tasks.filter((t) => t.status === s);
  status.tasks = { updated: q.updated, done: by("done").length, todo: by("todo").length, blocked: by("blocked").length, next: by("todo")[0] ?? null, list: q.tasks };
} catch (e) {
  status.tasks = { error: String(e.message) };
}
if (existsSync("docs/screenshots"))
  status.screenshots = readdirSync("docs/screenshots")
    .filter((f) => f.endsWith(".png"))
    .map((f) => ({ file: `docs/screenshots/${f}`, modifiedAt: statSync(`docs/screenshots/${f}`).mtime.toISOString() }));
status.blockers = existsSync("BLOCKERS.md") ? readFileSync("BLOCKERS.md", "utf8") : "";

mkdirSync("status", { recursive: true });
writeFileSync("status/status.json", JSON.stringify(status, null, 2));
const hist = "status/events.jsonl";
writeFileSync(hist, JSON.stringify({ at: now, commit: status.git.commit?.split("\t")[0], unit: status.tests.unit ?? null, live: status.live.ok, e2eLive: status.tests.e2eLive?.ok ?? null }) + "\n", { flag: "a" });

const line = (k, v) => console.log(`${k.padEnd(14)} ${v}`);
console.log(`TerraPulse Next status at ${now}`);
line("commit", status.git.commit?.replace(/\t/g, "  "));
line("working tree", status.git.dirty ? `${status.git.dirty} uncommitted change(s)` : "clean");
if (status.tests.unit) line("unit tests", status.tests.unit.ok ? `${status.tests.unit.passed} passed, ${status.tests.unit.skipped ?? 0} skipped (run ${status.tests.unit.ranAt})` : `FAILING: ${status.tests.unit.failed ?? "?"} failed`);
if (status.build.typecheck) line("typecheck", status.build.typecheck.ok ? "clean" : "ERRORS");
if (status.build.build) line("build", status.build.build.ok ? status.build.build.detail : "FAILED");
if (status.tests.e2eLive) line("browser/live", `${status.tests.e2eLive.ok ? "passed" : "FAILED"} ${status.tests.e2eLive.passed ?? "?"}/${(status.tests.e2eLive.passed ?? 0) + (status.tests.e2eLive.failed ?? 0)} (run ${status.tests.e2eLive.ranAt})`);
line("live URL", `${status.live.ok ? "OK" : "PROBLEM"} ${status.live.httpStatus ?? ""} ${LIVE}`);
line("tasks", `${status.tasks.done} done, ${status.tasks.todo} todo, ${status.tasks.blocked} blocked`);
if (status.tasks.next) line("next task", `${status.tasks.next.id}: ${status.tasks.next.title}`);
if (status.tests.unit && !status.tests.unit.ok) process.exitCode = 1;
