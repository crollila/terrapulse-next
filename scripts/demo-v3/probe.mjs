// Capture probe: how many screencast frames per second, and at what size, does each launch
// configuration give? Used to pick the recording settings for the V3 demo.
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "https://crollila.github.io/terrapulse-next/";
const configs = {
  swiftshader: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
  gpu: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-webgl"],
};
const dsf = Number(process.argv[3] ?? 1.6);
for (const [name, args] of Object.entries(configs)) {
  const browser = await chromium.launch({ args });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: dsf });
    const page = await ctx.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.__tpStore?.getState().mapReady === true, undefined, { timeout: 60_000 });
    const renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
    });
    const cdp = await ctx.newCDPSession(page);
    let n = 0;
    let bytes = 0;
    let dims = "";
    cdp.on("Page.screencastFrame", async (f) => {
      n++;
      bytes += f.data.length * 0.75;
      dims = `${f.metadata.deviceWidth}x${f.metadata.deviceHeight} css; `;
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, everyNthFrame: 1 });
    const t0 = Date.now();
    while (Date.now() - t0 < 4000) {
      await page.evaluate(() => {
        const m = window.__tpMap;
        const c = m.getCenter();
        m.jumpTo({ center: [c.lng + 0.6, c.lat] });
      });
      await new Promise((r) => setTimeout(r, 30));
    }
    await cdp.send("Page.stopScreencast");
    const shot = await page.screenshot({ type: "jpeg", quality: 80 });
    console.log(`${name}: renderer=${renderer}; ${n} frames in 4 s (${(n / 4).toFixed(1)} fps); ${dims}avg ${(bytes / Math.max(1, n) / 1024).toFixed(0)} kB; screenshot ${(shot.length / 1024).toFixed(0)} kB`);
  } catch (e) {
    console.log(`${name}: FAILED ${String(e.message).slice(0, 160)}`);
  }
  await browser.close();
}
