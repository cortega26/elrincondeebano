import { expect, test, type Page } from '@playwright/test';

async function waitForReady(page: Page) {
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

test('canonical cart storage survives a refresh on the shipped Astro storefront', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  const productId = await page
    .locator('.category-strip .add-to-cart-btn')
    .first()
    .getAttribute('data-id');
  expect(productId).toBeTruthy();

  await page.locator(`.category-strip .add-to-cart-btn[data-id="${productId}"]`).first().click();
  await page.waitForFunction((id) => {
    const cart = JSON.parse(localStorage.getItem('astro-poc-cart') || '[]');
    return cart.some(
      (item: { id: string; quantity: number }) => item.id === id && item.quantity === 1
    );
  }, productId);

  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  await expect(
    page.locator(`.category-strip .action-area[data-pid="${productId}"] .quantity-value`)
  ).toHaveText('1');
});

test('repeat-order flow keeps canonical last-order state usable after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);

  const productId = await page
    .locator('.category-strip .add-to-cart-btn')
    .first()
    .getAttribute('data-id');
  expect(productId).toBeTruthy();

  await page.evaluate(() => {
    (window as any).__openCallCount = 0;
    window.open = (..._args: any[]) => {
      (window as any).__openCallCount = ((window as any).__openCallCount || 0) + 1;
      return null;
    };
  });

  await page.locator(`.category-strip .add-to-cart-btn[data-id="${productId}"]`).first().click();
  await page.locator('#cart-icon').click();
  await page.locator('#cartOffcanvas').waitFor({ state: 'visible' });
  await page.locator('.cart-note-toggle').click();
  await page.locator('#delivery-note').fill('Dejar en conserjeria');
  await page.locator('#payment-cash').check();
  await page.locator('#submit-cart').click();
  await page.locator('#order-confirm-dialog').waitFor({ state: 'visible' });
  await page.locator('#order-confirm-send').click();
  await page.locator('#order-confirm-dialog').waitFor({ state: 'hidden', timeout: 10000 });
  await page.waitForFunction(
    () => {
      const lastOrder = JSON.parse(localStorage.getItem('astro-poc-last-order') || 'null');
      return Array.isArray(lastOrder?.items) && lastOrder.items.length > 0;
    },
    { timeout: 15000 }
  );

  const openCount = await page.evaluate(() => (window as any).__openCallCount || 0);
  expect(openCount).toBe(1);

  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  await expect(page.locator('[data-repeat-last-order]').first()).toBeEnabled();
  await page.locator('[data-repeat-last-order]').first().click();

  await page.waitForFunction((id) => {
    const cart = JSON.parse(localStorage.getItem('astro-poc-cart') || '[]');
    return cart.some(
      (item: { id: string; quantity: number }) => item.id === id && item.quantity === 1
    );
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

// ─── Plan 027: rollback discipline for destructive cart actions ──────────────

async function completeOrderFlow(page: Page, productId: string) {
  await page.locator(`.category-strip .add-to-cart-btn[data-id="${productId}"]`).first().click();
  await page.locator('#cart-icon').click();
  await page.locator('#cartOffcanvas').waitFor({ state: 'visible' });
  await page.locator('#payment-cash').check();
  await page.locator('#submit-cart').click();
  await page.locator('#order-confirm-dialog').waitFor({ state: 'visible' });
  await page.locator('#order-confirm-send').click();
  await page.locator('#order-confirm-dialog').waitFor({ state: 'hidden', timeout: 10000 });
  await page.waitForFunction(() => {
    const lastOrder = JSON.parse(localStorage.getItem('astro-poc-last-order') || 'null');
    return Array.isArray(lastOrder?.items) && lastOrder.items.length > 0;
  });
}

function breakStorageWrites(page: Page) {
  return page.evaluate(() => {
    const proto = Storage.prototype;
    (window as any).__restoreStorageWrites = () => {
      proto.setItem = (window as any).__originalStorageSetItem;
    };
    (window as any).__originalStorageSetItem = proto.setItem;
    proto.setItem = function (key: string, value: string) {
      if (key === 'astro-poc-cart') {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      }
      return (window as any).__originalStorageSetItem.call(this, key, value);
    };
  });
}

function restoreStorageWrites(page: Page) {
  return page.evaluate(() => (window as any).__restoreStorageWrites?.());
}

test('repeat-order write failure keeps cart, badge and storage unchanged', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  const productId = await page
    .locator('.category-strip .add-to-cart-btn')
    .first()
    .getAttribute('data-id');
  expect(productId).toBeTruthy();

  await page.evaluate(() => {
    window.open = () => null;
  });
  await completeOrderFlow(page, productId!);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  const badgeBefore = await page.locator('#cart-count').textContent();
  await breakStorageWrites(page);

  await page.locator('[data-repeat-last-order]').first().click();

  await expect(page.locator('#cart-save-error')).toBeVisible();
  await expect(page.locator('#cart-count')).toHaveText(badgeBefore!);
  const cartAfter = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-cart') || '[]')
  );
  expect(cartAfter.length).toBe(1);
  expect(cartAfter[0].id).toBe(productId);

  await restoreStorageWrites(page);
});

test('empty-cart write failure keeps cart, badge and storage unchanged', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  const productId = await page
    .locator('.category-strip .add-to-cart-btn')
    .first()
    .getAttribute('data-id');
  expect(productId).toBeTruthy();

  await page.locator(`.category-strip .add-to-cart-btn[data-id="${productId}"]`).first().click();
  await page.waitForFunction(() => {
    const cart = JSON.parse(localStorage.getItem('astro-poc-cart') || '[]');
    return cart.length === 1;
  });

  const badgeBefore = await page.locator('#cart-count').textContent();
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await breakStorageWrites(page);

  await page.locator('#cart-icon').click();
  await page.locator('#cartOffcanvas').waitFor({ state: 'visible' });
  await page.locator('.cart-note-toggle').click();
  await page.locator('#empty-cart').click();

  await expect(page.locator('#cart-save-error')).toBeVisible();
  await expect(page.locator('#cart-count')).toHaveText(badgeBefore!);
  const cartAfter = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-cart') || '[]')
  );
  expect(cartAfter.length).toBe(1);
  expect(cartAfter[0].id).toBe(productId);

  await restoreStorageWrites(page);
});

test('mark-sent write failure keeps cart, badge and sent marker unchanged', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  const productId = await page
    .locator('.category-strip .add-to-cart-btn')
    .first()
    .getAttribute('data-id');
  expect(productId).toBeTruthy();

  await page.evaluate(() => {
    window.open = () => null;
  });
  await completeOrderFlow(page, productId!);

  await page.locator('#order-mark-sent').waitFor({ state: 'visible' });
  const badgeBefore = await page.locator('#cart-count').textContent();
  const sentBefore = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-order-last-sent-at') || '0')
  );

  await breakStorageWrites(page);
  await page.locator('#order-mark-sent').click();

  await expect(page.locator('#cart-save-error')).toBeVisible();
  await expect(page.locator('#cart-count')).toHaveText(badgeBefore!);
  const sentAfter = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-order-last-sent-at') || '0')
  );
  expect(sentAfter).toBe(sentBefore);
  const cartAfter = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-cart') || '[]')
  );
  expect(cartAfter.length).toBe(1);

  await restoreStorageWrites(page);
});
test('plan 117: shared-cart link with a non-empty cart shows feedback and keeps the cart', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 15_000 });

  // Seed a real cart item.
  const addBtn = page.locator('.category-strip .add-to-cart-btn').first();
  await addBtn.click();
  await page.waitForTimeout(200);

  // Forge a shared-cart link for the same product.
  const card = addBtn.locator('xpath=ancestor::*[@data-product-id][1]');
  const productId = await card.getAttribute('data-product-id');
  const forged = [
    { id: productId, name: 'X', category: 'X', price: 1, discount: 0, image: '', quantity: 2 },
  ];
  const encoded = Buffer.from(encodeURIComponent(JSON.stringify(forged))).toString('base64');
  await page.evaluate((enc) => {
    window.location.hash = `#cart=${enc}`;
  }, encoded);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 15_000 });

  // The refusal is visible and the existing cart is untouched (qty stays 1):
  // the badge proves the cart survived the reload (the shortcut's own
  // visibility is covered by the cart suites — avoid the boot race here).
  await expect(page.locator('#shared-cart-refused')).toBeVisible();
  await expect(page.locator('#cart-count')).toHaveText('1', { timeout: 10_000 });
  // Open via the navbar cart button — the mobile shortcut has a delayed
  // reveal timer (boot race); the navbar button opens instantly.
  await page.locator('#cart-icon').click();
  const offcanvas = page.locator('#cartOffcanvas');
  await expect(offcanvas).toBeVisible();
  await expect(offcanvas.locator('.item-quantity')).toHaveText('1');
});
