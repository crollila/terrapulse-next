import { expect, test, type Page } from "@playwright/test";

/** Browser tests for the wildfire observed record: three fires, timeline, proximity screen, network. */
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

async function openFire(page: Page) {
  await page.goto("./");
  await expect(page.getByTestId("globe")).toBeVisible();
  await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0);
  await page.getByTestId("tab-sim").click();
  await page.getByTestId("hazard-type").selectOption("wildfire");
  await expect(page.getByTestId("fire-panel")).toBeVisible();
  await expect(page.getByTestId("fire-acres")).toContainText(/\d/, { timeout: 30_000 });
}

const setFire = (page: Page, f: Record<string, unknown>) => page.evaluate((x) => window.__tpStore.getState().setFire(x), f);
const count = (page: Page, source: string) => page.evaluate((s) => window.__tpMap.querySourceFeatures(s).length, source);

test.describe("wildfire observed record", () => {
  test("opens on the Camp Fire with observed figures, sourced facts and an explicit no-simulation statement", async ({ page }) => {
    await openFire(page);
    await expect(page.getByTestId("fire-panel")).toContainText("OBSERVED");
    await expect(page.getByTestId("fire-acres")).toContainText("153,336");
    await expect(page.getByTestId("fire-summary")).toContainText("Observed, not simulated");
    await expect(page.getByTestId("fire-stage")).toHaveText("8,636 of 8,636 satellite detections");
    await expect(page.getByTestId("timeline")).toBeHidden();
    await expect(page.getByTestId("rain-timeline")).toBeHidden();
    // the hazard list says plainly that spread simulation is not offered
    await expect(page.getByTestId("hazard-type")).toContainText("Wildfire spread simulation · not offered (no validated model)");
    // facts with their sources; the cause is withheld because no source could be checked
    const facts = page.getByTestId("fire-facts");
    await expect(page.getByTestId("fire-start")).toContainText("8 Nov 2018, 14:33 UTC");
    await expect(facts).toContainText("18,804");
    await expect(facts).toContainText("26,218 in the 2010 Census; 4,764 in the 2020 Census");
    await expect(facts).not.toContainText("Cause");
    await expect(page.getByTestId("fire-gaps")).toContainText("the cause of the Camp Fire is therefore not stated here");
    // conditions are labelled as a gridded estimate
    await expect(page.getByTestId("fire-conditions-day")).toContainText("gridMET estimate for 2018-11-08: energy release component 89");
    await expect(page.getByTestId("fire-analysis")).toContainText("not a station reading");
    // the two records agree, and the check is described as a consistency check
    await expect(page.getByTestId("fire-agreement")).toContainText("8,602 of 8,636 satellite detections (99.6%)");
    await expect(page.getByTestId("fire-agreement")).toContainText("It is not a test of a forecast");
    await page.getByTestId("fire-tab-limits").click();
    await expect(page.getByTestId("fire-analysis")).toContainText("No fire-spread simulation");
    await expect(page.getByTestId("fire-analysis")).toContainText("NASA FIRMS");
    expect(errors.get(page)).toEqual([]);
  });

  test("the map replays detections and mapped perimeters; layer switches work", async ({ page }) => {
    await openFire(page);
    await page.waitForFunction(() => !!window.__tpMap.getLayer("wf-det") && !!window.__tpMap.getLayer("wf-final-line"), undefined, { timeout: 30_000 });
    const vis = (id: string) => page.evaluate((l) => window.__tpMap.getLayoutProperty(l, "visibility") ?? "visible", id);
    await expect.poll(() => count(page, "wf-final"), { timeout: 30_000 }).toBeGreaterThan(0);
    await expect.poll(() => count(page, "wf-det"), { timeout: 30_000 }).toBeGreaterThan(500);
    // before the first overpass nothing has been detected and no perimeter is mapped
    await setFire(page, { hours: 0 });
    await expect(page.getByTestId("fire-stage")).toHaveText("0 of 8,636 satellite detections");
    await expect(page.getByTestId("fire-now")).toContainText("no perimeter mapped yet");
    await expect.poll(() => count(page, "wf-det")).toBe(0);
    await expect.poll(() => count(page, "wf-now")).toBe(0);
    // forty hours in: the infrared perimeter of 9 November and several overpasses
    await setFire(page, { hours: 40 });
    await expect(page.getByTestId("fire-stage")).toHaveText("3,541 of 8,636 satellite detections");
    await expect(page.getByTestId("fire-now")).toContainText("latest mapped perimeter 111,552 acres");
    await expect.poll(() => count(page, "wf-now")).toBeGreaterThan(0);
    await expect.poll(() => count(page, "wf-det")).toBeGreaterThan(100);
    // switches
    await page.getByTestId("fire-showDetections").click();
    expect(await vis("wf-det")).toBe("none");
    await page.getByTestId("fire-showPerimeters").click();
    expect(await vis("wf-final-line")).toBe("none");
    await page.getByTestId("fire-showInfra").click();
    expect(await vis("wf-plants")).toBe("none");
    // play advances, pause holds, reset returns to the end of the record
    await page.getByTestId("fire-rewind").click();
    await page.getByTestId("fire-play").click();
    await expect.poll(async () => page.evaluate(() => window.__tpStore.getState().fire.hours), { timeout: 20_000 }).toBeGreaterThan(20);
    await page.getByTestId("fire-play").click();
    await page.getByTestId("fire-reset").click();
    await expect(page.getByTestId("fire-stage")).toHaveText("8,636 of 8,636 satellite detections");
    // leaving the view hides its layers
    await page.getByTestId("hazard-type").selectOption("hurricane");
    await expect(page.getByTestId("sim-panel")).toBeVisible();
    expect(await vis("wf-origin")).toBe("none");
    expect(errors.get(page)).toEqual([]);
  });

  test("proximity screen: distance changes what is listed, and distance is never called damage", async ({ page }) => {
    await openFire(page);
    await expect(page.getByTestId("fire-mw")).toHaveText("194");
    await expect(page.getByTestId("fire-tx")).toHaveText("238");
    await expect(page.getByTestId("fire-screen")).toContainText("4 plants inside the mapped perimeter");
    await expect(page.getByTestId("fire-screen")).toContainText("distance is not damage");
    await expect(page.getByTestId("fire-refineries")).toContainText("No refinery or principal port is inside the mapped perimeter");
    await page.getByTestId("fire-buf-10").click();
    await expect(page.getByTestId("fire-mw")).toHaveText("1,319");
    await expect(page.getByTestId("fire-screen")).toContainText("16 plants within 10 km");
    // a plant's detail says what is known and what is not
    await page.evaluate(() => {
      const s = window.__tpStore.getState();
      s.select({ type: "plant", id: "eia-plant-" + 1 });
    });
    await page.getByTestId("fire-buf-0").click();
    await page.getByTestId("fire-screen").locator(".list-btn").first().click();
    await expect(page.getByTestId("fire-plant")).toContainText("Poe power plant");
    await expect(page.getByTestId("fire-plant")).toContainText("Inside the perimeter");
    await expect(page.getByTestId("fire-plant")).toContainText("Not estimated");
    expect(errors.get(page)).toEqual([]);
  });

  test("the other two fires load with their own records, quotes and gaps", async ({ page }) => {
    await openFire(page);
    await page.getByTestId("fire-event").selectOption("smokehouse-creek-2024");
    await expect(page.getByTestId("fire-acres")).toContainText("1,054,153");
    await expect(page.getByTestId("fire-stage")).toHaveText("5,701 of 5,701 satellite detections");
    await expect(page.getByTestId("fire-facts")).toContainText("downed power poles owned by Xcel Energy");
    await expect(page.getByTestId("fire-facts")).toContainText("Texas House of Representatives");
    await expect(page.getByTestId("fire-gaps")).toContainText("656 of 5701 detections lie more than 2 km outside");
    await expect(page.getByTestId("fire-gaps")).toContainText("No dated perimeters are published for this fire");
    await page.getByTestId("fire-buf-10").click();
    await expect(page.getByTestId("fire-refineries")).toContainText("Borger refinery");
    await expect(page.getByTestId("fire-refineries")).toContainText("7.8 km from the perimeter");
    await page.getByTestId("fire-event").selectOption("marshall-2021");
    await expect(page.getByTestId("fire-acres")).toContainText("6,080");
    await expect(page.getByTestId("fire-facts")).toContainText("Undetermined");
    await expect(page.getByTestId("fire-facts")).toContainText("1,084 homes");
    await expect(page.getByTestId("fire-facts")).toContainText("1,109 homes destroyed");
    await expect(page.getByTestId("fire-gaps")).toContainText("Satellite detections begin 3.2 hours before the discovery time");
    // switching fire resets the distance-independent state and the timeline
    await expect(page.getByTestId("fire-stage")).toHaveText("186 of 186 satellite detections");
    expect(errors.get(page)).toEqual([]);
  });

  test("economic network: assets near the fire, evidence on every link, no financial claim", async ({ page }) => {
    await openFire(page);
    await page.getByTestId("fire-tab-network").click();
    const net = page.getByTestId("fire-network");
    await expect(net.locator('[data-node="hazard"]')).toContainText("Camp Fire");
    await expect(net.locator('[data-node="act:power"]')).toContainText("194 MW inside");
    await expect(net.locator('[data-node="asset:transmission"]')).toContainText("238 km inside the perimeter");
    await expect(net.locator('[data-node="ind:utilities"]')).toBeVisible();
    await net.locator('[data-node="asset:transmission"]').click();
    await expect(page.getByTestId("rain-node-detail")).toContainText("Pacific Gas & Electric Company");
    await expect(page.getByTestId("rain-node-detail")).toContainText("Not estimated");
    await page.evaluate(() => window.__tpStore.getState().select({ type: "edge", id: "hazard>asset:transmission" }));
    await expect(page.getByTestId("rain-edge-detail")).toContainText("MODELED");
    await expect(page.getByTestId("fire-claims")).toContainText("Insufficient validated data for wildfire");
    // Smokehouse Creek at 10 km brings in the refinery network through the shared builder
    await page.getByTestId("fire-event").selectOption("smokehouse-creek-2024");
    await page.getByTestId("fire-buf-10").click();
    await expect(net.locator('[data-node="act:refining"]')).toBeVisible();
    await expect(net.locator('[data-node="com:gasoline"]')).toBeVisible();
    expect(errors.get(page)).toEqual([]);
  });

  test("methods list the wildfire card; the view is usable on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFire(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("fire-timeline")).toBeVisible();
    await page.getByTestId("methods-btn").click();
    await expect(page.getByTestId("methods-modal")).toContainText("Wildfire observed record and proximity screen v0.1");
    await expect(page.getByTestId("fire-validation-card")).toContainText("99.6% (Camp)");
    expect(errors.get(page)).toEqual([]);
  });
});
