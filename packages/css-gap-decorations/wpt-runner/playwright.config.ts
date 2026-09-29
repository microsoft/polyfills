import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["wpt.spec.ts", "repaint.spec.ts"],
  timeout: 30_000,
  retries: 0,
  fullyParallel: true,
  workers: 4,

  use: {
    baseURL: "http://localhost:3120",
    screenshot: "off",
    trace: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--disable-features=CSSGapDecoration"],
        },
      },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],

  webServer: {
    command: "npx serve wpt-runner/wpt -l 3120 --no-clipboard --cors",
    port: 3120,
    reuseExistingServer: true,
  },
});
