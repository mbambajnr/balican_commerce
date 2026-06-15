import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const frontendPort = 3100;
const backendPort = 4100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: isCI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: `http://localhost:${frontendPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `PORT=${backendPort} NODE_ENV=test npm run start`,
      cwd: "../backend",
      url: `http://localhost:${backendPort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `NEXT_DIST_DIR=.next-e2e AUTH_URL=http://localhost:${frontendPort} BACKEND_API_URL=http://127.0.0.1:${backendPort}/api npx next start -p ${frontendPort}`,
      cwd: ".",
      url: `http://localhost:${frontendPort}/auth/login`,
      reuseExistingServer: !isCI,
      timeout: 240_000,
    },
  ],
});
