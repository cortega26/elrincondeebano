import { expect, test, type Page } from '@playwright/test';

async function waitForReady(page: Page) {
  await page.waitForFunction(() => window.__APP_READY__ === true);
}

async function readSkipLinkState(page: Page) {
  return await page.locator('.skip-link').evaluate((element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return {
      active: document.activeElement === element,
      rectTop: rect.top,
      rectBottom: rect.bottom,
      transform: style.transform,
    };
  });
}

async function expectSkipLinkHidden(page: Page) {
  await expect
    .poll(async () => readSkipLinkState(page), {
      message: 'Expected the skip link to stay off-canvas while unfocused',
    })
    .toMatchObject({
      active: false,
    });

  const state = await readSkipLinkState(page);
  expect(state.rectBottom).toBeLessThanOrEqual(0);
}

test.describe('skip link visibility', () => {
  test('stays hidden on normal page load across desktop and mobile widths', async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/', { waitUntil: 'networkidle' });
      await waitForReady(page);
      await expectSkipLinkHidden(page);
    }
  });

  test('only appears for keyboard users and hides again after activation', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForReady(page);
    await expectSkipLinkHidden(page);

    const skipLink = page.locator('.skip-link');
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport();

    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await expectSkipLinkHidden(page);
  });

  test('stays hidden after mouse interactions, blur, and reload', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await waitForReady(page);

    await page.locator('.navbar-brand').click();
    await expectSkipLinkHidden(page);

    await page.locator('body').click({ position: { x: 200, y: 200 } });
    await expectSkipLinkHidden(page);

    await page.reload({ waitUntil: 'networkidle' });
    await waitForReady(page);
    await expectSkipLinkHidden(page);
  });

  test('stays hidden during direct hash navigation and history traversal', async ({ page }) => {
    await page.goto('/#main-content', { waitUntil: 'networkidle' });
    await waitForReady(page);
    await expect(page).toHaveURL(/#main-content$/);
    await expectSkipLinkHidden(page);

    await page.goto('/bebidas/', { waitUntil: 'networkidle' });
    await waitForReady(page);
    await expectSkipLinkHidden(page);

    await page.goBack({ waitUntil: 'networkidle' });
    await waitForReady(page);
    await expect(page).toHaveURL(/#main-content$/);
    await expectSkipLinkHidden(page);
  });
});
