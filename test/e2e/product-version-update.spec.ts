import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const dataPath = path.join(process.cwd(), 'data', 'product_data.json');
const baseData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const baseVersion =
  typeof baseData.version === 'string' && baseData.version.trim()
    ? baseData.version.trim()
    : 'base';

async function safeEvaluate<T>(page: Page, fn: () => T | Promise<T>, attempts = 3) {
  for (let i = 0; i < attempts; i += 1) {
    await page.waitForLoadState('domcontentloaded');
    try {
      return await page.evaluate(fn);
    } catch (error) {
      const message = String(error);
      if (i === attempts - 1 || !message.includes('Execution context was destroyed')) {
        throw error;
      }
    }
  }
  return undefined;
}

test.describe('product data version updates', () => {
  test('version bump triggers a single update notification', async ({ page }) => {
    const nextVersion = `${baseVersion}-next`;
    await page.addInitScript((version) => {
      localStorage.setItem('ebano-sw-enable-local', 'true');
      localStorage.setItem('ebano-allow-http-local', 'true');
      localStorage.setItem('productDataVersion', version);
      localStorage.removeItem('ebano-sw-disabled');
      window.__ALLOW_LOCALHOST_HTTP__ = true;
      window.__ENABLE_TEST_HOOKS__ = true;
      window.__DISABLE_SW_RELOAD__ = true;
      window.__updateNotificationCount = 0;
      window.__TEST_UPDATE_VERSION__ = `${version}-next`;
    }, baseVersion);

    await page.goto('/?sw=on&http=on', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => 'serviceWorker' in navigator);
    await safeEvaluate(page, () => navigator.serviceWorker.ready);

    await page.waitForFunction(() => typeof window.__runUpdateCheck === 'function');

    await page.waitForFunction(async () => {
      if (typeof window.__runUpdateCheck === 'function') {
        await window.__runUpdateCheck();
      }
      const stored = window.localStorage.getItem('productDataVersion');
      return stored && stored === window.__TEST_UPDATE_VERSION__;
    });

    const storedVersion = await safeEvaluate(page, () =>
      window.localStorage.getItem('productDataVersion')
    );
    expect(storedVersion).toBe(nextVersion);

    const updateCount = await safeEvaluate(page, () => window.__updateNotificationCount ?? 0);
    expect(updateCount).toBe(1);
  });
});
