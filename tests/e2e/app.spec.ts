import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    __tpStore: any;
    __tpMap: any;
  }
}

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const list: string[] = [];
  errors.set(page, list);
  page.on("pageerror", (e) => list.push(e.message));
});

async function open(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("globe")).toBeVisible();
  await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0 && !!window.__tpStore.getState().feeds.usgs && !!window.__tpStore.getState().feeds.eonet);
}

const state = (page: Page) => page.evaluate(() => {
  const s = window.__tpStore.getState();
  return { tab: s.tab, simPos: s.simPos, playing: s.simPlaying, layers: s.layers, selection: s.selection, pinned: s.pinned.length, sim: s.sim };
});

const capacity = async (page: Page) => Number((await page.getByTestId("capacity-in-footprint").innerText()).trim().match(/^[\d.]+/)![0]);

async function idle(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    const m = window.__tpMap;
    const t = setTimeout(resolve, 6000);
    m.once("idle", () => { clearTimeout(t); resolve(); });
    m.triggerRepaint();
  }));
}

test("homepage loads with a rendered globe, live layers and no runtime errors", async ({ page }) => {
  await open(page);
  await expect(page).toHaveTitle(/TerraPulse/);
  const canvas = page.locator(".globe-canvas canvas");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(600);
  // the WebGL canvas actually drew something that is not blank
  await idle(page);
  const painted = await page.evaluate(() => {
    const m = window.__tpMap;
    return m.loaded() && m.queryRenderedFeatures().length > 0;
  });
  expect(painted).toBe(true);
  await expect(page.getByTestId("layer-earthquakes")).toContainText(/events|snapshot/);
  await expect(page.getByTestId("layer-earthquakes")).toContainText(/RECENT OBSERVATION|LIVE FEED|DELAYED|CACHED/);
  expect(errors.get(page)).toEqual([]);
});

test("layer switches change what the globe draws", async ({ page }) => {
  await open(page);
  await idle(page);
  const count = () => page.evaluate(() => window.__tpMap.querySourceFeatures("hazards").length);
  expect(await count()).toBeGreaterThan(0);
  for (const id of ["earthquakes", "wildfires", "storms", "otherEvents"]) await page.getByTestId(`layer-${id}`).getByRole("switch").click();
  await idle(page);
  expect(await count()).toBe(0);
  await page.getByTestId("layer-earthquakes").getByRole("switch").click();
  await idle(page);
  expect(await count()).toBeGreaterThan(0);
  // infrastructure layer
  expect(await page.evaluate(() => window.__tpMap.querySourceFeatures("refineries").length)).toBe(0);
  await page.getByTestId("layer-refineries").getByRole("switch").click();
  await page.evaluate(() => window.__tpMap.jumpTo({ center: [-95, 30], zoom: 4 }));
  await idle(page);
  expect(await page.evaluate(() => window.__tpMap.querySourceFeatures("refineries").length)).toBeGreaterThan(10);
  // imagery layer adds a NASA GIBS raster layer
  await page.getByTestId("layer-gibsSst").getByRole("switch").click();
  await expect.poll(() => page.evaluate(() => !!window.__tpMap.getLayer("gibs-gibsSst"))).toBe(true);
  // layer name opens its source metadata
  await page.getByTestId("layer-earthquakes").getByRole("button", { name: /Earthquakes/ }).click();
  await expect(page.getByTestId("inspector-detail")).toContainText("U.S. Geological Survey");
  await expect(page.getByTestId("inspector-detail")).toContainText("Newest observation");
});

test("clicking a hazard on the globe opens its details", async ({ page }) => {
  await open(page);
  const pt = await page.evaluate(async () => {
    const ev = window.__tpStore.getState().feeds.usgs.events[0];
    const m = window.__tpMap;
    m.jumpTo({ center: [ev.lon, ev.lat], zoom: 4.5 });
    await new Promise<void>((r) => { const t = setTimeout(r, 6000); m.once("idle", () => { clearTimeout(t); r(); }); });
    const p = m.project([ev.lon, ev.lat]);
    const b = m.getCanvas().getBoundingClientRect();
    return { x: b.left + p.x, y: b.top + p.y, title: ev.title };
  });
  await page.mouse.click(pt.x, pt.y);
  await expect(page.getByTestId("inspector-title")).toContainText("M ");
  await expect(page.getByTestId("inspector-detail")).toContainText("Observed");
  await expect(page.getByTestId("inspector-detail")).toContainText("USGS");
  // pin it
  await page.getByTestId("pin-btn").click();
  expect((await state(page)).pinned).toBe(1);
});

test("Houston scenario runs from the homepage; timeline plays, pauses, rewinds and scrubs", async ({ page }) => {
  await open(page);
  await page.getByTestId("run-flagship").click();
  await expect(page.getByTestId("sim-panel")).toBeVisible();
  await expect(page.getByTestId("sim-panel")).toContainText("Houston Energy Shock");
  await expect(page.getByTestId("sim-panel")).toContainText("HYPOTHETICAL");
  expect(await capacity(page)).toBeGreaterThan(1);
  // auto-starts after the camera flight
  await expect.poll(async () => (await state(page)).simPos, { timeout: 20_000 }).toBeGreaterThan(0.01);
  expect((await state(page)).playing).toBe(true);
  await page.getByTestId("tl-play").click(); // pause
  const paused = (await state(page)).simPos;
  await page.waitForTimeout(700);
  expect((await state(page)).simPos).toBe(paused);
  await page.getByTestId("tl-play").click(); // resume
  await expect.poll(async () => (await state(page)).simPos).toBeGreaterThan(paused);
  await page.getByTestId("tl-rewind").click();
  expect((await state(page)).simPos).toBe(0);
  await expect(page.getByTestId("tl-stage")).toContainText("Pre-event baseline");

  // scrub: storm window (modelled) then illustrative stages
  await page.getByTestId("tl-scrub").fill("0.42");
  await expect(page.getByTestId("tl-stage")).toContainText("Physical exposure");
  await idle(page);
  const mid = await page.evaluate(() => ({ rings: window.__tpMap.querySourceFeatures("sim-rings").length, nodes: document.querySelectorAll("[data-node]").length }));
  expect(mid.rings).toBeGreaterThan(0);
  await page.getByTestId("tl-scrub").fill("0.99");
  await expect(page.getByTestId("tl-stage")).toContainText("Possible recovery");
  await expect(page.getByTestId("timeline")).toContainText("ILLUSTRATIVE");
  const end = await page.evaluate(() => document.querySelectorAll("[data-node]").length);
  expect(end).toBeGreaterThan(mid.nodes); // graph grows with the timeline
  await page.getByTestId("tl-scrub").fill("0");
  await expect(page.getByTestId("tl-stage")).toContainText("Pre-event baseline");
  expect(errors.get(page)).toEqual([]);
});

test("changing severity, threshold and track recalculates the model; reset restores Scenario 001", async ({ page }) => {
  await open(page);
  await page.getByTestId("tab-sim").click();
  await expect(page.getByTestId("sim-summary")).toBeVisible();
  const cat5 = await capacity(page);
  await page.getByTestId("cat-1").click();
  const cat1 = await capacity(page);
  expect(cat1).toBeLessThan(cat5);
  await page.getByTestId("thr-34").click();
  expect(await capacity(page)).toBeGreaterThanOrEqual(cat1);
  await page.getByTestId("cat-0").click();
  await page.getByTestId("thr-64").click();
  expect(await capacity(page)).toBe(0);
  await expect(page.getByTestId("sim-summary")).toContainText("No refinery reaches the exposure threshold");
  await page.getByTestId("cat-5").click();
  await page.getByTestId("decay-toggle").click(); // weakening off = upper bound
  expect(await capacity(page)).toBeGreaterThanOrEqual(cat5);
  await page.getByTestId("sim-reset").click();
  expect(await capacity(page)).toBe(cat5);
  await expect(page.getByTestId("sim-panel")).toContainText("Scenario 001");
});

test("economic network and globe stay in sync; edges show their evidence; panes work", async ({ page }) => {
  await open(page);
  await page.getByTestId("tab-sim").click();
  await expect(page.getByTestId("impact-graph")).toBeVisible();
  await page.evaluate(() => new Promise((r) => setTimeout(r, 3200))); // camera flight
  // graph -> globe
  const node = page.locator('[data-node^="asset:eia-"]').first();
  await node.click();
  await expect(node).toHaveClass(/sel/);
  await expect(page.getByTestId("inspector-detail")).toContainText("Crude distillation capacity");
  await expect(page.getByTestId("inspector-detail")).toContainText("EIA Refinery Capacity Report");
  await idle(page);
  expect(await page.evaluate(() => window.__tpMap.querySourceFeatures("highlight").length)).toBeGreaterThan(0);
  // globe -> graph: click a refinery that has its own node
  const pt = await page.evaluate(async () => {
    const id = document.querySelectorAll('[data-node^="asset:eia-"]')[1].getAttribute("data-node")!.slice(6);
    const r = window.__tpStore.getState().refineries.find((x: any) => x.id === id);
    window.__tpStore.getState().select(null);
    const m = window.__tpMap;
    m.jumpTo({ center: [r.lon, r.lat], zoom: 10 });
    await new Promise<void>((res) => { const t = setTimeout(res, 6000); m.once("idle", () => { clearTimeout(t); res(); }); });
    const p = m.project([r.lon, r.lat]);
    const b = m.getCanvas().getBoundingClientRect();
    return { x: b.left + p.x, y: b.top + p.y, id };
  });
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator(`[data-node="asset:${pt.id}"]`)).toHaveClass(/sel/);
  // edge evidence
  await page.evaluate(() => (document.querySelector("[data-edge]") as SVGPathElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await expect(page.getByTestId("inspector-detail")).toContainText("What this link means");
  // filter a category and reset
  const before = await page.locator("[data-node]").count();
  await page.getByTestId("gf-company").click();
  expect(await page.locator("[data-node]").count()).toBeLessThan(before);
  await page.getByTestId("graph-reset").click();
  expect(await page.locator("[data-node]").count()).toBe(before);
  // markets: honest withholding plus the historical record
  await page.getByTestId("pane-markets").click();
  await expect(page.getByTestId("markets-pane")).toContainText("cannot be estimated");
  await expect(page.getByTestId("markets-pane")).toContainText("3,871,449 b/d");
  await expect(page.getByTestId("markets-pane").locator("svg.chart").first()).toBeVisible();
  // portfolio
  await page.getByTestId("pane-portfolio").click();
  await page.getByTestId("portfolio-input").fill("XOM 60\nAAPL 40");
  await expect(page.getByTestId("pf-direct")).toHaveText("60.0%");
  const idx = Number((await page.getByTestId("pf-index").innerText()).replace("%", ""));
  expect(idx).toBeGreaterThan(0);
  expect(idx).toBeLessThanOrEqual(60);
  await page.getByTestId("portfolio-input").fill("AAPL 100");
  await expect(page.getByTestId("pf-direct")).toHaveText("0.0%");
  await expect(page.getByTestId("portfolio-pane")).toContainText("missing data, not evidence of zero exposure");
});

test("trend explorer: Amazon rainfall, significance, window change and the 2005 data-quality case", async ({ page }) => {
  await open(page);
  await page.getByTestId("command-input").fill("rainfall trend amazon");
  await page.getByTestId("command-input").press("Enter");
  await expect(page.getByTestId("trend-explorer")).toBeVisible();
  await expect(page.getByTestId("trend-verdict")).toContainText("−0.541");
  await expect(page.getByTestId("trend-verdict")).toContainText("both tests give p < 0.05");
  await expect(page.getByTestId("known-issue")).toContainText("2005");
  await expect(page.getByTestId("known-issue")).toContainText("Reichle");
  await expect(page.getByTestId("trend-explorer")).toContainText("GPCP v2.3");
  // change the window: 1981-2004 is not significant in MERRA-2 (published: -0.14, p = 0.22)
  await page.getByTestId("trend-end").fill("2004");
  await expect(page.getByTestId("trend-verdict")).toContainText("1981–2004");
  await expect(page.getByTestId("trend-verdict")).toContainText("No significant trend detected");
  // another variable and region
  await page.getByTestId("trend-variable").selectOption("T2M");
  await page.getByTestId("trend-region").selectOption("north-slope");
  await expect(page.getByTestId("trend-verdict")).toContainText("+0.51");
  await expect(page.getByTestId("trend-verdict")).toContainText("1981–2025");
  expect(errors.get(page)).toEqual([]);
});

test("command bar, methods dialog and workspace reset", async ({ page }) => {
  await open(page);
  await page.getByTestId("command-input").fill("simulate category 3 hurricane near New Orleans");
  await page.getByTestId("command-input").press("Enter");
  await expect(page.getByTestId("sim-panel")).toBeVisible();
  const s = await state(page);
  expect(s.sim.landfallLat).toBeCloseTo(29.95, 2);
  expect(s.sim.vmaxKt).toBeGreaterThanOrEqual(96);
  expect(s.sim.vmaxKt).toBeLessThanOrEqual(112);
  await expect(page.getByTestId("sim-panel")).toContainText("Custom scenario");
  await page.getByTestId("methods-btn").click();
  await expect(page.getByTestId("methods-modal")).toContainText("Holland");
  await expect(page.getByTestId("methods-modal")).toContainText("AI disclosure");
  await expect(page.getByTestId("methods-modal")).toContainText("not an official NASA product");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("methods-modal")).toBeHidden();
});

test("falls back to labelled snapshots when the live feeds are unreachable", async ({ page }) => {
  await page.route(/earthquake\.usgs\.gov|eonet\.gsfc\.nasa\.gov/, (r) => r.abort());
  await open(page);
  await expect(page.getByTestId("layer-earthquakes")).toContainText("CACHED");
  await expect(page.getByTestId("layer-earthquakes")).toContainText("snapshot saved");
  await expect(page.getByTestId("layer-wildfires")).toContainText("CACHED");
  await expect(page.locator(".panel-left")).toContainText("A live source could not be reached");
  await expect(page.getByTestId("layer-earthquakes")).not.toContainText("LIVE FEED");
});

for (const vp of [
  { name: "laptop", width: 1280, height: 720 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`layout is usable at ${vp.name} size (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await open(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(1);
    await expect(page.locator(".panel-left")).toBeVisible();
    await page.getByTestId("tab-sim").click();
    await expect(page.getByTestId("timeline")).toBeVisible();
    await expect(page.getByTestId("sim-panel")).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(1);
    expect(await capacity(page)).toBeGreaterThan(1);
  });
}
