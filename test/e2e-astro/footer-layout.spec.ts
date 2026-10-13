import { expect, test } from '@playwright/test';

const ROUTES = [
  '/',
  '/combos/',
  '/impresiones/',
  '/p/01a131ed-153a-721e-94fc-2eb8f6b9a44c/',
] as const;
const VIEWPORT_WIDTHS = [390, 768, 1440, 2048] as const;

for (const route of ROUTES) {
  test(`shared footer fully contains its content on ${route}`, async ({ page }) => {
    for (const width of VIEWPORT_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      const bounds = await page.locator('#footer-container').evaluate((footer) => {
        const content = footer.querySelector<HTMLElement>('.footer-content');
        if (!content) {
          throw new Error('Missing shared footer content');
        }

        const containerRect = footer.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();

        return {
          containerTop: containerRect.top,
          containerBottom: containerRect.bottom,
          contentTop: contentRect.top,
          contentBottom: contentRect.bottom,
          colorsMatch:
            getComputedStyle(footer).backgroundColor === getComputedStyle(content).backgroundColor,
        };
      });

      expect(bounds.contentTop, `${route} ${width}px: footer content exceeds the top`).toBeGreaterThanOrEqual(
        bounds.containerTop - 1
      );
      expect(bounds.contentBottom, `${route} ${width}px: footer content exceeds the bottom`).toBeLessThanOrEqual(
        bounds.containerBottom + 1
      );
      expect(bounds.colorsMatch, `${route} ${width}px: footer has a split background`).toBe(true);
    }
  });
}
