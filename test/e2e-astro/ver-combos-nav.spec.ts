import { expect, test, type Page } from '@playwright/test';

async function waitForReady(page: Page) {
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

/**
 * Verifies that the "Ver combos" CTA in the home hero actually navigates to the
 * "Combos listos" section and that the IntersectionObserver-driven infinite scroll
 * does NOT expand the catalog during the jump (which would push the bundles section
 * out of view).
 */
test.describe('Ver combos navigation', () => {
  test('desktop: "Ver combos" scrolls to Combos listos without catalog expansion', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForReady(page);

    // Capture catalog visible count BEFORE clicking the button.
    const countBefore = await page.evaluate(
      () => document.querySelectorAll('#product-container [data-product-id]:not(.is-hidden)').length
    );
    expect(countBefore).toBeGreaterThan(0);

    // Click the "Ver combos" CTA.
    await page.locator('[data-home-hero-cta]').click();

    // Wait a moment for any IntersectionObserver side-effects to settle.
    await page.waitForTimeout(600);

    // The bundles heading must be in the viewport.
    const headingVisible = await page.evaluate(() => {
      const el = document.getElementById('home-bundles-heading');
      if (!el) return false;
      const { top, bottom } = el.getBoundingClientRect();
      return top < window.innerHeight && bottom > 0;
    });
    expect(headingVisible).toBe(true);

    // The catalog must NOT have expanded (loadMore must not have fired).
    const countAfter = await page.evaluate(
      () => document.querySelectorAll('#product-container [data-product-id]:not(.is-hidden)').length
    );
    expect(countAfter).toBe(countBefore);
  });

  const MOBILE_VIEWPORTS = [
    { name: '390x844', width: 390, height: 844 },
    { name: '360x800', width: 360, height: 800 },
  ] as const;

  for (const vp of MOBILE_VIEWPORTS) {
    test(`mobile ${vp.name}: "Ver combos" scrolls to Combos listos without catalog expansion`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/', { waitUntil: 'networkidle' });
      await waitForReady(page);

      const countBefore = await page.evaluate(
        () =>
          document.querySelectorAll('#product-container [data-product-id]:not(.is-hidden)').length
      );
      expect(countBefore).toBeGreaterThan(0);

      await page.locator('[data-home-hero-cta]').click();
      await page.waitForTimeout(600);

      const headingVisible = await page.evaluate(() => {
        const el = document.getElementById('home-bundles-heading');
        if (!el) return false;
        const { top, bottom } = el.getBoundingClientRect();
        return top < window.innerHeight && bottom > 0;
      });
      expect(headingVisible).toBe(true);

      const countAfter = await page.evaluate(
        () =>
          document.querySelectorAll('#product-container [data-product-id]:not(.is-hidden)').length
      );
      expect(countAfter).toBe(countBefore);
    });
  }
});
