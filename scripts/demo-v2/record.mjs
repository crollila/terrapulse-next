// Records the revised NASA demo from the running application with Playwright. Every frame is the
// real app; nothing is mocked. Scene lengths come from docs/media/v2/plan.json (built from the
// measured narration).
//   node scripts/demo-v2/record.mjs https://crollila.github.io/terrapulse-next/
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { readdir, rename, rm } from "node:fs/promises";

const base = process.argv[2] ?? "http://localhost:4173/";
const plan = JSON.parse(readFileSync("docs/media/v2/plan.json", "utf8"));
const S = plan.sceneSeconds;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = "docs/media/v2/_rec";
await rm(dir, { recursive: true, force: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const tRec = Date.now();
const store = (fn, arg) => page.evaluate(([f, a]) => new Function("s", "a", f)(window.__tpStore, a), [fn, arg]);
const scrollCase = (top) => page.evaluate((y) => document.querySelector('[data-testid="case-study"] .panel-body')?.scrollTo({ top: y, behavior: "smooth" }), top);

await page.goto(base);
await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 90_000 });
await page.waitForFunction(() => document.querySelector('[data-testid="answer-howmuch"]')?.textContent?.includes("0.541"));
// start from a wide view of the globe so the first scene glides to the study box
await page.evaluate(() => window.__tpMap.jumpTo({ center: [-30, 10], zoom: 1.5 }));
await store("s.getState().setTrend({regionId:'north-slope'}); ");
await sleep(150);
await page.evaluate(() => window.__tpMap.stop());
await page.evaluate(() => window.__tpMap.jumpTo({ center: [-25, 12], zoom: 1.45 }));
await sleep(500);
const marks = {};
const mark = (k) => (marks[k] = (Date.now() - tRec) / 1000);
const until = async (start, seconds) => {
  const left = seconds * 1000 - (Date.now() - start);
  if (left > 0) await sleep(left);
};

// ---- Scene 1: the four answers (the globe glides to the Amazon study box) ----
let t = Date.now();
mark("fourAnswers");
await store("s.getState().setTrend({regionId:'rondonia', variableId:'PRECTOTCORR', startYear:1900, endYear:2100});");
await sleep(1200);
const ans = await page.getByTestId("four-answers").boundingBox();
if (ans) {
  await page.mouse.move(ans.x + ans.width * 0.5, ans.y + 40, { steps: 8 });
  await page.mouse.move(ans.x + ans.width * 0.5, ans.y + Math.min(ans.height - 20, 330), { steps: 40 });
}
await until(t, S.fourAnswers);

// ---- Scene 2: The Amazon Rainfall Mystery ----
t = Date.now();
mark("amazon");
await page.getByTestId("case-amazon").click();
await sleep(1500);
const chart = await page.getByTestId("case-charts").locator("svg").first().boundingBox();
if (chart) {
  await page.mouse.move(chart.x + chart.width * 0.12, chart.y + chart.height * 0.5, { steps: 5 });
  await page.mouse.move(chart.x + chart.width * 0.52, chart.y + chart.height * 0.5, { steps: 90 });
}
await sleep(500);
await scrollCase(150);
await until(t, S.amazon);

// ---- Scene 3: the 2005 break ----
t = Date.now();
mark("break2005");
await scrollCase(330);
await sleep(900);
const diff = await page.getByTestId("case-charts").locator("svg").nth(1).boundingBox();
if (diff) {
  await page.mouse.move(diff.x + diff.width * 0.4, diff.y + diff.height * 0.45, { steps: 5 });
  await page.mouse.move(diff.x + diff.width * 0.62, diff.y + diff.height * 0.45, { steps: 50 });
}
await page.getByTestId("inspect-2005").click().catch(() => undefined);
await sleep(300);
await scrollCase(640);
await until(t, S.break2005);

// ---- Scene 4: Northern Alaska ----
t = Date.now();
mark("alaska");
await store("s.getState().setCase('alaska')");
await page.evaluate(() => document.querySelector('[data-testid="case-study"] .panel-body')?.scrollTo({ top: 0 }));
await page.mouse.move(640, 700);
await until(t, S.alaska);

// ---- Scene 5: Houston simulator ----
t = Date.now();
mark("houston");
await store("const st=s.getState(); st.setHazard('hurricane'); st.setSimPos(0.3); st.setTab('sim'); s.setState({simStarted:true});");
const H = S.houston;
const runFrom = 0.3;
const runTo = 0.64;
const flight = 1.2;
const runSeconds = Math.max(2.5, H - flight - 3.1);
await sleep(flight * 1000);
// time-based, so slow frames cannot stretch the scene
const runStart = Date.now();
for (;;) {
  const f = Math.min(1, (Date.now() - runStart) / (runSeconds * 1000));
  await store("s.getState().setSimPos(a);", runFrom + (runTo - runFrom) * f);
  if (f >= 1) break;
  await sleep(40);
}
const stages = [0.72, 0.84, 0.97];
for (let i = 0; i < stages.length; i++) {
  await store("s.getState().setSimPos(a);", stages[i]);
  await until(t, flight + runSeconds + (i + 1) * 0.75);
}
await until(t, H + 0.4);
mark("end");

await ctx.close();
await browser.close();
const files = await readdir(dir);
const webm = files.find((f) => f.endsWith(".webm"));
await rename(`${dir}/${webm}`, "docs/media/v2/raw.webm");
await rm(dir, { recursive: true, force: true });
writeFileSync("docs/media/v2/marks.json", JSON.stringify({ base, recordedAt: new Date().toISOString(), marks }, null, 2));
console.log(JSON.stringify(marks));
