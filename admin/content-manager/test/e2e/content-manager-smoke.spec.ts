import { test, expect, type Page } from '@playwright/test';

// The launch-credential prompt (plan 071) covers the UI with a modal until a
// value is saved. Read-only browsing works without a real credential, so the
// smoke tests mimic the operator gesture with a placeholder value.
async function dismissCredentialPrompt(page: Page): Promise<void> {
  const input = page.getByPlaceholder('x-admin-credential');
  if (await input.isVisible()) {
    await input.fill('e2e-smoke');
    await page.getByRole('button', { name: 'Guardar' }).click();
  }
}

test('health endpoint returns ok', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3000/api/v1/health');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe('ok');
});

test('home page loads and shows products heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Productos');
});

test('categories page loads', async ({ page }) => {
  await page.goto('/categories');
  await expect(page.locator('h1')).toContainText('Categorías');
});

test('media page loads', async ({ page }) => {
  await page.goto('/media');
  await expect(page.locator('h1')).toContainText('Medios');
});

test('history page loads', async ({ page }) => {
  await page.goto('/history');
  await expect(page.locator('h1')).toContainText('Historial');
});

test('bundles page loads', async ({ page }) => {
  await page.goto('/bundles');
  await expect(page.locator('h1')).toContainText('Combos');
});

test('import page loads', async ({ page }) => {
  await page.goto('/import');
  await expect(page.locator('h1')).toContainText('Importar');
});

test('conflicts page loads', async ({ page }) => {
  await page.goto('/conflicts');
  await expect(page.locator('h1')).toContainText('Conflictos');
});

test('publication page loads', async ({ page }) => {
  await page.goto('/publish');
  await expect(page.locator('h1')).toContainText('Publicación');
});

test('product API returns catalog data', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3000/api/v1/products');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty('items');
  expect(body).toHaveProperty('total');
  expect(Array.isArray(body.items)).toBe(true);
});

test('category API returns registry', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3000/api/v1/categories');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty('categories');
  expect(Array.isArray(body.categories)).toBe(true);
});

test('media API returns inventory', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3000/api/v1/media');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty('items');
  expect(body).toHaveProperty('summary');
});

test('history API returns entries', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3000/api/v1/history');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty('entries');
  expect(body).toHaveProperty('total_products');
});

test('bootstrap endpoint returns config without serving the launch credential', async ({
  request,
}) => {
  const response = await request.get('http://127.0.0.1:3000/api/v1/bootstrap');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty('capabilities');
  expect(body).not.toHaveProperty('credential');
});

test('navigation links work between pages', async ({ page }) => {
  await page.goto('/media');
  await expect(page.locator('h1')).toContainText('Medios');
  await dismissCredentialPrompt(page);
  await page.locator("nav a[href='/categories']").click();
  await expect(page.locator('h1')).toContainText('Categorías');
  await page.locator("nav a[href='/products']").click();
  await expect(page.locator('h1')).toContainText('Productos');
});
