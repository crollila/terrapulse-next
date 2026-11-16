// Screenshots of the hazard extensions (observed rainfall, wildfire, R-CLIPER context) from the real app.
//   node scripts/capture-hazards.mjs <url> [outDir]
// Each scenario is a state set through the app's own store, exactly what a user can reach by clicking.
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const [url = "http://localhost:4173/", outDir = "docs/screenshots/sim"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(url);
await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 90_000 });
await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0);

const settle = async (ms = 3500) => {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise((r) => (window.__tpMap.loaded() ? r() : window.__tpMap.once("idle", r))));
  await page.waitForTimeout(600);
};
const shot = async (name) => {
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(`${outDir}/${name}.png`);
};
const S = (fn, arg) => page.evaluate(fn, arg);

// 1. Observed rainfall, whole record
await S(() => {
  const s = window.__tpStore.getState();
  s.setTab("sim");
  s.setHazard("rainfall");
});
await page.getByTestId("rain-capacity").waitFor();
await settle(5000);
await shot("01-rainfall-harvey-whole-record");

// 2. Mid-storm: 12 UTC 27 August, wind radii and track
await S(() => window.__tpStore.getState().setRain({ hours: 96 }));
await settle(1500);
await shot("02-rainfall-27-august-wind-radii");

// 3. A site's evidence: Motiva Port Arthur at the DOE Update #9 time
await S(() => {
  const s = window.__tpStore.getState();
  s.setRain({ hours: 168 });
  s.select({ type: "refinery", id: "eia-507-texas-port-arthur" });
});
await settle(1500);
await shot("03-rainfall-site-evidence-port-arthur");

// 4. Hindcast table
await S(() => {
  const s = window.__tpStore.getState();
  s.select(null);
  s.setRain({ hours: 240 });
});
await page.getByTestId("rain-hindcast").scrollIntoViewIfNeeded();
await settle(1000);
await shot("04-rainfall-hindcast-against-doe");

// 5. Economic network
await page.getByTestId("rain-tab-network").click();
await page.locator('[data-node="co:EXXON MOBIL CORP"]').click();
await settle(1500);
await shot("05-rainfall-economic-network");

// 6. Wildfire: Camp Fire, forty hours in
await S(() => {
  const s = window.__tpStore.getState();
  s.select(null);
  s.setHazard("wildfire");
});
await page.getByTestId("fire-acres").waitFor();
await settle(4500);
await S(() => window.__tpStore.getState().setFire({ hours: 40 }));
await settle(1500);
await shot("06-wildfire-camp-fire-40-hours");

// 7. Wildfire: Smokehouse Creek, 10 km screen, network
await S(() => window.__tpStore.getState().setFire({ eventId: "smokehouse-creek-2024" }));
await page.getByTestId("fire-acres").filter({ hasText: "1,054,153" }).waitFor();
await S(() => window.__tpStore.getState().setFire({ bufferKm: 10 }));
await page.getByTestId("fire-tab-network").click();
await settle(5000);
await shot("07-wildfire-smokehouse-creek-network");

// 8. Wildfire: Marshall Fire evidence
await page.getByTestId("fire-tab-evidence").click();
await S(() => window.__tpStore.getState().setFire({ eventId: "marshall-2021" }));
await page.getByTestId("fire-acres").filter({ hasText: "6,080" }).waitFor();
await settle(5000);
await shot("08-wildfire-marshall-evidence");

// 9. Wind scenario with the R-CLIPER context line
await S(() => {
  const s = window.__tpStore.getState();
  s.setHazard("hurricane");
  s.setSimPos(0.45);
  s.select({ type: "refinery", id: "eia-163-texas-baytown" });
});
await page.getByTestId("rcliper-rain").scrollIntoViewIfNeeded();
await settle(4000);
await shot("09-wind-scenario-rcliper-context");

// 10. Methods: the new model cards
await page.getByTestId("methods-btn").click();
await page.getByTestId("rain-hindcast-card").scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await shot("10-methods-rainfall-card");

console.log("page errors:", JSON.stringify(errors));
await browser.close();
