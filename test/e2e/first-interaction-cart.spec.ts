import { test, expect } from '@playwright/test';

test.describe('runtime lazy boot', () => {
  test('first add-to-cart click is preserved while runtime initializes', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const firstAddButton = page.locator('.add-to-cart-btn').first();
    await expect(firstAddButton).toBeVisible();

    await firstAddButton.click();

    await expect(page.locator('#cart-count')).toHaveText('1');
    await expect(page.locator('#cart-items .cart-item')).toHaveCount(1);
  });
});
