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

/** The app opens on Earth-System Trends. Most older tests start from Live World, so that is the default here. */
async function open(page: Page, tab: "trends" | "world" = "world") {
  await page.goto("./");
  await expect(page.getByTestId("globe")).toBeVisible();
  await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0 && !!window.__tpStore.getState().feeds.usgs && !!window.__tpStore.getState().feeds.eonet);
  if (tab === "world") await page.getByTestId("tab-world").click();
}

test.describe("Showcase (About)", () => {
  test("the shareable address opens the showcase with real figures, team credits and working actions", async ({ page }) => {
    await page.goto("./#about");
    await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 60_000 });
    await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0);
    await expect(page.getByTestId("tab-about")).toHaveAttribute("aria-selected", "true");
    const sc = page.getByTestId("showcase");
    await expect(sc.locator("h1")).toHaveText("TerraPulse");
    await expect(sc).toContainText("Earth Intelligence. Economic Foresight.");
    await expect(sc).toContainText("See the change. Trace the impact.");
    await expect(sc).toContainText("not endorsed by NASA");
    // one h1, a heading per section
    expect(await sc.locator("h1").count()).toBe(1);
    expect(await sc.locator("section h2").count()).toBe(8);
    // the four questions with numbers computed in the browser
    await expect(page.getByTestId("sc-four")).toContainText("What is changing?");
    await expect(page.getByTestId("sc-four")).toContainText("Is it statistically significant?");
    await expect(page.getByTestId("sc-four")).toContainText("−0.541 mm/day");
    await expect(page.getByTestId("sc-four")).toContainText("Yes, in both corrected tests");
    // Amazon: two records, the 2005 figures, limits
    await expect(page.getByTestId("sc-numbers-rondonia")).toContainText("−0.541");
    await expect(page.getByTestId("sc-numbers-rondonia")).toContainText("−0.282");
    await expect(page.getByTestId("sc-2005")).toContainText("−1.07 mm/day");
    await expect(page.getByTestId("sc-amazon-verdict")).toContainText("size is not independently confirmed");
    await expect(sc.locator("#sc-amazon")).toContainText("not the Amazon as a whole");
    await expect(sc.locator("#sc-amazon").getByTestId("case-charts").locator("svg")).toHaveCount(2);
    // Alaska: supported
    await expect(page.getByTestId("sc-numbers-north-slope")).toContainText("+0.51");
    await expect(page.getByTestId("sc-numbers-north-slope")).toContainText("+0.41");
    await expect(page.getByTestId("sc-alaska-verdict")).toContainText("Supported by a second dataset");
    // simulator: live engine figures and the honest labels
    await expect(page.getByTestId("sc-houston")).toContainText("4.40 million b/d");
    await expect(page.getByTestId("sc-sim-warning")).toContainText("Exposure is not a prediction of losses");
    await expect(sc.locator("#sc-simulation")).toContainText("failed to reproduce Hurricane Harvey");
    // team: four documented contributors with profile and evidence links; nobody unverified
    const cards = page.getByTestId("sc-team-cards").locator("article");
    await expect(cards).toHaveCount(4);
    for (const who of ["Case Ollila", "Kawtar Ag", "Muhammad Rehan Farooq", "Derek"]) await expect(page.getByTestId("sc-team-cards")).toContainText(who);
    await expect(page.getByTestId("sc-team-cards").locator('a[href="https://github.com/DerekKered044"]')).toHaveCount(1);
    await expect(page.getByTestId("sc-team-cards").locator('a[href$="/pull/12"]')).toHaveCount(1);
    await expect(sc).not.toContainText("Zahid");
    // transparency and calls to action
    await expect(sc.locator("#sc-transparency")).toContainText("Anthropic Claude");
    expect(await page.getByTestId("sc-sources").locator("tr").count()).toBeGreaterThan(8);
    const cta = page.getByTestId("sc-cta-links");
    await expect(cta.locator('a[href="https://github.com/crollila/terrapulse-next"]')).toHaveCount(1);
    await expect(cta.locator('a[href$="docs/METHODOLOGY.md"]')).toHaveCount(1);
    // images exist
    for (const img of await sc.locator("figure img").all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(async () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    }
    // the demonstration: the final narrated video, served from this site
    await page.getByTestId("sc-watch").click();
    const src = await page.getByTestId("sc-video").getAttribute("src");
    expect(src).toMatch(/media\/terrapulse-demo-final\.mp4$/);
    const head = await page.request.head(new URL(src!, page.url()).href);
    expect(head.status()).toBe(200);
    expect(head.headers()["content-type"]).toContain("video/mp4");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("sc-video-modal")).toBeHidden();
    expect(errors.get(page)).toEqual([]);
  });

  test("showcase actions lead into the working application and back", async ({ page }) => {
    await open(page, "trends");
    await page.getByTestId("tab-about").click();
    await expect(page).toHaveURL(/#about$/);
    await page.getByTestId("sc-open-amazon").click();
    await expect(page.getByTestId("case-title")).toHaveText("The Amazon Rainfall Mystery");
    await expect(page).not.toHaveURL(/#about$/);
    await page.getByTestId("tab-about").click();
    await page.getByTestId("sc-open-houston").click();
    await expect(page.getByTestId("sim-panel")).toContainText("Houston Energy Shock");
    expect(await capacity(page)).toBeGreaterThan(1);
    await page.getByTestId("tab-about").click();
    await page.getByTestId("sc-explore").click();
    await expect(page.getByTestId("four-answers")).toBeVisible();
    await expect(page.getByTestId("answer-howmuch")).toContainText("mm/day");
  });

  for (const vp of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    test(`showcase layout has no horizontal overflow at ${vp.name} size`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("./#about");
      await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 60_000 });
      await expect(page.getByTestId("showcase").locator("h1")).toBeVisible();
      await expect(page.getByTestId("sc-team-cards")).toContainText("Case Ollila");
      const overflow = await page.evaluate(() => {
        const sc = document.querySelector('[data-testid="showcase"]') as HTMLElement;
        return Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, sc.scrollWidth - sc.clientWidth);
      });
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("NASA challenge: Earth-System Trends", () => {
  test("opens on the trends view and answers the four questions; variable, region and window can be changed", async ({ page }) => {
    await open(page, "trends");
    await expect(page.getByTestId("tab-trends")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("trends-entry")).toHaveText("Explore Earth's Changing Systems");
    await expect(page.getByTestId("case-amazon")).toContainText("The Amazon Rainfall Mystery");
    // default selection: rainfall in the south-western Amazon box
    await expect(page.getByTestId("answer-what")).toContainText("Precipitation");
    await expect(page.getByTestId("answer-where")).toContainText("Southwestern Amazon");
    await expect(page.getByTestId("answer-where")).toContainText("13°S to 8°S, 66°W to 60°W");
    await expect(page.getByTestId("answer-howmuch")).toContainText("−0.541 mm/day");
    await expect(page.getByTestId("answer-howmuch")).toContainText("95% range −0.641 to −0.441");
    await expect(page.getByTestId("answer-significant")).toContainText("Yes, in both corrected tests");
    await expect(page.getByTestId("answer-significant")).toContainText("date windows");
    await expect(page.getByTestId("full-record-tag")).toHaveText("Full record 1981–2025 only");
    // only study regions are drawn: eight boxes, no global surface, no live events
    await idle(page);
    expect(await page.evaluate(() => new Set(window.__tpMap.querySourceFeatures("regions").map((f: any) => f.properties.id)).size)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__tpMap.querySourceFeatures("hazards").length)).toBe(0);
    // choose another variable and region
    await page.getByTestId("trend-variable").selectOption("T2M");
    await page.getByTestId("trend-region").selectOption("north-slope");
    await expect(page.getByTestId("answer-what")).toContainText("Air temperature");
    await expect(page.getByTestId("answer-where")).toContainText("Northern Alaska");
    await expect(page.getByTestId("answer-howmuch")).toContainText("+0.51 °C");
    await expect(page.getByTestId("answer-significant")).toContainText("Supported by a second dataset".toLowerCase());
    // a different window: the browser recomputes the trend, and the independent check is flagged as not applying
    await page.getByTestId("trend-end").fill("2010");
    await expect(page.getByTestId("answer-howmuch")).toContainText("1981–2010");
    await expect(page.getByTestId("second-opinion-line")).toContainText("does not apply to that window");
    await expect(page.getByTestId("trend-explorer")).toContainText("Full record 1981–2025 only");
    expect(errors.get(page)).toEqual([]);
  });

  test("The Amazon Rainfall Mystery is one click away: two records, the 2005 break, the warning", async ({ page }) => {
    await open(page, "trends");
    await page.getByTestId("case-amazon").click();
    await expect(page.getByTestId("case-title")).toHaveText("The Amazon Rainfall Mystery");
    await expect(page.getByTestId("case-numbers")).toContainText("−0.541");
    await expect(page.getByTestId("case-numbers")).toContainText("−0.282");
    await expect(page.getByTestId("case-numbers")).toContainText("GPCP v2.3");
    await expect(page.getByTestId("case-verdict")).toContainText("direction is supported");
    await expect(page.getByTestId("case-verdict")).toContainText("size is not independently confirmed");
    await expect(page.getByTestId("case-charts").locator("svg")).toHaveCount(2);
    await expect(page.getByTestId("breakpoint-2005")).toHaveCount(1);
    await expect(page.getByTestId("breakpoint-2005")).toContainText("2005");
    // synchronized charts: hovering one reads the same year in both
    const box = (await page.getByTestId("case-charts").locator("svg").first().boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await expect(page.getByTestId("case-readout")).toContainText(/\d{4}: MERRA-2 .* GPCP v2\.3 .* difference/);
    // inspect the 2005 issue: sources and the fitted step
    await page.getByTestId("inspect-2005").click();
    await expect(page.getByTestId("issue-details")).toContainText("Reichle");
    await expect(page.getByTestId("issue-details")).toContainText("−1.07 mm/day");
    await expect(page.getByTestId("issue-details")).toContainText("−0.13 mm/day");
    await expect(page.getByTestId("issue-details")).toContainText("−0.99 mm/day");
    await expect(page.getByTestId("case-warning")).toContainText("Detected is not validated");
    await expect(page.getByTestId("case-warning")).toContainText("does not describe rainfall across the Amazon");
    await expect(page.getByTestId("case-warning")).toContainText("does not explain every change");
    // the globe glides to the study box (66°W to 60°W, 13°S to 8°S)
    await expect.poll(async () => page.evaluate(() => Math.round(window.__tpMap.getCenter().lng)), { timeout: 15_000 }).toBe(-63);
    await expect.poll(async () => page.evaluate(() => window.__tpMap.getZoom()), { timeout: 15_000 }).toBeGreaterThan(3);
    expect(errors.get(page)).toEqual([]);
  });

  test("switching to Northern Alaska shows a supported trend and the side-by-side comparison", async ({ page }) => {
    await open(page, "trends");
    await page.getByTestId("case-amazon").click();
    await expect(page.getByTestId("case-compare")).toContainText("Northern Alaska warming");
    await page.getByTestId("switch-case").click();
    await expect(page.getByTestId("case-title")).toHaveText("Northern Alaska warming");
    await expect(page.getByTestId("case-numbers")).toContainText("+0.51");
    await expect(page.getByTestId("case-numbers")).toContainText("+0.41");
    await expect(page.getByTestId("case-numbers")).toContainText("NASA GISTEMP v4");
    await expect(page.getByTestId("case-verdict")).toContainText("Supported by a second dataset");
    await expect(page.getByTestId("breakpoint-2005")).toHaveCount(0);
    await expect(page.getByTestId("issue-2005")).toHaveCount(0);
    await expect(page.getByTestId("compare-amazon")).toContainText("Documented data issue in 2005");
    await expect(page.getByTestId("compare-alaska")).toContainText("No documented data issue found");
    await expect(page.getByTestId("answer-where")).toContainText("Northern Alaska");
    await expect.poll(async () => page.evaluate(() => Math.round(window.__tpMap.getCenter().lng)), { timeout: 15_000 }).toBe(-155);
    // back to free exploration keeps the selection
    await page.getByTestId("case-to-detective").click();
    await expect(page.getByTestId("trend-explorer")).toBeVisible();
    await expect(page.getByTestId("answer-howmuch")).toContainText("+0.51 °C");
  });

  test("guided tour ends in the Houston simulator, which still works, and the way back is intact", async ({ page }) => {
    await open(page, "trends");
    await page.getByTestId("tour-start").click();
    await expect(page.getByTestId("tour")).toContainText("Step 1 of 5");
    await page.getByTestId("tour-next").click();
    await page.getByTestId("tour-next").click();
    await expect(page.getByTestId("case-title")).toHaveText("The Amazon Rainfall Mystery");
    await page.getByTestId("tour-next").click();
    await expect(page.getByTestId("case-title")).toHaveText("Northern Alaska warming");
    await page.getByTestId("tour-next").click();
    await expect(page.getByTestId("tour")).toContainText("Step 5 of 5");
    await expect(page.getByTestId("evidence-bridge")).toContainText("did not cause the simulated storm");
    await expect(page.getByTestId("evidence-bridge")).toContainText("no financial forecast is derived");
    await page.getByTestId("tour-finish").click();
    await expect(page.getByTestId("sim-panel")).toContainText("Houston Energy Shock");
    expect(await capacity(page)).toBeGreaterThan(1);
    await page.getByTestId("simulate-btn").click();
    await expect.poll(async () => (await state(page)).simPos, { timeout: 15_000 }).toBeGreaterThan(0.01);
    await expect(page.getByTestId("impact-graph")).toBeVisible();
    await page.getByTestId("tab-trends").click();
    await expect(page.getByTestId("four-answers")).toBeVisible();
    await page.getByTestId("tab-world").click();
    await expect(page.getByTestId("layer-earthquakes")).toBeVisible();
    expect(errors.get(page)).toEqual([]);
  });
});

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
  // every-window map: 496 published windows; clicking a cell selects that window
  await expect(page.getByTestId("window-map")).toContainText("496 windows");
  expect(await page.getByTestId("window-map").locator("rect").count()).toBe(496);
  await page.getByTestId("window-map").locator("rect").first().dispatchEvent("click");
  await expect(page.getByTestId("trend-verdict")).toContainText("1981–1995");
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

test("scenario parameters and the evidence report export as files with the computed figures", async ({ page }) => {
  await open(page);
  await page.getByTestId("tab-sim").click();
  await expect(page.getByTestId("sim-summary")).toBeVisible();
  const cap = await capacity(page);
  const read = async (testId: string) => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId(testId).click()]);
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    return { name: dl.suggestedFilename(), text: Buffer.concat(chunks).toString("utf8") };
  };
  const scenario = await read("export-scenario");
  expect(scenario.name).toMatch(/terrapulse-scenario-cat5\.json/);
  const j = JSON.parse(scenario.text);
  expect(j.params.vmaxKt).toBe(140);
  expect(j.note).toMatch(/Not a forecast/);
  const report = await read("export-report");
  expect(report.name).toMatch(/\.md$/);
  expect(report.text).toContain("# TerraPulse scenario report");
  expect(report.text).toContain("HYPOTHETICAL scenario. Not a forecast");
  const stated = Number(report.text.match(/\*\*([\d,]+) b\/d\*\*/)![1].replace(/,/g, "")) / 1e6;
  expect(stated).toBeCloseTo(cap, 2);
  expect(report.text).toContain("cannot be estimated");
});

test("drought what-if: index from NASA regional series, record episodes, honest limits", async ({ page }) => {
  await open(page);
  await page.getByTestId("tab-sim").click();
  await page.getByTestId("hazard-type").selectOption("drought");
  await expect(page.getByTestId("drought-panel")).toBeVisible();
  await expect(page.getByTestId("drought-panel")).toContainText("HYPOTHETICAL");
  await expect(page.getByTestId("timeline")).toBeHidden();
  // default: Murray-Darling, 12 months at 60% of normal
  await expect(page.getByTestId("drought-index")).toContainText(/[+−]\d\.\d\d|below/);
  const first = await page.getByTestId("drought-result").innerText();
  expect(first).toMatch(/of 4[45] years|None of the 4[45] years/);
  expect(await page.getByTestId("drought-episodes").locator("tbody tr").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("drought-analysis")).toContainText("MODIS NDVI");
  await expect(page.getByTestId("drought-analysis")).toContainText("no production dataset is linked yet");
  // severity changes the result: normal rainfall is not a drought, 10% is beyond the record
  await page.evaluate(() => window.__tpStore.getState().setDrought({ fraction: 1 }));
  await expect(page.getByTestId("drought-class")).toHaveText("not in drought");
  await page.evaluate(() => window.__tpStore.getState().setDrought({ fraction: 0.1 }));
  await expect(page.getByTestId("drought-class")).toHaveText("drier than any year in the record");
  await expect(page.getByTestId("drought-result")).toContainText("Insufficient validated data");
  // duration control recalculates
  await page.evaluate(() => window.__tpStore.getState().setDrought({ fraction: 0.6 }));
  const k12 = await page.getByTestId("drought-result").innerText();
  await page.getByTestId("dk-3").click();
  await expect.poll(async () => await page.getByTestId("drought-result").innerText()).not.toBe(k12);
  // the Amazon box carries the documented data warning
  await page.getByTestId("drought-region").selectOption("rondonia");
  await expect(page.getByTestId("drought-known-issue")).toContainText("2005");
  // back to the hurricane scenario
  await page.getByTestId("hazard-type").selectOption("hurricane");
  await expect(page.getByTestId("sim-panel")).toBeVisible();
  await expect(page.getByTestId("timeline")).toBeVisible();
  expect(errors.get(page)).toEqual([]);
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
