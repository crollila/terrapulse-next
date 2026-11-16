// One-off element screenshot helper for visual review.
//   node scripts/shot.mjs <url> <out.png> "<js that sets up state, using s = window.__tpStore>" "<css selector to capture>" [width height]
import { chromium } from "@playwright/test";

const [url, out, setup, selector, w = "1440", h = "900"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.goto(url);
await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 90_000 });
await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0);
if (setup) await page.evaluate((f) => new Function("s", f)(window.__tpStore), setup);
await page.waitForTimeout(3500);
const target = selector ? page.locator(selector).first() : page;
if (selector) await target.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await target.screenshot({ path: out });
await browser.close();
console.log(out);
