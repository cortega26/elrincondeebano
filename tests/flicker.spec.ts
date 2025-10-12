import { test, expect } from '@playwright/test';

const pathsToCheck = [
  '/',
  '/pages/energeticaseisotonicas.html',
  '/pages/limpiezayaseo.html',
];

test.describe('first-paint stability', () => {
  for (const relativePath of pathsToCheck) {
    test(`no flicker on ${relativePath}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(relativePath, { waitUntil: 'networkidle' });

      const navbar = page.locator('.navbar');
      await expect(navbar).toBeVisible();

      const styleSamples: Array<{ fontFamily: string; fontWeight: string; height: number }> = [];
      for (let i = 0; i < 10; i += 1) {
        const snapshot = await navbar.evaluate((node) => {
          const element = node as HTMLElement;
          const computed = getComputedStyle(element);
          return {
            fontFamily: computed.fontFamily,
            fontWeight: computed.fontWeight,
            height: element.getBoundingClientRect().height,
          };
        });
        styleSamples.push(snapshot);
        await page.waitForTimeout(100);
      }

      const reference = styleSamples[0];
      for (const sample of styleSamples) {
        expect.soft(sample.fontFamily).toBe(reference.fontFamily);
        expect.soft(sample.fontWeight).toBe(reference.fontWeight);
        expect.soft(Math.abs(sample.height - reference.height)).toBeLessThan(0.5);
      }

      const cartOffcanvas = page.locator('#cartOffcanvas');
      const cartSamples: Array<{ visibility: string; transform: string }> = [];
      for (let i = 0; i < 5; i += 1) {
        const snapshot = await cartOffcanvas.evaluate((node) => {
          const element = node as HTMLElement;
          const computed = getComputedStyle(element);
          return {
            visibility: computed.visibility,
            transform: computed.transform,
          };
        });
        cartSamples.push(snapshot);
        await page.waitForTimeout(100);
      }

      const cartReference = cartSamples[0];
      expect(cartReference.visibility).toBe('hidden');
      for (const sample of cartSamples) {
        expect.soft(sample.visibility).toBe(cartReference.visibility);
        expect.soft(sample.transform).toBe(cartReference.transform);
      }
    });
  }
});
