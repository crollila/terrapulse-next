import { defineConfig, devices } from "@playwright/test";

// Browser tests run against the production build (vite preview), or against a deployed URL when
// TP_BASE_URL is set, e.g. TP_BASE_URL=https://crollila.github.io/terrapulse-next/ npm run test:e2e
// Chromium is the default. TP_BROWSERS=all adds Firefox and WebKit (npx playwright install firefox webkit).
const external = process.env.TP_BASE_URL;
const all = process.env.TP_BROWSERS === "all";
const viewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 2,
  retries: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e.json" }]],
  use: {
    baseURL: external ?? "http://localhost:4173/",
    viewport,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport, launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] } },
    },
    ...(all
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"], viewport, launchOptions: { firefoxUserPrefs: { "webgl.force-enabled": true, "webgl.disabled": false } } } },
          { name: "webkit", use: { ...devices["Desktop Safari"], viewport } },
        ]
      : []),
  ],
  webServer: external
    ? undefined
    : {
        command: "npm run preview -- --port 4173 --strictPort",
        url: "http://localhost:4173/",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
