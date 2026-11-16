// Lists the elements that stick out past the right edge of the viewport (layout debugging).
//   node scripts/overflow.mjs <url> "<js that sets up state, using s = window.__tpStore>" [width height]
import { chromium } from "@playwright/test";

const [url, setup, w = "390", h = "844"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.goto(url);
await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 90_000 });
await page.waitForFunction(() => window.__tpStore.getState().refineries.length > 0);
if (setup) await page.evaluate((f) => new Function("s", f)(window.__tpStore), setup);
await page.waitForTimeout(3000);
const out = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const rows = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.right > vw + 1) rows.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 50), testid: el.getAttribute("data-testid"), right: Math.round(r.right), width: Math.round(r.width), text: (el.textContent || "").slice(0, 40) });
  }
  return { vw, scrollWidth: document.documentElement.scrollWidth, rows: rows.slice(0, 25) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
