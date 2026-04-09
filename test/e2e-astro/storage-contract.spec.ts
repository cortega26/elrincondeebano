import { expect, test, type Page } from '@playwright/test';

async function waitForReady(page: Page) {
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

test('canonical cart storage survives a refresh on the shipped Astro storefront', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  const productId = await page
    .locator('#product-container .add-to-cart-btn')
    .first()
    .getAttribute('data-id');
  expect(productId).toBeTruthy();

  await page.locator(`#product-container .add-to-cart-btn[data-id="${productId}"]`).first().click();
  await page.waitForFunction((id) => {
    const cart = JSON.parse(localStorage.getItem('astro-poc-cart') || '[]');
    return cart.some((item: { id: string; quantity: number }) => item.id === id && item.quantity === 1);
  }, productId);

  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  await expect(
    page.locator(`#product-container .action-area[data-pid="${productId}"] .quantity-value`)
  ).toHaveText('1');
});

test('repeat-order flow keeps canonical last-order state usable after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);

  const productId = await page
    .locator('#product-container .add-to-cart-btn')
    .first()
    .getAttribute('data-id');
  expect(productId).toBeTruthy();

  await page.evaluate(() => {
    window.open = () => null;
  });

  await page.locator(`#product-container .add-to-cart-btn[data-id="${productId}"]`).first().click();
  await page.locator('#cart-icon').click();
  // Wait for the offcanvas to be fully visible before interacting with its contents
  await page.locator('#cartOffcanvas').waitFor({ state: 'visible' });
  // The delivery note is inside a collapsed section; expand it first
  await page.locator('.cart-note-toggle').click();
  await page.locator('#delivery-note').fill('Dejar en conserjeria');
  await page.locator('#payment-cash').check();
  await page.locator('#submit-cart').click();

  await page.waitForFunction(() => {
    const lastOrder = JSON.parse(localStorage.getItem('astro-poc-last-order') || 'null');
    return Array.isArray(lastOrder?.items) && lastOrder.items.length > 0;
  });

  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  await expect(page.locator('[data-repeat-last-order]').first()).toBeEnabled();
  await page.locator('[data-repeat-last-order]').first().click();

  await page.waitForFunction((id) => {
    const cart = JSON.parse(localStorage.getItem('astro-poc-cart') || '[]');
    return cart.some((item: { id: string; quantity: number }) => item.id === id && item.quantity === 1);
  }, productId);

  const persistedState = await page.evaluate(() => ({
    preferredPayment: JSON.parse(localStorage.getItem('astro-poc-preferred-payment') || '""'),
    note: (document.getElementById('delivery-note') as HTMLTextAreaElement | null)?.value || '',
    lastOrder: JSON.parse(localStorage.getItem('astro-poc-last-order') || 'null'),
  }));

  expect(persistedState.preferredPayment).toBe('Efectivo');
  expect(persistedState.note).toBe('Dejar en conserjeria');
  expect(persistedState.lastOrder?.payment).toBe('Efectivo');
  expect(Array.isArray(persistedState.lastOrder?.items)).toBe(true);
});
