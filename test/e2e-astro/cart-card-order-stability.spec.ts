import { expect, test, type Page } from '@playwright/test';

async function openFreshHome(page: Page) {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__APP_READY__ === true);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

async function readQuickOrder(page: Page) {
  return page.locator('#home-personalized-grid .producto').evaluateAll((elements) =>
    elements.map((element) => ({
      id: element.getAttribute('data-product-id'),
      name: element.getAttribute('data-product-name'),
    }))
  );
}

async function bumpQuickOrderItem(page: Page, productId: string, expectedQty: number) {
  const addButton = page.locator(
    `#home-personalized-grid .add-to-cart-btn[data-id="${productId}"]`
  );

  if (await addButton.first().isVisible()) {
    await addButton.first().click();
  } else {
    await page
      .locator(
        `#home-personalized-grid .quantity-btn[data-action="increase"][data-id="${productId}"]`
      )
      .first()
      .click();
  }

  await page.waitForFunction(
    ([id, qty]) => {
      const cart = JSON.parse(localStorage.getItem('astro-poc-cart') || '[]');
      return (
        cart.find((item: { id: string; quantity: number }) => item.id === id)?.quantity === qty
      );
    },
    [productId, expectedQty]
  );
}

test('quick-order cards keep a stable order while cart quantities change', async ({ page }) => {
  await openFreshHome(page);

  const initialOrder = await readQuickOrder(page);
  expect(initialOrder.length).toBeGreaterThanOrEqual(3);

  const target = initialOrder.at(-1);
  expect(target?.id).toBeTruthy();

  for (let qty = 1; qty <= 3; qty += 1) {
    await bumpQuickOrderItem(page, target!.id!, qty);
    await expect(readQuickOrder(page)).resolves.toEqual(initialOrder);
  }
});
