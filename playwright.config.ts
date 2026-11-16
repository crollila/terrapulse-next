import { defineConfig } from "@playwright/test";

// Browser tests run against the production build (vite preview), or against a deployed URL when
// TP_BASE_URL is set, e.g. TP_BASE_URL=https://crollila.github.io/terrapulse-next/ npm run test:e2e
const external = process.env.TP_BASE_URL;

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
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] },
    trace: "retain-on-failure",
  },
  webServer: external
    ? undefined
    : {
        command: "npm run preview -- --port 4173 --strictPort",
        url: "http://localhost:4173/",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
