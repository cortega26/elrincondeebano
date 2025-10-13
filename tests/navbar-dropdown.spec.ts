import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const paths = ['/', '/pages/energeticaseisotonicas.html', '/pages/limpiezayaseo.html'];

async function ensureToggleVisibility(page: Page, toggle: Locator) {
  const burger = page.locator('[data-bs-toggle="collapse"][data-bs-target="#navbarNav"]');
  if (await toggle.isVisible()) {
    return;
  }
  if (await burger.count()) {
    const firstBurger = burger.first();
    if (await firstBurger.isVisible()) {
      await firstBurger.click();
      await expect(page.locator('#navbarNav')).toHaveClass(/show/);
    } else {
      await firstBurger.click({ force: true });
      await expect(page.locator('#navbarNav')).toHaveClass(/show/);
    }
  }
  if (!(await toggle.isVisible())) {
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

    await ensureToggleVisibility(page, toggle);

    await expect(toggle).toBeVisible();
    await toggle.click();
    await page.waitForTimeout(100);
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

  test(`dropdown switches categories without glitches: ${path}`, async ({ page }, testInfo) => {
    if (testInfo.project.name === 'chromium-mobile') {
      testInfo.skip('Desktop viewport ensures dropdown toggle is visible without hamburger.');
    }
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.enhancementsInit === '1');

    const dropdowns = page.locator('.nav-item.dropdown');
    const firstToggle = dropdowns.nth(0).locator('.dropdown-toggle');
    const secondToggle = dropdowns.nth(1).locator('.dropdown-toggle');
    const firstMenu = dropdowns.nth(0).locator('.dropdown-menu');
    const secondMenu = dropdowns.nth(1).locator('.dropdown-menu');

    await firstToggle.waitFor({ state: 'attached' });
    await secondToggle.waitFor({ state: 'attached' });
    await ensureToggleVisibility(page, firstToggle);

    await firstToggle.click();
    await expect(firstMenu).toBeVisible();
    await expect(firstToggle).toHaveAttribute('aria-expanded', /true/i);

    await secondToggle.click();
    await expect(secondMenu).toBeVisible();
    await expect(firstMenu).not.toBeVisible();
    await expect(firstToggle).toHaveAttribute('aria-expanded', /false/i);
    await expect(secondToggle).toHaveAttribute('aria-expanded', /true/i);

    await firstToggle.click();
    await expect(firstMenu).toBeVisible();
    await expect(secondMenu).not.toBeVisible();
    await secondToggle.click();
    await firstToggle.click();
    await secondToggle.click();
    await expect(secondMenu).toBeVisible();
    await expect(secondToggle).toHaveAttribute('aria-expanded', /true/i);
  });
}
