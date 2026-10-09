import { expect, test } from '@playwright/test';

test('desktop search keeps field and action aligned, with clear hierarchy', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });

  const search = page.locator('#home-product-search');
  const submit = page.locator('[data-home-primary-search] button[type="submit"]');
  await expect(search).toBeVisible();
  await expect(submit).toBeVisible();

  const searchBox = await search.boundingBox();
  const buttonBox = await submit.boundingBox();
  expect(searchBox).not.toBeNull();
  expect(buttonBox).not.toBeNull();
  expect(buttonBox!.x).toBeGreaterThan(searchBox!.x + searchBox!.width - 5);
  expect(Math.abs(buttonBox!.y - searchBox!.y)).toBeLessThanOrEqual(4);
  expect(buttonBox!.height).toBeGreaterThanOrEqual(44);

  const background = await page.locator('body').evaluate(
    (body) => getComputedStyle(body).backgroundColor
  );
  expect(background).toBe('rgb(250, 249, 246)');
});

for (const width of [320, 390]) {
  test('mobile refinement preserves navigable width and input controls at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });
    const search = page.locator('#home-product-search');
    const action = page.locator('[data-home-primary-search] button[type="submit"]');
    await expect(search).toBeVisible();
    await expect(action).toBeVisible();
    const state = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      search: document.querySelector<HTMLInputElement>('#home-product-search')?.getBoundingClientRect().width ?? 0,
      action: document.querySelector<HTMLButtonElement>('[data-home-primary-search] button[type="submit"]')?.getBoundingClientRect().height ?? 0,
    }));
    expect(state.width).toBeLessThanOrEqual(width);
    expect(state.search).toBeGreaterThan(100);
    expect(state.action).toBeGreaterThanOrEqual(44);
  });
}

test('category search and product action remain usable after visual refinement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/limpiezayaseo/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__APP_READY__ === true);
  await page.locator('#filter-keyword').fill('Comfort');
  await expect(page.locator('#product-container .producto:visible')).toHaveCount(1);
  const add = page.locator('#product-container .producto:visible .add-to-cart-btn');
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.locator('#mobile-cart-shortcut')).toContainText('Ver pedido');
});


test('mobile menu expands below the header without displacing brand or cart', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.locator('.storefront-navbar__toggle').click();
  await expect(page.locator('#navbarNav')).toBeVisible();

  const menuGeometry = await page.evaluate(() => {
    const header = document.querySelector('.storefront-navbar');
    const panel = document.getElementById('navbarNav');
    const brand = document.querySelector('.navbar-brand');
    const cart = document.getElementById('cart-icon');
    if (!header || !panel || !brand || !cart) return null;
    const h = header.getBoundingClientRect();
    const n = panel.getBoundingClientRect();
    const b = brand.getBoundingClientRect();
    const c = cart.getBoundingClientRect();
    return {
      headerBottom: h.bottom,
      menuTop: n.top,
      menuLeft: n.left,
      menuRight: n.right,
      brandBottom: b.bottom,
      cartBottom: c.bottom,
    };
  });
  expect(menuGeometry).not.toBeNull();
  expect(menuGeometry!.menuTop).toBeGreaterThanOrEqual(menuGeometry!.headerBottom - 2);
  expect(menuGeometry!.menuLeft).toBeGreaterThanOrEqual(-2);
  expect(menuGeometry!.menuRight).toBeLessThanOrEqual(392);
  expect(menuGeometry!.brandBottom).toBeLessThanOrEqual(menuGeometry!.headerBottom + 2);
  expect(menuGeometry!.cartBottom).toBeLessThanOrEqual(menuGeometry!.headerBottom + 2);

  await page.locator('.storefront-navbar__group-toggle', { hasText: 'Varios' }).click();
  await expect(page.getByRole('link', { name: 'Papelería y Oficina' })).toBeVisible();
});

test('mobile catalog sort and offer filter retain succinct labels', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/limpiezayaseo/', { waitUntil: 'networkidle' });
  await expect(page.locator('#sort-options option:checked')).toHaveText('Por defecto');
  await expect(page.locator('.catalog-controls__switch-title')).toHaveText('Ofertas');
  await expect(page.locator('#filter-keyword')).toBeVisible();
});
