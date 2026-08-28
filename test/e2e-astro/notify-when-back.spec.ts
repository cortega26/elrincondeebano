import { expect, test } from '@playwright/test';

const WHATSAPP_NUMBER = '56951118901';

async function waitForReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => (window as any).__APP_READY__ === true, { timeout: 15_000 });
}

test('out-of-stock cards render WhatsApp notify link with correct wa.me href', async ({ page }) => {
  // Aguas has 6 out-of-stock products (including Benedictino p-af2232a65745)
  await page.goto('/aguas/', { waitUntil: 'networkidle' });
  await waitForReady(page);

  // Find the first out-of-stock card — it must exist post plan-166 (catalog no longer filters stock:false)
  const outOfStockCard = page.locator('.producto[data-product-stock="false"]').first();
  await expect(outOfStockCard, 'at least one out-of-stock card should be rendered').toBeVisible();

  const sku = await outOfStockCard.getAttribute('data-product-id');
  const name = await outOfStockCard.getAttribute('data-product-name');
  expect(sku, 'card must have data-product-id').toBeTruthy();
  expect(name, 'card must have data-product-name').toBeTruthy();

  const notifyLink = outOfStockCard.locator('a[data-notify-whatsapp]');
  await expect(notifyLink, 'notify link must exist inside out-of-stock card').toBeVisible();

  // Link must be a real anchor, keyboard-focusable, with correct a11y + security attrs
  await expect(notifyLink).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  await expect(notifyLink).toHaveAttribute('target', '_blank');
  await expect(notifyLink).toHaveAttribute('rel', 'noopener');
  await expect(notifyLink).toHaveAttribute('data-notify-sku', sku!);
  await expect(notifyLink).toHaveAttribute('data-notify-name', name!);
  await expect(notifyLink).toHaveAttribute('aria-label', `Avísame cuando vuelva ${name}`);
  await expect(notifyLink).toHaveText(/Avísame cuando vuelva/);

  // Href must encode message with product name + sku only (no cart, no PII) via WHATSAPP_NUMBER
  const href = await notifyLink.getAttribute('href');
  expect(href).not.toBeNull();
  const url = new URL(href!);
  expect(url.hostname).toBe('wa.me');
  expect(url.pathname).toBe(`/${WHATSAPP_NUMBER}`);
  const textParam = url.searchParams.get('text');
  expect(textParam, 'wa.me text param must be present').toBeTruthy();
  const expectedMessage = `Avísame cuando vuelva a estar disponible ${name} (${sku})`;
  expect(textParam).toBe(expectedMessage);
  expect(href).toBe(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(expectedMessage)}`);

  // Out-of-stock must not expose add-to-cart, in-stock must not expose notify link
  await expect(outOfStockCard.locator('.add-to-cart-btn')).toHaveCount(0);
  const inStockCard = page.locator('.producto[data-product-stock="true"]').first();
  if ((await inStockCard.count()) > 0) {
    await expect(inStockCard.locator('[data-notify-whatsapp]')).toHaveCount(0);
    await expect(inStockCard.locator('.add-to-cart-btn')).toBeVisible();
  }
});

test('notify link is keyboard-focusable and fires analytics emitter on click', async ({ page }) => {
  await page.goto('/aguas/', { waitUntil: 'networkidle' });
  await waitForReady(page);

  const card = page.locator('.producto[data-product-stock="false"]').first();
  await expect(card).toBeVisible();
  const sku = await card.getAttribute('data-product-id');
  const name = await card.getAttribute('data-product-name');
  const link = card.locator('a[data-notify-whatsapp]');
  await expect(link).toBeVisible();

  // Keyboard focusable
  await link.focus();
  await expect(link).toBeFocused();

  // Intercept analytics and window.open (wa.me navigation)
  await page.evaluate(() => {
    (window as any).__notifyEvents = [];
    (window as any).__analyticsTrack = (eventName: string, props: unknown) => {
      (window as any).__notifyEvents.push({ eventName, props });
    };
    (window as any).__openCalls = [];
    const origOpen = window.open;
    (window as any).__origOpen = origOpen;
    (window as any).open = (...args: unknown[]) => {
      (window as any).__openCalls.push(args);
      return null as unknown as Window;
    };
  });

  // Click — emitter fires, href still points to wa.me (navigation is via native anchor + window.open polyfill)
  await link.click({ noWaitAfter: true });
  // Small settle for delegated handler (attached via capture)
  await page.waitForTimeout(150);

  const events = await page.evaluate(
    () => (window as any).__notifyEvents as Array<{ eventName: string; props: unknown }>
  );
  expect(events.length).toBeGreaterThanOrEqual(1);
  const notifyEvent = events.find((e) => e.eventName === 'notify_when_back');
  expect(notifyEvent, 'notify_when_back analytics event should fire').toBeTruthy();
  expect(notifyEvent!.props).toEqual({ sku, name });

  // Ensure message privacy: only sku + name, no cart data
  const props = notifyEvent!.props as Record<string, unknown>;
  expect(Object.keys(props).sort()).toEqual(['name', 'sku']);
  expect(props.sku).toBe(sku);
  expect(props.name).toBe(name);
});
