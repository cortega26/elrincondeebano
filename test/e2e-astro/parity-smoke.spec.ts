import { expect, test } from '@playwright/test';

test('home renders with navbar, catalog, and SEO tags', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__APP_READY__ === true);

  await expect(page.locator('#navbar-container')).toBeVisible();
  await expect(page.locator('#product-container .producto').first()).toBeVisible();

  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute('href', 'https://elrincondeebano.com/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /https:\/\/elrincondeebano\.com\//);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
});

test('legacy category route /pages/*.html stays available', async ({ page }) => {
  await page.goto('/pages/bebidas.html', { waitUntil: 'networkidle' });
  await expect(page.locator('#category-heading')).toHaveText(/Bebidas/i);
  await expect(page.locator('#product-container .producto').first()).toBeVisible();

  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute('href', 'https://elrincondeebano.com/pages/bebidas.html');
});

test('active empty category route is generated', async ({ page }) => {
  await page.goto('/pages/e.html', { waitUntil: 'networkidle' });
  await expect(page.locator('#category-heading')).toHaveText(/Electrónicos/i);
  await expect(page.locator('main .alert.alert-info').last()).toContainText('No hay productos disponibles');
});

test('service worker and compatibility artifacts are served', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  for (const path of ['/robots.txt', '/sitemap.xml', '/404.html', '/service-worker.js', '/data/product_data.json']) {
    const response = await page.request.get(path);
    expect(response.status(), `${path} should be available`).toBe(200);
  }
});
