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

async function readCartHierarchyState(page: Page) {
  return await page.evaluate(() => {
    const body = document.querySelector('#cartOffcanvas .offcanvas-body');
    const items = document.getElementById('cart-items');
    const footer = document.querySelector('#cartOffcanvas .cart-footer');
    const summary = document.querySelector('#cartOffcanvas .cart-summary-card');
    const payment = document.getElementById('payment-method-container');
    const actions = document.querySelector('#cartOffcanvas .cart-footer-actions');
    const noteToggleRow = document.querySelector('#cartOffcanvas .cart-note-toggle-row');
    const notePanel = document.getElementById('cart-details-collapse');
    const submit = document.getElementById('submit-cart');
    const paymentOptions = Array.from(
      document.querySelectorAll('#payment-method-container .form-check')
    ).filter((option): option is HTMLElement => {
      if (!(option instanceof HTMLElement)) {
        return false;
      }

      const optionRect = option.getBoundingClientRect();
      return optionRect.width > 0 && optionRect.height > 0;
    });

    if (
      !(body instanceof HTMLElement) ||
      !(items instanceof HTMLElement) ||
      !(footer instanceof HTMLElement) ||
      !(summary instanceof HTMLElement) ||
      !(payment instanceof HTMLElement) ||
      !(actions instanceof HTMLElement) ||
      !(noteToggleRow instanceof HTMLElement) ||
      !(notePanel instanceof HTMLElement) ||
      !(submit instanceof HTMLElement) ||
      paymentOptions.length === 0
    ) {
      return null;
    }

    const rect = (element: HTMLElement) => element.getBoundingClientRect();
    const bodyRect = rect(body);
    const itemsRect = rect(items);
    const footerRect = rect(footer);
    const summaryRect = rect(summary);
    const paymentRect = rect(payment);
    const actionsRect = rect(actions);
    const submitRect = rect(submit);
    const paymentOptionColumns = new Set(
      paymentOptions.map((option) => Math.round(option.getBoundingClientRect().left))
    ).size;

    return {
      bodyDisplay: window.getComputedStyle(body).display,
      footerDisplay: window.getComputedStyle(footer).display,
      footerScrollable: footer.scrollHeight > footer.clientHeight + 1,
      footerViewportShare: Number((footerRect.height / window.innerHeight).toFixed(2)),
      footerFitsBody: footerRect.bottom <= bodyRect.bottom + 1,
      itemsBeforeFooter: itemsRect.bottom <= footerRect.top + 1,
      summaryFullyVisible:
        summaryRect.top >= footerRect.top - 1 && summaryRect.bottom <= footerRect.bottom + 1,
      summaryBeforePayment: summaryRect.bottom <= paymentRect.top + 16,
      paymentStartsVisible: paymentRect.top < footerRect.bottom - 44,
      paymentOptionsSingleColumn: paymentOptionColumns === 1,
      notePanelCollapsed:
        !notePanel.classList.contains('show') &&
        window.getComputedStyle(notePanel).display === 'none',
      actionsSticky: window.getComputedStyle(actions).position === 'sticky',
      actionsFullyVisible:
        actionsRect.top >= footerRect.top - 1 && actionsRect.bottom <= footerRect.bottom + 1,
      submitBottomAnchored: Math.abs(bodyRect.bottom - submitRect.bottom) <= 120,
      submitMinHeight: Number(submitRect.height.toFixed(2)),
    };
  });
}

for (const viewport of MOBILE_VIEWPORTS) {
  test(`home keeps catalog within reach on mobile ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForReady(page);

    const layoutState = await page.evaluate(() => {
      const quickOrderHeading = document.getElementById('home-quick-order-heading');
      const heading = document.getElementById('products-heading');
      const firstProduct = document.querySelector('#product-container .producto');
      const quickOrderTop = quickOrderHeading
        ? quickOrderHeading.getBoundingClientRect().top + window.scrollY
        : Number.POSITIVE_INFINITY;
      const catalogTop = heading
        ? heading.getBoundingClientRect().top + window.scrollY
        : Number.POSITIVE_INFINITY;
      const firstProductTop =
        firstProduct instanceof HTMLElement
          ? firstProduct.getBoundingClientRect().top + window.scrollY
          : Number.POSITIVE_INFINITY;
      return {
        quickOrderScreensFromTop: Number((quickOrderTop / window.innerHeight).toFixed(2)),
        catalogScreensFromTop: Number((catalogTop / window.innerHeight).toFixed(2)),
        firstProductScreensFromTop: Number((firstProductTop / window.innerHeight).toFixed(2)),
        hasShortcutSection: !!document.querySelector('[data-home-category-shortcuts]'),
      };
    });

    expect(layoutState.quickOrderScreensFromTop).toBeLessThanOrEqual(1.9);
    expect(layoutState.catalogScreensFromTop).toBeLessThanOrEqual(3.7);
    expect(layoutState.firstProductScreensFromTop).toBeLessThanOrEqual(4.7);
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
      const helpTrigger = document.querySelector('[data-service-dialog-trigger]');
      const top = heading
        ? heading.getBoundingClientRect().top + window.scrollY
        : Number.POSITIVE_INFINITY;
      const firstProductTop =
        firstCard instanceof HTMLElement
          ? firstCard.getBoundingClientRect().top + window.scrollY
          : Number.POSITIVE_INFINITY;

      return {
        controlsPosition: controls ? window.getComputedStyle(controls).position : '',
        compactCard: firstCard?.classList.contains('producto--compact-mobile') || false,
        descriptionDisplay: firstDescription
          ? window.getComputedStyle(firstDescription).display
          : '',
        headingScreensFromTop: Number((top / window.innerHeight).toFixed(2)),
        firstProductScreensFromTop: Number((firstProductTop / window.innerHeight).toFixed(2)),
        hasHelpTrigger: helpTrigger instanceof HTMLElement,
      };
    });

    expect(categoryState.controlsPosition).toBe('sticky');
    expect(categoryState.compactCard).toBe(true);
    expect(categoryState.descriptionDisplay).toBe('none');
    expect(categoryState.headingScreensFromTop).toBeLessThanOrEqual(1.35);
    expect(categoryState.firstProductScreensFromTop).toBeLessThanOrEqual(2.55);
    expect(categoryState.hasHelpTrigger).toBe(true);

    await page
      .locator('[data-service-dialog-trigger]')
      .evaluate((trigger) => (trigger as HTMLButtonElement).click());
    await expect(page.locator('#service-guide-dialog')).toBeVisible();
    await page.locator('[data-service-dialog-close]').first().click();
    await expect(page.locator('#service-guide-dialog')).not.toBeVisible();
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
  const hierarchyState = await readCartHierarchyState(page);

  expect(hierarchyState).not.toBeNull();
  expect(hierarchyState?.bodyDisplay).toBe('flex');
  expect(hierarchyState?.footerDisplay).toBe('flex');
  expect(hierarchyState?.footerScrollable).toBe(true);
  expect(hierarchyState?.footerViewportShare).toBeLessThan(0.58);
  expect(hierarchyState?.footerFitsBody).toBe(true);
  expect(hierarchyState?.itemsBeforeFooter).toBe(true);
  expect(hierarchyState?.summaryFullyVisible).toBe(true);
  expect(hierarchyState?.summaryBeforePayment).toBe(true);
  expect(hierarchyState?.paymentStartsVisible).toBe(true);
  expect(hierarchyState?.paymentOptionsSingleColumn).toBe(true);
  expect(hierarchyState?.notePanelCollapsed).toBe(true);
  expect(hierarchyState?.actionsSticky).toBe(true);
  expect(hierarchyState?.actionsFullyVisible).toBe(true);
  expect(hierarchyState?.submitBottomAnchored).toBe(true);
  expect(hierarchyState?.submitMinHeight).toBeGreaterThanOrEqual(44);

  const footer = page.locator('#cartOffcanvas .cart-footer');
  await footer.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  await expect(page.locator('#cartOffcanvas .cart-note-toggle-row')).toBeInViewport();
  await expect(page.locator('#cartOffcanvas .cart-note-toggle')).toBeVisible();
});
