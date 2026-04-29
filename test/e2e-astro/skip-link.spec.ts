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

async function readSkipLinkFocusLayout(page: Page) {
  return await page.evaluate(() => {
    const skipLink = document.querySelector('.skip-link');
    const navbar = document.querySelector('.storefront-navbar');

    if (!(skipLink instanceof HTMLElement) || !(navbar instanceof HTMLElement)) {
      return null;
    }

    const skipRect = skipLink.getBoundingClientRect();
    const navbarRect = navbar.getBoundingClientRect();

    return {
      skipTop: skipRect.top,
      skipBottom: skipRect.bottom,
      navbarBottom: navbarRect.bottom,
      active: document.activeElement === skipLink,
    };
  });
}

async function expectSkipLinkHidden(page: Page) {
  await expect
    .poll(
      async () => {
        const state = await readSkipLinkState(page);
        return !state.active && state.rectBottom <= 0;
      },
      {
        message: 'Expected the skip link to stay off-canvas while unfocused',
      }
    )
    .toBe(true);
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

    await expect
      .poll(
        async () => {
          const focusLayout = await readSkipLinkFocusLayout(page);

          if (!focusLayout) {
            return false;
          }

          return focusLayout.active && focusLayout.skipTop >= focusLayout.navbarBottom - 1;
        },
        {
          message: 'Expected the focused skip link to settle below the fixed navbar',
        }
      )
      .toBe(true);

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
