// Screenshots of the showcase (About) for review: desktop sections and a full-length phone page.
//   node scripts/shot-showcase.mjs http://localhost:4173/
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:4173/";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ready = async (page) => {
  await page.goto(`${base}#about`);
  await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 90_000 });
  await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0);
  await page.waitForSelector('[data-testid="sc-numbers-north-slope"]');
  await page.waitForTimeout(3500);
};
const desk = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await ready(desk);
await desk.screenshot({ path: "docs/screenshots/showcase-desktop-1-hero.png" });
for (const [i, id] of [[2, "challenge"], [3, "amazon"], [4, "alaska"], [5, "live"], [6, "simulation"], [7, "team"], [8, "transparency"]]) {
  await desk.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start", behavior: "instant" }), `#sc-${id}`);
  await desk.waitForTimeout(700);
  await desk.screenshot({ path: `docs/screenshots/showcase-desktop-${i}-${id}.png` });
}
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await ready(phone);
await phone.screenshot({ path: "docs/screenshots/showcase-mobile-1-hero.png" });
await phone.evaluate(() => document.querySelector("#sc-amazon")?.scrollIntoView({ block: "start", behavior: "instant" }));
await phone.waitForTimeout(600);
await phone.screenshot({ path: "docs/screenshots/showcase-mobile-2-amazon.png" });
await phone.evaluate(() => document.querySelector("#sc-team")?.scrollIntoView({ block: "start", behavior: "instant" }));
await phone.waitForTimeout(600);
await phone.screenshot({ path: "docs/screenshots/showcase-mobile-3-team.png" });
await browser.close();
console.log("showcase screenshots written to docs/screenshots/");
