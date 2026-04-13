import { expect, test, type Page } from '@playwright/test';

const MOBILE_VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
  { name: '320x568', width: 320, height: 568 },
] as const;

async function waitForReady(page: Page) {
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`home keeps catalog within reach on mobile ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForReady(page);

    const layoutState = await page.evaluate(() => {
      const quickOrderHeading = document.getElementById('home-quick-order-heading');
      const heading = document.getElementById('products-heading');
      const quickOrderTop = quickOrderHeading
        ? quickOrderHeading.getBoundingClientRect().top + window.scrollY
        : Number.POSITIVE_INFINITY;
      const catalogTop = heading
        ? heading.getBoundingClientRect().top + window.scrollY
        : Number.POSITIVE_INFINITY;
      return {
        quickOrderScreensFromTop: Number((quickOrderTop / window.innerHeight).toFixed(2)),
        catalogScreensFromTop: Number((catalogTop / window.innerHeight).toFixed(2)),
        hasShortcutSection: !!document.querySelector('[data-home-category-shortcuts]'),
      };
    });

    expect(layoutState.quickOrderScreensFromTop).toBeLessThanOrEqual(2.5);
    expect(layoutState.catalogScreensFromTop).toBeLessThanOrEqual(4.5);
    expect(layoutState.hasShortcutSection).toBe(false);

    const mobileCartShortcut = page.locator('#mobile-cart-shortcut');
    await expect(mobileCartShortcut).toBeHidden();

    const firstAddButton = page.locator('#product-container .add-to-cart-btn').first();
    await firstAddButton.click();

    await expect(mobileCartShortcut).toBeVisible();
    await expect(mobileCartShortcut).toContainText('Ver pedido · 1 ·');
  });

  test(`primary category stays compact on mobile ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/bebidas/', { waitUntil: 'networkidle' });
    await waitForReady(page);

    const categoryState = await page.evaluate(() => {
      const controls = document.querySelector('.catalog-controls');
      const firstCard = document.querySelector('#product-container .producto');
      const firstDescription = firstCard?.querySelector('.card-text');
      const heading = document.getElementById('category-heading');
      const top = heading
        ? heading.getBoundingClientRect().top + window.scrollY
        : Number.POSITIVE_INFINITY;

      return {
        controlsPosition: controls ? window.getComputedStyle(controls).position : '',
        compactCard: firstCard?.classList.contains('producto--compact-mobile') || false,
        descriptionDisplay: firstDescription
          ? window.getComputedStyle(firstDescription).display
          : '',
        screensFromTop: Number((top / window.innerHeight).toFixed(2)),
      };
    });

    expect(categoryState.controlsPosition).toBe('sticky');
    expect(categoryState.compactCard).toBe(true);
    expect(categoryState.descriptionDisplay).toBe('none');
    expect(categoryState.screensFromTop).toBeLessThanOrEqual(1.5);
  });
}
