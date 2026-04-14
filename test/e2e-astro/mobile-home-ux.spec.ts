import { expect, test, type Page } from '@playwright/test';

const MOBILE_VIEWPORTS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
  { name: '320x568', width: 320, height: 568 },
] as const;
const CART_VIEWPORTS = MOBILE_VIEWPORTS.filter((viewport) =>
  ['390x844', '320x568'].includes(viewport.name)
);

async function waitForReady(page: Page) {
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

async function openCartFromHome(page: Page, viewport: (typeof MOBILE_VIEWPORTS)[number]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);

  const firstAddButton = page.locator('#product-container .add-to-cart-btn').first();
  await firstAddButton.click();

  const mobileCartShortcut = page.locator('#mobile-cart-shortcut');
  await expect(mobileCartShortcut).toBeVisible();
  await mobileCartShortcut.click();

  const offcanvas = page.locator('#cartOffcanvas');
  await expect(offcanvas).toBeVisible();

  return { mobileCartShortcut, offcanvas };
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

for (const viewport of CART_VIEWPORTS) {
  test(`cart keeps products visible and shortcut state correct on mobile ${viewport.name}`, async ({
    page,
  }) => {
    const { mobileCartShortcut, offcanvas } = await openCartFromHome(page, viewport);

    await expect(mobileCartShortcut).toBeHidden();

    const cartState = await page.evaluate(() => {
      const items = document.getElementById('cart-items');
      const footer = document.querySelector('#cartOffcanvas .cart-footer');
      const firstItem = document.querySelector('#cart-items .cart-item');
      const submit = document.getElementById('submit-cart');
      if (
        !(items instanceof HTMLElement) ||
        !(footer instanceof HTMLElement) ||
        !(firstItem instanceof HTMLElement)
      ) {
        return null;
      }

      const itemsRect = items.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const firstItemRect = firstItem.getBoundingClientRect();
      const submitRect =
        submit instanceof HTMLElement ? submit.getBoundingClientRect() : { height: 0 };

      return {
        itemsHeight: Number(itemsRect.height.toFixed(2)),
        footerHeight: Number(footerRect.height.toFixed(2)),
        firstItemHeight: Number(firstItemRect.height.toFixed(2)),
        firstItemFullyVisible:
          firstItemRect.top >= itemsRect.top - 1 && firstItemRect.bottom <= itemsRect.bottom + 1,
        footerViewportShare: Number((footerRect.height / window.innerHeight).toFixed(2)),
        submitHeight: Number(submitRect.height.toFixed(2)),
      };
    });

    expect(cartState).not.toBeNull();
    expect(cartState?.firstItemFullyVisible).toBe(true);
    expect(cartState?.itemsHeight).toBeGreaterThanOrEqual((cartState?.firstItemHeight ?? 0) - 2);
    expect(cartState?.footerViewportShare).toBeLessThan(0.58);
    expect(cartState?.submitHeight).toBeGreaterThanOrEqual(44);

    const submitButton = page.locator('#submit-cart');
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeDisabled();

    await page.locator('#payment-transfer').check();
    await expect(submitButton).toBeEnabled();

    await page.locator('#continue-shopping').click();
    await expect(offcanvas).toBeHidden();
    await expect(mobileCartShortcut).toBeVisible();
  });
}

test('cart offcanvas keeps a readable mobile hierarchy at 390x844', async ({ page }) => {
  await openCartFromHome(page, MOBILE_VIEWPORTS[0]);

  await expect(page.locator('#cartOffcanvas .offcanvas-body')).toHaveScreenshot(
    'mobile-cart-offcanvas-390x844.png',
    {
      animations: 'disabled',
      caret: 'hide',
    }
  );
});
