import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 8080);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  timeout: 60_000,
  use: {
    baseURL,
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `node scripts/dev-server.mjs`,
    url: baseURL,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
    },
  },
});
