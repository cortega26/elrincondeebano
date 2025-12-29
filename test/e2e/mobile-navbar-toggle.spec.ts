import { test, expect } from '@playwright/test';

test.describe('mobile navbar toggler', () => {
  test('opens and closes the navbar collapse', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-mobile',
      'Only relevant on the mobile viewport'
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const toggler = page.locator('[data-bs-toggle="collapse"][data-bs-target="#navbarNav"]');
    const collapse = page.locator('#navbarNav');

    await expect(toggler).toBeVisible();
    await expect(collapse).not.toHaveClass(/show/);

    await toggler.click();
    await expect(collapse).toHaveClass(/show/);
    await expect(collapse).toBeVisible();

    await toggler.click();
    await expect(collapse).not.toHaveClass(/show/);
  });
});
