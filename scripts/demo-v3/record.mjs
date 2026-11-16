// Records the V3 demo from the running application. Every frame is the real app, captured through
// the browser's screencast at high resolution with the graphics card. The only additions made in
// the page are highlight outlines around existing elements (annotation, no values changed).
//   node scripts/demo-v3/record.mjs https://crollila.github.io/terrapulse-next/
import { chromium } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { TOTAL, VIEW } from "./timeline.mjs";

const base = process.argv[2] ?? "https://crollila.github.io/terrapulse-next/";
const DSF = Number(process.argv[3] ?? 1.6);
const OUT = "docs/media/v3";
rmSync(`${OUT}/frames`, { recursive: true, force: true });
mkdirSync(`${OUT}/frames`, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl"] });
const ctx = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DSF });
const page = await ctx.newPage();
const store = (fn, arg) => page.evaluate(([f, a]) => new Function("s", "a", f)(window.__tpStore, a), [fn, arg]);
const hl = (...sels) => page.evaluate((s) => window.__hl(s), sels);

await page.goto(base);
await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 90_000 });
await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0 && !!window.__tpStore.getState().feeds.usgs && !!window.__tpStore.getState().feeds.eonet);
const renderer = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
await page.addStyleTag({ content: ".tp-hl{outline:3px solid #1d6bff !important;outline-offset:3px;border-radius:12px;box-shadow:0 0 0 8px rgba(29,107,255,.2) !important;transition:box-shadow .25s, outline-color .25s}" });
await page.evaluate(() => {
  window.__hl = (sels) => {
    document.querySelectorAll(".tp-hl").forEach((e) => e.classList.remove("tp-hl"));
    (sels || []).forEach((s) => document.querySelectorAll(s).forEach((e) => e.classList.add("tp-hl")));
  };
  const idleOnce = () =>
    new Promise((resolve) => {
      const m = window.__tpMap;
      const t = setTimeout(resolve, 7000);
      m.once("idle", () => {
        clearTimeout(t);
        resolve();
      });
      m.triggerRepaint();
    });
  window.__idle = idleOnce;
});

// ---- warm every view once so nothing loads on camera ----
await store("s.getState().setCase('amazon')");
await page.waitForSelector('[data-testid="case-charts"] svg');
await store("s.getState().setCase('alaska')");
await page.waitForSelector('[data-testid="case-charts"] svg');
await sleep(2600);
await store("s.getState().setCase(null); s.getState().setTab('sim')");
await page.waitForSelector('[data-testid="impact-graph"] [data-node]');
await sleep(3200);
await page.evaluate(() => window.__idle());
await page.getByTestId("pane-markets").click();
await page.waitForSelector('[data-testid="markets-pane"] svg.chart');
await page.getByTestId("pane-network").click();
await store("s.getState().setTab('trends'); s.getState().setTrend({regionId:'rondonia', variableId:'PRECTOTCORR', startYear:1900, endYear:2100});");
await sleep(2800);
await page.evaluate(() => window.__idle());
// opening view: Live World with NASA sea-surface-temperature imagery
await store("const st=s.getState(); st.setTab('world'); st.setLayer('gibsSst', true); st.select(null);");
await sleep(2600);
await page.evaluate(() => {
  const m = window.__tpMap;
  m.stop();
  m.jumpTo({ center: [-74, 14], zoom: 2.62, pitch: 0, bearing: 0 });
});
await page.evaluate(() => window.__idle());
await sleep(1200);
await page.evaluate(() => window.__idle());
await page.mouse.move(900, 2);

// ---- screencast ----
const cdp = await ctx.newCDPSession(page);
const frames = [];
const writes = [];
let rec = false;
cdp.on("Page.screencastFrame", (f) => {
  cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
  if (!rec) return;
  const name = `f${String(frames.length).padStart(6, "0")}.jpg`;
  frames.push({ name, ts: f.metadata.timestamp });
  writes.push(writeFile(`${OUT}/frames/${name}`, Buffer.from(f.data, "base64")));
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 93, maxWidth: 3840, maxHeight: 1920, everyNthFrame: 1 });
await sleep(300);

let t0 = 0;
const at = async (sec) => {
  const left = t0 + sec * 1000 - Date.now();
  if (left > 0) await sleep(left);
};
const log = [];
const mark = (id) => log.push({ id, t: +((Date.now() - t0) / 1000).toFixed(3) });

// ================= Scene 0: hook (0 - 3.0) =================
rec = true;
t0 = Date.now();
const t0Epoch = t0 / 1000;
mark("hook");
await page.evaluate(() => {
  window.__spin = true;
  let last = performance.now();
  const loop = (now) => {
    if (!window.__spin) return;
    const dt = (now - last) / 1000;
    last = now;
    const m = window.__tpMap;
    const c = m.getCenter();
    m.jumpTo({ center: [c.lng + dt * 9, c.lat] });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});

// ================= Scene 1: the four questions (3.0 - 7.2) =================
await at(2.95);
mark("four");
await page.evaluate(() => (window.__spin = false));
await store("const st=s.getState(); st.setLayer('gibsSst', false); st.setCase(null); st.setTab('trends');");
await page.evaluate(() => document.querySelector('[data-testid="answer-significant"]')?.scrollIntoView({ block: "nearest" }));
await at(3.7);
await hl('[data-testid="answer-what"]');
await at(4.5);
await hl('[data-testid="answer-where"]');
await at(5.3);
await hl('[data-testid="answer-howmuch"]');
await at(6.1);
await hl('[data-testid="answer-significant"]');

// ================= Scene 2: Amazon Rainfall Mystery (7.2 - 12.3) =================
await at(7.2);
mark("amazon");
await hl();
await store("s.getState().setCase('amazon')");
await page.evaluate(() => document.querySelector('[data-testid="case-study"] .panel-body')?.scrollTo({ top: 0 }));
await at(8.0);
await hl('[data-testid="case-numbers"]');
await at(10.3);
await hl('[data-testid="case-verdict"]');

// ================= Scene 3: the 2005 shift (12.3 - 15.2) =================
await at(12.3);
mark("break");
await hl();
await page.evaluate(() => {
  const body = document.querySelector('[data-testid="case-study"] .panel-body');
  const charts = document.querySelector('[data-testid="case-charts"]');
  if (body && charts) body.scrollTo({ top: charts.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 34, behavior: "smooth" });
});
await at(13.0);
await hl('[data-testid="case-charts"]');
const diff = await page.getByTestId("case-charts").locator("svg").nth(1).boundingBox();
if (diff) {
  await page.mouse.move(diff.x + diff.width * 0.42, diff.y + diff.height * 0.5, { steps: 2 });
  await page.mouse.move(diff.x + diff.width * 0.6, diff.y + diff.height * 0.5, { steps: 45 });
}

// ================= Scene 4: Northern Alaska (15.2 - 16.7) =================
await at(15.2);
mark("alaska");
await page.mouse.move(900, 2);
await hl();
await store("s.getState().setCase('alaska')");
await page.evaluate(() => document.querySelector('[data-testid="case-study"] .panel-body')?.scrollTo({ top: 0 }));
await at(15.55);
await hl('[data-testid="case-numbers"]', '[data-testid="case-verdict"]');

// ================= Scene 5: Houston hurricane (16.7 - 22.0) and 6: network (22.0 - 27.6) =================
await at(16.7);
mark("houston");
await hl();
await store("const st=s.getState(); st.setHazard('hurricane'); st.setSimPos(0.2); st.setTab('sim'); s.setState({simStarted:true, simPlaying:false});");
// storm position follows the clock inside the page, so it is smooth and exactly timed
await page.evaluate((t0ms) => {
  const key = [
    [16.9, 0.2],
    [22.0, 0.52],
    [22.7, 0.64],
    [22.85, 0.7],
    [23.95, 0.7],
    [24.0, 0.8],
    [24.9, 0.8],
    [24.95, 0.9],
    [27.5, 0.9],
  ];
  const loop = () => {
    const t = (Date.now() - t0ms) / 1000;
    if (t > 27.55) return;
    let pos = key[0][1];
    for (let i = 0; i < key.length - 1; i++) {
      if (t >= key[i][0]) pos = t >= key[i + 1][0] ? key[i + 1][1] : key[i][1] + ((key[i + 1][1] - key[i][1]) * (t - key[i][0])) / (key[i + 1][0] - key[i][0]);
    }
    const st = window.__tpStore.getState();
    if (st.tab === "sim" && Math.abs(st.simPos - pos) > 1e-4) st.setSimPos(pos);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}, t0);
await at(19.6);
await hl('[data-testid="sim-summary"]');
await at(22.0);
mark("network");
await hl('[data-tier="hazard"] .node', '[data-tier="asset"] .node');
await at(23.0);
await hl('[data-tier="activity"] .node');
await at(23.6);
await hl('[data-tier="company"] .node');
await page.evaluate(() => {
  const body = document.querySelector('[data-testid="sim-workspace"] .panel-body');
  const tier = document.querySelector('[data-tier="company"]');
  if (body && tier) body.scrollTo({ top: tier.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 150, behavior: "smooth" });
});
await at(24.25);
await hl('[data-tier="commodity"] .node');
await at(25.05);
await hl('[data-tier="industry"] .node', '[data-tier="fund"] .node');
await at(25.9);
await hl();
await page.getByTestId("pane-markets").click();
await page.evaluate(() => document.querySelector('[data-testid="sim-workspace"] .panel-body')?.scrollTo({ top: 0 }));
await at(26.1);
await hl('[data-testid="markets-pane"] .callout.danger');

// ================= Scene 7: closing (27.6 - end) =================
await at(27.6);
mark("close");
await hl();
await store("const st=s.getState(); st.setLayer('gibsSst', true); st.setTab('world');");
await at(TOTAL + 0.5);
mark("end");
rec = false;
await cdp.send("Page.stopScreencast").catch(() => undefined);
await Promise.all(writes);
await browser.close();

// concat list with real frame durations
const rel = frames.map((f) => ({ name: f.name, t: f.ts - t0Epoch })).filter((f) => f.t >= -0.05);
let list = "";
for (let i = 0; i < rel.length; i++) {
  const d = i < rel.length - 1 ? Math.max(0.001, rel[i + 1].t - rel[i].t) : 0.2;
  list += `file 'frames/${rel[i].name}'\nduration ${d.toFixed(5)}\n`;
}
list += `file 'frames/${rel[rel.length - 1].name}'\n`;
writeFileSync(`${OUT}/frames.txt`, list);
writeFileSync(`${OUT}/record.json`, JSON.stringify({ base, renderer, dsf: DSF, view: VIEW, recordedAt: new Date().toISOString(), frames: rel.length, firstFrameAt: rel[0].t, lastFrameAt: rel[rel.length - 1].t, marks: log }, null, 2));
console.log(JSON.stringify({ renderer, frames: rel.length, seconds: +(rel[rel.length - 1].t - rel[0].t).toFixed(2), fps: +(rel.length / (rel[rel.length - 1].t - rel[0].t)).toFixed(1), marks: log.map((m) => `${m.id}@${m.t}`).join(" ") }));
