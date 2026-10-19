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

  // Plan 231: the WhatsApp URL is captured, not just counted — the open call
  // must carry the catalog-priced total for the fixture cart (quantity 1).
  const product = await page
    .locator(`.category-strip .add-to-cart-btn[data-id="${productId}"]`)
    .first()
    .evaluate((element) => {
      const card = element.closest<HTMLElement>('[data-product-id]')!;
      return {
        price: Number(card.dataset.productPrice),
        discount: Number(card.dataset.productDiscount || 0),
      };
    });
  const expectedTotal = Math.max(0, product.price - product.discount);

  await page.evaluate(() => {
    (window as any).__openCallCount = 0;
    (window as any).__lastOpenUrl = '';
    window.open = ((url: string) => {
      (window as any).__openCallCount = ((window as any).__openCallCount || 0) + 1;
      (window as any).__lastOpenUrl = String(url);
      return null;
    }) as typeof window.open;
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

  const openUrl = await page.evaluate(() => (window as any).__lastOpenUrl as string);
  expect(openUrl).toContain('https://wa.me/');
  const formattedTotal = expectedTotal.toLocaleString('es-CL');
  expect(openUrl).toContain(encodeURIComponent(formattedTotal));
  const whatsappMessage = decodeURIComponent(openUrl.split('?text=')[1] ?? '');
  expect(whatsappMessage).toContain(`*Total:* $${formattedTotal}`);

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
  // The mobile shortcut only renders in the mobile breakpoint.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 15_000 });

  // Seed a real cart item (badge text proves the add committed — plan 193).
  const addBtn = page.locator('.category-strip .add-to-cart-btn').first();
  await addBtn.click();
  await expect(page.locator('#cart-count')).toHaveText('1', { timeout: 5_000 });

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
  // The shortcut reveals synchronously (follow-up fix); dismiss the
  // refusal toast first — it overlaps the shortcut's bottom-right area.
  await page.locator('#shared-cart-refused .btn-close').click();
  await expect(page.locator('#shared-cart-refused')).not.toBeVisible();
  await page.locator('#mobile-cart-shortcut').click();
  const offcanvas = page.locator('#cartOffcanvas');
  await expect(offcanvas).toBeVisible();
  await expect(offcanvas.locator('.item-quantity')).toHaveText('1');
});


test('removed products do not return after cross-tab edits, additions and reloads', async ({
  page,
  context,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  const ids = await page.locator('.category-strip .add-to-cart-btn').evaluateAll((buttons) =>
    [...new Set(buttons.map((button) => button.getAttribute('data-id')).filter(Boolean))]
  );
  expect(ids.length).toBeGreaterThanOrEqual(2);
  const [removedId, addedId] = ids as string[];

  const otherTab = await context.newPage();
  await otherTab.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(otherTab);

  await page.locator(`.category-strip .add-to-cart-btn[data-id="${removedId}"]`).first().click();
  await expect(otherTab.locator('#cart-count')).toHaveText('1');
  await otherTab.locator('#cart-icon').click();
  await expect(otherTab.locator('#cartOffcanvas')).toBeVisible();
  await otherTab.locator(`.cart-item__remove[data-id="${removedId}"]`).click();
  await expect(page.locator('#cart-count')).toHaveText('0');

  await page.locator(`.category-strip .add-to-cart-btn[data-id="${addedId}"]`).first().click();
  await expect(otherTab.locator('#cart-count')).toHaveText('1');
  for (const tab of [page, otherTab]) {
    await tab.reload({ waitUntil: 'networkidle' });
    await waitForReady(tab);
    const storedIds = await tab.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('astro-poc-cart') || '[]');
      return stored.map((item: { id: string }) => item.id);
    });
    expect(storedIds).toEqual([addedId]);
    await expect(tab.locator('#cart-count')).toHaveText('1');
  }
  await otherTab.close();
});

test('an empty canonical cart defeats a stale legacy alias on reload and next add', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);
  await page.evaluate(() => localStorage.clear());
  const ids = await page.locator('.category-strip .add-to-cart-btn').evaluateAll((buttons) =>
    [...new Set(buttons.map((button) => button.getAttribute('data-id')).filter(Boolean))]
  );
  expect(ids.length).toBeGreaterThanOrEqual(2);
  const [ghostId, newId] = ids as string[];

  await page.evaluate((id) => {
    localStorage.setItem('astro-poc-cart', '[]');
    localStorage.setItem(
      'cart',
      JSON.stringify([
        { id, name: 'Old item', category: 'test', price: 1000, image: '', quantity: 2 },
      ])
    );
  }, ghostId);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);
  await expect(page.locator('#cart-count')).toHaveText('0');

  await page.locator(`.category-strip .add-to-cart-btn[data-id="${newId}"]`).first().click();
  const idsAfter = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-cart') || '[]').map(
      (item: { id: string }) => item.id
    )
  );
  expect(idsAfter).toEqual([newId]);
});

test('an edit rebases a stale in-memory cart instead of bringing back deleted items', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  const ids = await page.locator('.category-strip .add-to-cart-btn').evaluateAll((buttons) =>
    [...new Set(buttons.map((button) => button.getAttribute('data-id')).filter(Boolean))]
  );
  expect(ids.length).toBeGreaterThanOrEqual(2);
  const [removedId, addedId] = ids as string[];
  await page.locator(`.category-strip .add-to-cart-btn[data-id="${removedId}"]`).first().click();

  // Simulate a same-tab controller writing the authoritative empty cart
  // without updating the storefront's closed-over in-memory copy.
  await page.evaluate(() => localStorage.setItem('astro-poc-cart', '[]'));
  await page.locator(`.category-strip .add-to-cart-btn[data-id="${addedId}"]`).first().click();

  const cartIds = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-cart') || '[]').map(
      (item: { id: string }) => item.id
    )
  );
  expect(cartIds).toEqual([addedId]);
  await expect(page.locator('#cart-count')).toHaveText('1');

  // A queued/stale storage event must not re-apply its old payload.
  await page.evaluate((id) => {
    const stale = JSON.stringify([{ id, quantity: 3 }]);
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'astro-poc-cart',
        newValue: stale,
        storageArea: localStorage,
      })
    );
  }, removedId);
  const afterEvent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-cart') || '[]').map(
      (item: { id: string }) => item.id
    )
  );
  expect(afterEvent).toEqual([addedId]);
  await expect(page.locator('#cart-count')).toHaveText('1');
});

test('duplicate persisted SKU rows disappear after a single removal and never return', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);
  const ids = await page.locator('.category-strip .add-to-cart-btn').evaluateAll((buttons) =>
    [...new Set(buttons.map((button) => button.getAttribute('data-id')).filter(Boolean))]
  );
  expect(ids.length).toBeGreaterThanOrEqual(2);
  const [removedId, addedId] = ids as string[];

  await page.evaluate((id) => {
    localStorage.setItem(
      'astro-poc-cart',
      JSON.stringify([
        { id, name: 'Duplicated SKU', price: 5900, quantity: 1 },
        { id, name: 'Duplicated SKU', price: 5900, quantity: 3 },
      ])
    );
  }, removedId);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  await expect(page.locator('#cart-count')).toHaveText('3');
  await page.locator('#cart-icon').click();
  const item = page.locator(`#cart-items .cart-item[data-id="${removedId}"]`);
  await expect(item).toHaveCount(1);
  await expect(item.locator('.item-quantity')).toHaveText('3');
  const repaired = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-cart') || '[]')
  );
  expect(repaired).toHaveLength(1);
  expect(repaired[0]).toMatchObject({ id: removedId, quantity: 3 });
  await item.locator('.cart-item__remove').click();
  await expect(page.locator('#cart-count')).toHaveText('0');
  await expect(page.locator('#cart-items .cart-item')).toHaveCount(0);
  await page.locator('#cartOffcanvas [data-bs-dismiss="offcanvas"]').first().click();
  await expect(page.locator('#cartOffcanvas')).toBeHidden();

  await page.locator(`.category-strip .add-to-cart-btn[data-id="${addedId}"]`).first().click();
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);
  await expect(page.locator('#cart-count')).toHaveText('1');
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-cart') || '[]').map(
      (entry: { id: string }) => entry.id
    )
  );
  expect(persisted).toEqual([addedId]);
});


test('different IDs for the same physical product cannot recreate a removed cart row', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);

  const products = await page.locator('.category-strip .add-to-cart-btn').evaluateAll((buttons) =>
    [...new Map(
      buttons
        .map((button) => button.closest<HTMLElement>('[data-product-id]'))
        .filter((card): card is HTMLElement => Boolean(card?.dataset.productId))
        .map((card) => [card.dataset.productId, {
          id: card.dataset.productId,
          name: card.dataset.productName,
          category: card.dataset.productCategory,
          price: Number(card.dataset.productPrice),
          discount: Number(card.dataset.productDiscount || 0),
          image: card.querySelector('img')?.getAttribute('src') || '',
        }])
    ).values()]
  );
  expect(products.length).toBeGreaterThanOrEqual(2);
  const [item, next] = products;

  await page.evaluate((product) => {
    const image = product.image.replace(/\.(?:webp|avif)(?=[?#]|$)/i, '.webp');
    localStorage.setItem('astro-poc-cart', JSON.stringify([
      { ...product, id: 'obsolete-product-id', image, quantity: 1 },
      { ...product, quantity: 3 },
    ]));
  }, item);

  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);
  await expect(page.locator('#cart-count')).toHaveText('3');
  await page.locator('#cart-icon').click();
  await expect(page.locator('#cart-items .cart-item')).toHaveCount(1);
  await page.locator('#cart-items .cart-item .cart-item__remove').click();
  await expect(page.locator('#cart-count')).toHaveText('0');
  await page.locator('#cartOffcanvas [data-bs-dismiss="offcanvas"]').first().click();
  await expect(page.locator('#cartOffcanvas')).toBeHidden();

  await page.locator(`.category-strip .add-to-cart-btn[data-id="${next.id}"]`).first().click();
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);
  const result = await page.evaluate(() => JSON.parse(localStorage.getItem('astro-poc-cart') || '[]'));
  expect(result).toHaveLength(1);
  expect(result[0].id).toBe(next.id);
  await expect(page.locator('#cart-count')).toHaveText('1');
});


test('adding a current SKU upgrades its historical ID without creating another cart line', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);
  const button = page.locator('.category-strip .add-to-cart-btn').first();
  const product = await button.evaluate((element) => {
    const card = element.closest<HTMLElement>('[data-product-id]')!;
    return {
      id: card.dataset.productId!,
      name: card.dataset.productName!,
      category: card.dataset.productCategory || '',
      price: Number(card.dataset.productPrice),
      discount: Number(card.dataset.productDiscount || 0),
      image: card.querySelector('img')?.getAttribute('src') || '',
    };
  });
  await page.evaluate((item) => {
    localStorage.setItem('astro-poc-cart', JSON.stringify([
      { ...item, id: 'historical-id-for-same-product', quantity: 3 },
    ]));
  }, product);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);
  await expect(page.locator('#cart-count')).toHaveText('3');

  await page.locator(`.category-strip .add-to-cart-btn[data-id="${product.id}"]`).first().click();
  await expect(page.locator('#cart-count')).toHaveText('4');
  await page.locator('#cart-icon').click();
  await expect(page.locator('#cart-items .cart-item')).toHaveCount(1);
  await expect(page.locator('#cart-items .cart-item .item-quantity')).toHaveText('4');
  const afterAdd = await page.evaluate(() => JSON.parse(localStorage.getItem('astro-poc-cart') || '[]'));
  expect(afterAdd).toHaveLength(1);
  expect(afterAdd[0]).toMatchObject({ id: product.id, quantity: 4 });

  await page.locator('#cart-items .cart-item .cart-item__remove').click();
  await expect(page.locator('#cart-count')).toHaveText('0');
  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('astro-poc-cart') || '[]'))).toEqual([]);
});

test('stale persisted prices refresh from the live catalog without rewriting storage', async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForReady(page);

  const button = page.locator('.category-strip .add-to-cart-btn').first();
  const product = await button.evaluate((element) => {
    const card = element.closest<HTMLElement>('[data-product-id]')!;
    return {
      id: card.dataset.productId!,
      name: card.dataset.productName!,
      category: card.dataset.productCategory || '',
      price: Number(card.dataset.productPrice),
      discount: Number(card.dataset.productDiscount || 0),
      image: card.querySelector('img')?.getAttribute('src') || '',
    };
  });

  const stalePrice = product.price + 500;
  expect(stalePrice).not.toBe(product.price);
  await page.evaluate(
    ({ item, price }) => {
      localStorage.setItem('astro-poc-cart', JSON.stringify([{ ...item, price, quantity: 2 }]));
    },
    { item: product, price: stalePrice }
  );

  await page.reload({ waitUntil: 'networkidle' });
  await waitForReady(page);

  // Quantity survives, and the cart view is priced from the current catalog.
  await expect(page.locator('#cart-count')).toHaveText('2');
  await page.locator('#cart-icon').click();
  const offcanvas = page.locator('#cartOffcanvas');
  await expect(offcanvas).toBeVisible();

  const effectivePrice = Math.max(0, product.price - (product.discount || 0));
  const format = (value: number) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0,
    }).format(value);

  const line = offcanvas.locator(`#cart-items .cart-item[data-id="${product.id}"]`);
  await expect(line.locator('.cart-item__price-line')).toHaveText(
    `Unitario: ${format(effectivePrice)}`
  );
  await expect(line.locator('.cart-item__subtotal')).toHaveText(
    `Subtotal: ${format(effectivePrice * 2)}`
  );
  await expect(line.locator('.item-quantity')).toHaveText('2');
  await expect(page.locator('#cart-total')).toHaveText(`Total: ${format(effectivePrice * 2)}`);

  // The display refresh is in-memory by design: the persisted snapshot keeps
  // its stale price (writing refreshed fields could collapse rows on the next
  // sanitize — visualCartIdentity includes price/discount).
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('astro-poc-cart') || '[]')
  );
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ id: product.id, price: stalePrice, quantity: 2 });
});
