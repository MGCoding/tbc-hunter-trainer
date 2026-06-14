import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev -- --port 4175",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://127.0.0.1:4175",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
