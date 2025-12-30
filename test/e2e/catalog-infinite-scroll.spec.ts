import { test, expect, type Page } from '@playwright/test';

const getRenderedCount = async (page: Page) =>
  page.evaluate(() => document.querySelectorAll('#product-container [data-product-id]').length);

test.describe('catalog infinite scroll', () => {
  test('home page loads all products on scroll', async ({ page }) => {
    await page.goto('/?http=on', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__APP_READY__ === true);
    await page.waitForFunction(
      () => document.querySelectorAll('#product-container [data-product-id]').length > 0
    );

    const total = await page.evaluate(() => {
      const container = document.getElementById('product-container');
      const value = container?.dataset?.totalProducts;
      return value ? Number(value) : 0;
    });
    expect(total).toBeGreaterThan(0);

    let currentCount = await getRenderedCount(page);
    const maxScrolls = Math.max(10, Math.ceil(total / 8) + 8);

    for (let i = 0; i < maxScrolls && currentCount < total; i += 1) {
      await page.evaluate(() => {
        const sentinel = document.getElementById('catalog-sentinel');
        if (sentinel) {
          sentinel.scrollIntoView({ behavior: 'auto', block: 'end' });
        } else {
          window.scrollTo(0, document.body.scrollHeight);
        }
      });

      await page.evaluate(() => {
        const loadMoreButton = document.getElementById('catalog-load-more');
        if (!loadMoreButton) {
          return;
        }
        if (loadMoreButton.classList.contains('d-none') || loadMoreButton.hasAttribute('disabled')) {
          return;
        }
        loadMoreButton.click();
      });

      try {
        await page.waitForFunction(
          (prev) =>
            document.querySelectorAll('#product-container [data-product-id]').length > prev,
          currentCount,
          { timeout: 3000 }
        );
      } catch {
        // Continue; we will re-check count below.
      }

      currentCount = await getRenderedCount(page);
    }

    expect(currentCount).toBe(total);
  });
});
