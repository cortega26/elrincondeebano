import { expect, test } from '@playwright/test';

async function waitForReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

test('mobile home top section stays compact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);

  await expect(page).toHaveScreenshot('mobile-home-top.png');
});
