import { expect, test, type Page } from '@playwright/test';

async function waitForReady(page: Page) {
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

async function visibleCatalogCount(page: Page) {
  return await page.evaluate(
    () => document.querySelectorAll('#product-container [data-product-id]:not(.is-hidden)').length
  );
}

test.describe('Ver combos navigation', () => {
  test('early click navigates from home to /combos/ without mutating the home catalog', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const countBefore = await visibleCatalogCount(page);
    expect(countBefore).toBeGreaterThan(0);

    await page.locator('[data-home-hero-cta]').click();
    await expect(page).toHaveURL(/\/combos\/$/);
    await waitForReady(page);
    await expect(page.locator('#combos-page-heading')).toBeVisible();

    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForReady(page);

    const countAfter = await visibleCatalogCount(page);
    expect(countAfter).toBe(countBefore);
  });

  test('home teaser stays compact and its CTAs navigate to /combos/', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForReady(page);

    const countBefore = await visibleCatalogCount(page);
    expect(countBefore).toBeGreaterThan(0);

    const teaserState = await page.evaluate(() => {
      const cards = document.querySelectorAll('.home-layout__bundles .bundle-card');
      const introLink = document.querySelector('.home-layout__bundles .home-section__link');
      const footerLink = document.querySelector('.home-layout__bundles .home-section__footer a');
      const experienceData = document.getElementById('storefront-experience-data');
      const totalBundles = (() => {
        try {
          const parsed = JSON.parse(experienceData?.textContent || '{}');
          return Array.isArray(parsed?.bundles) ? parsed.bundles.length : 0;
        } catch {
          return 0;
        }
      })();

      return {
        cardCount: cards.length,
        introHref: introLink?.getAttribute('href') || '',
        footerHref: footerLink?.getAttribute('href') || '',
        totalBundles,
      };
    });

    expect(teaserState.cardCount).toBe(Math.min(3, teaserState.totalBundles));
    expect(teaserState.introHref).toBe('/combos/');
    expect(teaserState.footerHref).toBe('/combos/');

    await page.locator('.home-layout__bundles .home-section__footer a').click();
    await expect(page).toHaveURL(/\/combos\/$/);
    await waitForReady(page);
    await expect(page.locator('#combos-list-heading')).toBeVisible();

    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForReady(page);

    const countAfter = await visibleCatalogCount(page);
    expect(countAfter).toBe(countBefore);
  });

  test('combos page renders the full list, adds a combo to the cart, and links back to the catalog', async ({
    page,
  }) => {
    await page.goto('/combos/', { waitUntil: 'networkidle' });
    await waitForReady(page);

    const pageState = await page.evaluate(() => {
      const cards = document.querySelectorAll('.bundle-card');
      const backLink = document.querySelector('a[href="/#products-heading"]');
      return {
        cardCount: cards.length,
        backHref: backLink?.getAttribute('href') || '',
      };
    });

    expect(pageState.cardCount).toBeGreaterThan(0);
    expect(pageState.backHref).toBe('/#products-heading');

    await page.locator('.bundle-card__action').first().click();
    await expect(page.locator('#cartOffcanvas')).toBeVisible();
    await expect(page.locator('#cart-items .cart-item').first()).toBeVisible();

    await page.locator('#continue-shopping').click();
    await expect(page.locator('#cartOffcanvas')).toBeHidden();

    await page.locator('a[href="/#products-heading"]').first().click();
    await expect(page).toHaveURL(/\/#products-heading$/);
    await waitForReady(page);
    await expect(page.locator('#products-heading')).toBeVisible();
  });
});
