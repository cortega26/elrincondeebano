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
      const heading = document.getElementById('products-heading');
      const merchandising = document.querySelector('[data-home-merchandising]');
      const shortcuts = Array.from(
        document.querySelectorAll('[data-home-category-shortcut]')
      ).filter((element) => {
        const styles = window.getComputedStyle(element);
        return styles.display !== 'none' && styles.visibility !== 'hidden';
      });

      const top = heading
        ? heading.getBoundingClientRect().top + window.scrollY
        : Number.POSITIVE_INFINITY;
      return {
        screensFromTop: Number((top / window.innerHeight).toFixed(2)),
        visibleShortcutCount: shortcuts.length,
        merchandisingCollapsed:
          merchandising instanceof HTMLDetailsElement ? merchandising.open === false : false,
      };
    });

    expect(layoutState.screensFromTop).toBeLessThanOrEqual(2.5);
    expect(layoutState.visibleShortcutCount).toBe(4);
    expect(layoutState.merchandisingCollapsed).toBe(true);

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
