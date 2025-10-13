import { test, expect } from '@playwright/test';

const paths = ['/', '/pages/energeticaseisotonicas.html', '/pages/limpiezayaseo.html'];

for (const path of paths) {
  test(`dropdown stays open on first click: ${path}`, async ({ page }, testInfo) => {
    if (testInfo.project.name === 'chromium-mobile') {
      testInfo.skip('Desktop viewport ensures dropdown toggle is visible without hamburger.');
    }
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.enhancementsInit === '1');

    const dropdown = page.locator('.nav-item.dropdown').first();
    const toggle = dropdown.locator('.dropdown-toggle');
    const menu = dropdown.locator('.dropdown-menu');
    await toggle.waitFor({ state: 'attached' });

    const burger = page.locator('[data-bs-toggle="collapse"][data-bs-target="#navbarNav"]');
    if (await burger.count()) {
      const firstBurger = burger.first();
      if (await firstBurger.isVisible()) {
        await firstBurger.click();
        await expect(page.locator('#navbarNav')).toHaveClass(/show/);
      }
    }

    if (!(await toggle.isVisible())) {
      const firstBurger = burger.first();
      if (await firstBurger.count()) {
        await firstBurger.click({ force: true });
        await expect(page.locator('#navbarNav')).toHaveClass(/show/);
      } else {
        await page.evaluate(() => {
          const nav = document.querySelector('#navbarNav');
          if (!nav) {
            return;
          }
          nav.classList.add('show');
          if (nav instanceof HTMLElement) {
            nav.style.removeProperty('display');
          }
        });
      }
    }

    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(menu).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', /true/i);

    const maybeInside = menu.locator('a, button').first();
    if (await maybeInside.count()) {
      await maybeInside.click({ trial: true });
      await expect(menu).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', /true/i);
    }

    await page.locator('main').click({ position: { x: 10, y: 200 } });
    await expect(menu).not.toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', /false/i);
  });
}
