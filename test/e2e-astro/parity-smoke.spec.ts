import { expect, test } from '@playwright/test';

test('home renders with navbar, catalog, and SEO tags', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__APP_READY__ === true);

  await expect(page.locator('#navbar-container')).toBeVisible();
  await expect(page.locator('#product-container .producto').first()).toBeVisible();

  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute('href', 'https://www.elrincondeebano.com/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    /https:\/\/www\.elrincondeebano\.com\//
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image'
  );
});

test('legacy category route /pages/*.html stays available', async ({ page }) => {
  await page.goto('/pages/bebidas.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__APP_READY__ === true);
  await expect(page.locator('#category-heading')).toHaveText(/Bebidas/i);
  await expect(page.locator('#product-container .producto').first()).toBeVisible();

  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveAttribute('href', 'https://www.elrincondeebano.com/bebidas/');
});

test('category route variants share catalog output while keeping route-specific SEO policy', async ({
  page,
}) => {
  const variants = [
    { path: '/bebidas/', robots: null },
    { path: '/c/bebidas/', robots: 'noindex, follow' },
    { path: '/pages/bebidas.html', robots: 'noindex, follow' },
  ];
  const snapshots = [];

  for (const variant of variants) {
    await page.goto(variant.path, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__APP_READY__ === true);

    const products = await page.locator('#product-container .producto .card-title').evaluateAll(
      (elements) => elements.slice(0, 4).map((element) => element.textContent?.trim() || '')
    );
    const robotsLocator = page.locator('meta[name="robots"]');
    const robots =
      (await robotsLocator.count()) > 0 ? await robotsLocator.getAttribute('content') : null;

    snapshots.push({
      heading: await page.locator('#category-heading').textContent(),
      canonical: await page.locator('link[rel="canonical"]').getAttribute('href'),
      robots,
      products,
    });
  }

  expect(snapshots[0].heading).toMatch(/Bebidas/i);
  expect(snapshots[0].canonical).toBe('https://www.elrincondeebano.com/bebidas/');
  expect(snapshots[1].canonical).toBe('https://www.elrincondeebano.com/bebidas/');
  expect(snapshots[2].canonical).toBe('https://www.elrincondeebano.com/bebidas/');
  expect(snapshots[0].robots).toBeNull();
  expect(snapshots[1].robots).toBe('noindex, follow');
  expect(snapshots[2].robots).toBe('noindex, follow');
  expect(snapshots[1].products).toEqual(snapshots[0].products);
  expect(snapshots[2].products).toEqual(snapshots[0].products);
});

test('disabled category route is not generated', async ({ page }) => {
  const response = await page.goto('/pages/e.html', { waitUntil: 'networkidle' });
  expect(response, 'disabled legacy category route should return a response').not.toBeNull();
  expect(response?.status()).toBe(404);
  await expect(page.locator('#category-heading')).toHaveCount(0);
});

test('service worker and compatibility artifacts are served', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => 'serviceWorker' in navigator);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  for (const path of [
    '/robots.txt',
    '/sitemap.xml',
    '/404.html',
    '/service-worker.js',
    '/data/product_data.json',
  ]) {
    const response = await page.request.get(path);
    expect(response.status(), `${path} should be available`).toBe(200);
  }
});
