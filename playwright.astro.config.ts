import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 8081);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const webServerCommand = 'npm --prefix astro-poc run build && node scripts/dev-server.mjs astro-poc/dist';

export default defineConfig({
  testDir: 'test/e2e-astro',
  fullyParallel: false,
  timeout: 60_000,
  use: {
    baseURL,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      PORT: String(PORT),
    },
  },
});
