import { expect, test, type Page } from "@playwright/test";

/**
 * Browser tests for the hazard extensions: the observed rainfall record (Hurricane Harvey), its
 * hindcast, its economic network, and the R-CLIPER context line in the wind scenario.
 * Kept apart from app.spec.ts so the two workstreams do not edit the same file.
 */
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

async function openRain(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("globe")).toBeVisible();
  await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0);
  await page.getByTestId("tab-sim").click();
  await page.getByTestId("hazard-type").selectOption("rainfall");
  await expect(page.getByTestId("rain-panel")).toBeVisible();
  await expect(page.getByTestId("rain-capacity")).toContainText(/\d\.\d\d/, { timeout: 30_000 });
}

const setRain = (page: Page, r: Record<string, unknown>) => page.evaluate((x) => window.__tpStore.getState().setRain(x), r);

test.describe("observed rainfall record: Hurricane Harvey", () => {
  test("opens from the simulator with observed figures, sources and limits", async ({ page }) => {
    await openRain(page);
    await expect(page.getByTestId("rain-panel")).toContainText("OBSERVED");
    await expect(page.getByTestId("rain-capacity")).toContainText("4.40");
    await expect(page.getByTestId("rain-counts")).toContainText("16 refineries · 6 ports");
    await expect(page.getByTestId("rain-summary")).toContainText("not flood depth, damage, shutdown or lost production");
    await expect(page.getByTestId("rain-timeline")).toBeVisible();
    await expect(page.getByTestId("timeline")).toBeHidden();
    await expect(page.getByTestId("rain-stage")).toHaveText("Rainfall through 2 Sep 2017");
    // wind against rainfall against the DOE count
    await expect(page.getByTestId("wind-64-cap")).toHaveText("0.00");
    await expect(page.getByTestId("either-cap")).toHaveText("4.40");
    await expect(page.getByTestId("doe-cap")).toHaveText("3.87");
    // uncertainty is stated, not hidden
    await expect(page.getByTestId("rain-uncertainty")).toContainText("3.27 to 5.02 million b/d");
    // evidence panel: record facts and data sources
    await expect(page.getByTestId("rain-analysis")).toContainText("2,364 marks in Texas and Louisiana");
    await expect(page.getByTestId("rain-analysis")).toContainText("1379 mm (54.3 in)");
    await page.getByTestId("rain-tab-limits").click();
    await expect(page.getByTestId("rain-analysis")).toContainText("No flood depth, inundation extent, damage or shutdown is estimated");
    await expect(page.getByTestId("rain-analysis")).toContainText("NOAA National Weather Service");
    await expect(page.getByTestId("doe-method")).toContainText("It did not name them");
    expect(errors.get(page)).toEqual([]);
  });

  test("the map draws the rainfall field, track, wind radii, high-water marks and classified sites", async ({ page }) => {
    await openRain(page);
    await page.waitForFunction(() => !!window.__tpMap.getLayer("rain-field") && !!window.__tpMap.getLayer("rain-sites"), undefined, { timeout: 30_000 });
    const vis = (id: string) => page.evaluate((l) => window.__tpMap.getLayoutProperty(l, "visibility") ?? "visible", id);
    for (const id of ["rain-field", "rain-hwm", "rain-track", "rain-sites"]) expect(await vis(id)).toBe("visible");
    await expect.poll(async () => page.evaluate(() => window.__tpMap.querySourceFeatures("rain-sites").length), { timeout: 30_000 }).toBeGreaterThan(20);
    await expect.poll(async () => page.evaluate(() => window.__tpMap.querySourceFeatures("rain-hwm").length), { timeout: 30_000 }).toBeGreaterThan(100);
    // a mid-storm time: the storm has a position and 34-kt radii, and they are drawn
    await setRain(page, { hours: 96 });
    await expect(page.getByTestId("rain-clock")).toContainText("27 Aug, 12:00 UTC · Tropical storm");
    await expect.poll(async () => page.evaluate(() => window.__tpMap.querySourceFeatures("rain-center").length)).toBeGreaterThan(0);
    await expect.poll(async () => page.evaluate(() => window.__tpMap.querySourceFeatures("rain-wind").length)).toBeGreaterThan(0);
    // layer switches
    await page.getByTestId("rain-showField").click();
    expect(await vis("rain-field")).toBe("none");
    await page.getByTestId("rain-showMarks").click();
    expect(await vis("rain-hwm")).toBe("none");
    await page.getByTestId("rain-showField").click();
    expect(await vis("rain-field")).toBe("visible");
    // leaving the view hides its layers; the wind scenario is untouched
    await page.getByTestId("hazard-type").selectOption("hurricane");
    await expect(page.getByTestId("sim-panel")).toBeVisible();
    expect(await vis("rain-field")).toBe("none");
    expect(await vis("rain-sites")).toBe("none");
    await expect(page.getByTestId("capacity-in-footprint")).toContainText(/\d\.\d\d/);
    expect(errors.get(page)).toEqual([]);
  });

  test("timeline, threshold and Atlas 14 bounds recalculate the screen", async ({ page }) => {
    await openRain(page);
    // three complete days (through 26 August): no refinery has reached the 100-year depth yet
    await setRain(page, { hours: 72 });
    await expect(page.getByTestId("rain-stage")).toHaveText("Rainfall through 26 Aug 2017");
    await expect(page.getByTestId("rain-capacity")).toContainText("0.00");
    await expect(page.getByTestId("rain-summary")).toContainText("No refinery has reached this depth");
    // by the DOE Update #9 time (12:00 UTC 30 August) most of the Houston to Port Arthur plants have
    await setRain(page, { hours: 168 });
    await expect(page.getByTestId("rain-stage")).toHaveText("Rainfall through 30 Aug 2017");
    await expect(page.getByTestId("rain-capacity")).toContainText("4.40");
    // a stricter threshold and the conservative reading both shrink the screen
    await page.getByTestId("ari-1000").click();
    const strict = Number((await page.getByTestId("rain-capacity").innerText()).match(/\d+\.\d\d/)![0]);
    expect(strict).toBeGreaterThan(0);
    expect(strict).toBeLessThan(4.4);
    await page.getByTestId("ari-100").click();
    await page.getByTestId("reading-conservative").click();
    const cons = Number((await page.getByTestId("rain-capacity").innerText()).match(/\d+\.\d\d/)![0]);
    expect(cons).toBeLessThan(4.4);
    await page.getByTestId("reading-liberal").click();
    const lib = Number((await page.getByTestId("rain-capacity").innerText()).match(/\d+\.\d\d/)![0]);
    expect(lib).toBeGreaterThanOrEqual(4.4);
    await page.getByTestId("rain-reset").click();
    await expect(page.getByTestId("rain-capacity")).toContainText("4.40");
    // play advances real time; rewind returns to the start
    await page.getByTestId("rain-rewind").click();
    await expect(page.getByTestId("rain-stage")).toHaveText("No rainfall day complete yet");
    await page.getByTestId("rain-play").click();
    await expect.poll(async () => page.evaluate(() => window.__tpStore.getState().rain.hours), { timeout: 20_000 }).toBeGreaterThan(20);
    await page.getByTestId("rain-play").click();
    const h1 = await page.evaluate(() => window.__tpStore.getState().rain.hours);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__tpStore.getState().rain.hours)).toBe(h1);
    expect(errors.get(page)).toEqual([]);
  });

  test("a site shows its rainfall, Atlas 14 comparison, terrain, flood evidence and DOE status", async ({ page }) => {
    await openRain(page);
    await page.evaluate(() => window.__tpStore.getState().select({ type: "refinery", id: "eia-507-texas-port-arthur" }));
    const site = page.getByTestId("rain-site");
    await expect(site).toContainText("Port Arthur refinery");
    await expect(page.getByTestId("rain-site-total")).toHaveText("1222 mm (48.1 in)");
    await expect(site).toContainText("IMERG 601 mm · MERRA-2 646 mm");
    await expect(page.getByTestId("rain-site-table").locator("tbody tr")).toHaveCount(5);
    await expect(page.getByTestId("rain-site-table")).toContainText("≥ 1,000 yr");
    await expect(site).toContainText("Ground elevation at the site point");
    await expect(site).toContainText("FEMA flood zone at the site point");
    await expect(site).toContainText("USGS high-water marks within 5 km");
    await expect(page.getByTestId("rain-site-doe")).toContainText("Counted as shut from Update #9");
    await expect(site).toContainText("Flood depth, damage or shutdown at this site");
    await expect(site).toContainText("Not estimated");
    // a refinery DOE did not count, and one whose 2017 entry covers two of today's plants
    await page.evaluate(() => window.__tpStore.getState().select({ type: "refinery", id: "eia-83-texas-port-arthur" }));
    await expect(page.getByTestId("rain-site-doe")).toContainText("Not in DOE's shut count through Update #9");
    await page.evaluate(() => window.__tpStore.getState().select({ type: "refinery", id: "eia-205-texas-corpus-christi-east" }));
    await expect(page.getByTestId("rain-site-doe")).toContainText("Counted as shut from Update #1");
    // a refinery outside the record area says so instead of showing nothing
    await page.evaluate(() => {
      const s = window.__tpStore.getState();
      const far = s.refineries.find((r: any) => r.state === "California");
      s.select({ type: "refinery", id: far.id });
    });
    await expect(page.getByTestId("rain-analysis")).toContainText("outside the area of the rainfall record");
    expect(errors.get(page)).toEqual([]);
  });

  test("hindcast table reproduces the documented comparison with the DOE count", async ({ page }) => {
    await openRain(page);
    const cells = async (key: string) => (await page.getByTestId(`hc-${key}`).locator("td.n").allInnerTexts()).map(Number);
    await expect(page.getByTestId("rain-hindcast")).toContainText("counted 15 refineries shut or shutting down, 3,871,449 b/d");
    await expect(page.getByTestId("rain-hindcast")).toContainText("DOE names none of them");
    expect(await cells("wind64")).toEqual([0, 0, 14, 0]);
    expect(await cells("wind50")).toEqual([6, 5, 9, 1]);
    expect(await cells("wind34")).toEqual([25, 14, 0, 11]);
    expect(await cells("rain")).toEqual([14, 8, 6, 6]);
    expect(await cells("wind50orRain")).toEqual([20, 13, 1, 7]);
    await expect(page.getByTestId("rain-hindcast")).toContainText("does not validate a predictor");
    // the hindcast follows the chosen threshold; nothing is fixed to the favourable one
    await page.getByTestId("ari-1000").click();
    expect(await cells("rain")).toEqual([8, 4, 10, 4]);
    expect(errors.get(page)).toEqual([]);
  });

  test("economic network: sites to operators to commodities, with evidence on every link", async ({ page }) => {
    await openRain(page);
    await page.getByTestId("rain-tab-network").click();
    const net = page.getByTestId("rain-network");
    await expect(net.locator('[data-node="hazard"]')).toContainText("Hurricane Harvey rainfall");
    await expect(net.locator('[data-node="act:refining"]')).toContainText("4.40 million b/d in screen");
    await expect(net.locator('[data-node="com:gasoline"]')).toBeVisible();
    await expect(net.locator('[data-node="fund:XLE"]')).toBeVisible();
    await net.locator('[data-node="co:EXXON MOBIL CORP"]').click();
    await expect(page.getByTestId("rain-node-detail")).toContainText("Share of the company's U.S. refining capacity");
    await expect(page.getByTestId("rain-node-detail")).toContainText("Cannot be estimated");
    // an edge shows what it means and where it comes from
    await page.evaluate(() => window.__tpStore.getState().select({ type: "edge", id: "act:ports>com:crude" }));
    await expect(page.getByTestId("rain-edge-detail")).toContainText("RESEARCH HYPOTHESIS");
    await expect(page.getByTestId("rain-edge-detail")).toContainText("No size, timing or price effect is claimed");
    await page.evaluate(() => window.__tpStore.getState().select({ type: "edge", id: "hazard>asset:eia-507-texas-port-arthur" }));
    await expect(page.getByTestId("rain-edge-detail")).toContainText("Rare rainfall is not flooding or damage");
    // operators and the portfolio screen
    await expect(page.getByTestId("rain-operators")).toContainText("Exxon Mobil");
    await page.getByTestId("rain-portfolio-input").fill("XOM 50\nAAPL 50");
    await expect(page.getByTestId("rain-pf-direct")).toHaveText("50.0%");
    await expect(page.getByTestId("rain-portfolio")).toContainText("not a loss, return or price forecast");
    // the recorded impacts and the evidence classes are kept apart
    await expect(page.getByTestId("rain-recorded")).toContainText("DOE: capacity counted as shut");
    await expect(page.getByTestId("rain-layers-of-evidence")).toContainText("Cannot be estimated from this evidence");
    // before any rain there is nothing to connect
    await setRain(page, { hours: 0 });
    await expect(net).toContainText("No refinery or port is in the screen");
    expect(errors.get(page)).toEqual([]);
  });
});

test("wind scenario: R-CLIPER rainfall is context only, the rule of thumb is labelled, methods list the new models", async ({ page }) => {
  await page.goto("./");
  await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0);
  await page.getByTestId("tab-sim").click();
  await expect(page.getByTestId("sim-panel")).toContainText("rule of thumb");
  await expect(page.getByTestId("sim-panel")).toContainText("Not a model result");
  await page.evaluate(() => window.__tpStore.getState().select({ type: "refinery", id: "eia-163-texas-baytown" }));
  await expect(page.getByTestId("rcliper-rain")).toContainText(/\d+ mm \(\d+\.\d in\)/);
  await expect(page.getByTestId("inspector-detail")).toContainText("Context only: not used in any count");
  await expect(page.getByTestId("inspector-detail")).toContainText("about one sixth of the observed rainfall");
  // the shortcut to the observed record
  await page.getByTestId("open-rain-record").click();
  await expect(page.getByTestId("rain-panel")).toBeVisible();
  await page.getByTestId("methods-btn").click();
  const methods = page.getByTestId("methods-modal");
  await expect(methods).toContainText("Observed-rainfall exposure screen v0.1");
  await expect(methods).toContainText("R-CLIPER rainfall climatology (context only)");
  await expect(page.getByTestId("rain-hindcast-card")).toContainText("it is not a shutdown predictor");
  await expect(methods).toContainText("NOAA Atlas 14");
  expect(errors.get(page)).toEqual([]);
});

test("rainfall view is usable on a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRain(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByTestId("rain-timeline")).toBeVisible();
  await expect(page.getByTestId("rain-capacity")).toContainText("4.40");
  expect(errors.get(page)).toEqual([]);
});
