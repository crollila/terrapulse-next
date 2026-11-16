// Captures real screenshots and a ~30 second screen recording from the running app with Playwright.
// Nothing is mocked or pre-rendered: every frame is the actual application.
//
//   node scripts/capture.mjs                      (local production preview on :4173; run `npm run preview` first)
//   node scripts/capture.mjs https://crollila.github.io/terrapulse-next/
//
// Output: docs/screenshots/*.png and docs/media/terrapulse-demo.webm (convert with ffmpeg, see DEMO_KIT.md)
import { chromium } from "@playwright/test";
import { mkdir, readdir, rename, rm } from "node:fs/promises";

const base = process.argv[2] ?? "http://localhost:4173/";
const only = process.argv[3] ?? "all"; // "shots" | "video" | "all"
const ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready(page) {
  await page.goto(base);
  await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 90_000 });
  await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0 && !!window.__tpStore.getState().feeds.usgs);
}
const idle = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const m = window.__tpMap;
        const t = setTimeout(resolve, 8000);
        m.once("idle", () => {
          clearTimeout(t);
          resolve();
        });
        m.triggerRepaint();
      }),
  );
const store = (page, fn, arg) => page.evaluate(([f, a]) => new Function("s", "a", f)(window.__tpStore, a), [fn, arg]);

await mkdir("docs/screenshots", { recursive: true });
await mkdir("docs/media", { recursive: true });
const browser = await chromium.launch({ args: ARGS });

if (only !== "video") {
  const sizes = [
    ["desktop-1440", 1440, 900],
    ["laptop-1280", 1280, 720],
    ["tablet-768", 768, 1024],
    ["mobile-390", 390, 844],
  ];
  for (const [name, width, height] of sizes) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: name.startsWith("desktop") ? 2 : 1 });
    const page = await ctx.newPage();
    await ready(page);
    await sleep(2500);
    await idle(page);
    await page.screenshot({ path: `docs/screenshots/${name}-1-live-world.png` });

    await store(page, "s.getState().setTrend({regionId:'rondonia',variableId:'PRECTOTCORR',startYear:1981,endYear:2025}); s.getState().setTrendOpen(true); s.getState().select({type:'region',id:'rondonia'}); s.getState().flyTo({lat:-6,lon:-52,zoom:2.6});");
    await sleep(3200);
    await idle(page);
    await page.screenshot({ path: `docs/screenshots/${name}-2-trend-amazon.png` });

    await store(page, "s.getState().setTrendOpen(false); s.getState().select(null); s.getState().setTab('sim');");
    await sleep(3600);
    await store(page, "s.setState({simStarted:true}); s.getState().setSimPos(a);", 0.41);
    await sleep(600);
    await idle(page);
    await page.screenshot({ path: `docs/screenshots/${name}-3-houston-exposure.png` });

    await store(page, "s.getState().setSimPos(1); const g=document.querySelector('[data-node^=\"co:EXXON\"]'); ");
    await sleep(500);
    await page.locator('[data-node^="co:EXXON"]').click({ timeout: 5000 }).catch(() => undefined);
    await sleep(900);
    await idle(page);
    await page.screenshot({ path: `docs/screenshots/${name}-4-impact-network.png` });

    if (width >= 1000) {
      await page.getByTestId("pane-markets").click();
      await sleep(900);
      await page.screenshot({ path: `docs/screenshots/${name}-5-harvey-record.png` });
      await page.getByTestId("pane-portfolio").click();
      await sleep(600);
      await page.screenshot({ path: `docs/screenshots/${name}-6-portfolio.png` });
    }
    await ctx.close();
    console.log(`screenshots: ${name}`);
  }
}

if (only !== "shots") {
  // ---- ~30 second recording, 1280x720 ----
  const dir = "docs/media/_rec";
  await rm(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir, size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const mark = (label) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s  ${label}`);
  await ready(page);
  mark("globe ready");
  // 1. luminous globe with live hazards, slow drift
  for (let i = 0; i < 26; i++) {
    await page.evaluate(() => {
      const m = window.__tpMap;
      const c = m.getCenter();
      m.jumpTo({ center: [c.lng + 0.9, c.lat] });
    });
    await sleep(110);
  }
  mark("rotation done");
  // 2. NASA trend: Amazon rainfall and the 2005 data-quality case
  await store(page, "s.getState().setTrend({regionId:'rondonia',variableId:'PRECTOTCORR',startYear:1981,endYear:2025}); s.getState().setTrendOpen(true); s.getState().select({type:'region',id:'rondonia'}); s.getState().flyTo({lat:-6,lon:-50,zoom:2.7});");
  await sleep(3600);
  await page.locator('[data-testid="known-issue"]').scrollIntoViewIfNeeded().catch(() => undefined);
  await sleep(2600);
  mark("trend shown");
  // 3. to the Gulf: Scenario 001
  await store(page, "s.getState().setTrendOpen(false); s.getState().select(null); s.getState().setSim({}); s.getState().setSimPos(0); s.getState().setTab('sim');");
  await sleep(3400);
  mark("at Houston");
  // 4. run the storm window (modelled hours) by driving the timeline at a fixed rate
  await store(page, "s.setState({simStarted:true});");
  for (let x = 0.14; x <= 0.64; x += 0.0065) {
    await store(page, "s.getState().setSimPos(a);", x);
    await sleep(85);
  }
  mark("storm window done");
  // 5. illustrative stages build the network
  for (const x of [0.7, 0.79, 0.88, 0.97]) {
    await store(page, "s.getState().setSimPos(a);", x);
    await sleep(1150);
  }
  mark("network built");
  // 6. follow one chain, then show the evidence-first market view
  await page.locator('[data-node^="co:EXXON"]').click({ timeout: 4000 }).catch(() => undefined);
  await sleep(2300);
  await page.getByTestId("pane-markets").click();
  await sleep(2600);
  mark("end");
  await ctx.close();
  const files = await readdir(dir);
  const webm = files.find((f) => f.endsWith(".webm"));
  if (webm) {
    await rename(`${dir}/${webm}`, "docs/media/terrapulse-demo-raw.webm");
    await rm(dir, { recursive: true, force: true });
    console.log("video: docs/media/terrapulse-demo-raw.webm");
  }
}
await browser.close();
