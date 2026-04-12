import { expect, test } from '@playwright/test';

async function waitForReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

test('mobile home top section stays compact', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);

  // Trust strip switches to compact layout at ≤767px
  await expect(page.locator('.trust-strip--full')).toBeHidden();
  await expect(page.locator('.trust-strip--compact')).toBeVisible();

  // Hero section and primary CTA are present
  const hero = page.locator('.home-overview');
  await expect(hero).toBeVisible();
  await expect(page.locator('.home-overview__cta')).toBeVisible();

  // Hero section stays compact — must not dominate the viewport
  const heroBox = await hero.boundingBox();
  expect(heroBox?.height).toBeLessThan(300);

  // Category shortcuts section is visible
  await expect(page.locator('.home-section--mobile-shortcuts')).toBeVisible();

  // No horizontal overflow on the mobile viewport
  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(390);
});
