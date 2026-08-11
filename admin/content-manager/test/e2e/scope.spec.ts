import { test, expect, type Page } from '@playwright/test';

// Pagination and bulk/reorder scope e2e (plan 088) against the isolated
// 80-product fixture (playwright.scope.config.ts, :3102).

async function dismissCredentialPrompt(page: Page): Promise<void> {
  const input = page.getByPlaceholder('x-admin-credential');
  if (await input.isVisible()) {
    await input.fill('e2e-scope');
    await page.getByRole('button', { name: 'Guardar' }).click();
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/products');
  await dismissCredentialPrompt(page);
  await expect(page.locator('h1')).toContainText('Productos');
});

test('pagination: shows X–Y de N and navigates pages', async ({ page }) => {
  await expect(page.getByText('Mostrando 1–50 de 80')).toBeVisible();

  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Mostrando 51–80 de 80')).toBeVisible();
  await expect(page.getByText('Página 2 de 2')).toBeVisible();

  await page.getByRole('button', { name: '← Anterior' }).click();
  await expect(page.getByText('Mostrando 1–50 de 80')).toBeVisible();
});

test('filter change resets to page 1 and shrinks scope', async ({ page }) => {
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Mostrando 51–80 de 80')).toBeVisible();

  await page.getByLabel('Categoría:').selectOption('cat-b');
  await expect(page.getByText('Mostrando 1–10 de 10')).toBeVisible();
  await expect(page.getByText('Página 1 de 1')).not.toBeVisible();
});

test('bulk apply with a subset asks for scope; accept applies to ALL matching', async ({
  page,
  request,
}) => {
  // Filter to cat-a (60 matching): the page shows 50, total is 60.
  await page.getByLabel('Categoría:').selectOption('cat-a');
  await expect(page.getByText('Mostrando 1–50 de 60')).toBeVisible();

  await page.getByLabel('Acción masiva').selectOption('set_stock');
  await page.getByLabel('Ámbito de la operación masiva').selectOption('all');
  await page.getByRole('button', { name: 'Vista previa' }).click();
  await expect(page.getByText(/Cambios \(/)).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText(/Aplicado: 60 productos modificados/)).toBeVisible();

  const res = await request.get('http://127.0.0.1:3102/api/v1/products?category=cat-a&limit=200');
  const body = await res.json();
  expect(body.total).toBe(60);
  expect(body.items.every((p: { stock: boolean }) => p.stock)).toBe(true);

  // cat-b products were not touched by the scoped apply.
  const resB = await request.get('http://127.0.0.1:3102/api/v1/products?category=cat-b&limit=200');
  const bodyB = await resB.json();
  expect(bodyB.items.every((p: { stock: boolean }) => !p.stock)).toBe(true);
});

test('bulk apply cancel keeps the visible page only', async ({ page, request }) => {
  // Test 3 flipped cat-a stock to true for all 60; this test flips the
  // visible page back to false and cancels the "all" scope.
  await page.getByLabel('Categoría:').selectOption('cat-a');
  await expect(page.getByText('Mostrando 1–50 de 60')).toBeVisible();

  await page.getByLabel('Acción masiva').selectOption('set_stock');
  await page.getByLabel('Valor de stock').selectOption('false');
  await page.getByLabel('Ámbito de la operación masiva').selectOption('page');
  await page.getByRole('button', { name: 'Vista previa' }).click();
  await expect(page.getByText(/Cambios \(/)).toBeVisible();

  // Cancel the scope confirm: only the visible 50 are applied. (Only this
  // one dialog appears — the page-level confirm is skipped because a
  // preview is already showing.)
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByText(/Aplicado: 50 productos modificados/)).toBeVisible();

  const res = await request.get('http://127.0.0.1:3102/api/v1/products?category=cat-a&limit=200');
  const body = await res.json();
  expect(body.items.filter((p: { stock: boolean }) => !p.stock)).toHaveLength(50);
  expect(body.items.filter((p: { stock: boolean }) => p.stock)).toHaveLength(10);
});

test('reorder is disabled while a filter or pagination subset is active', async ({ page }) => {
  const reorder = page.getByRole('button', { name: '⇅ Reordenar' });

  // Pagination active (80 products, page 1): disabled.
  await expect(page.getByText('Mostrando 1–50 de 80')).toBeVisible();
  await expect(reorder).toBeDisabled();

  // Any active filter (even one whose matches fit one page, like cat-b)
  // means the visible set is a subset of the catalog: disabled.
  await page.getByLabel('Categoría:').selectOption('cat-b');
  await expect(page.getByText('Mostrando 1–10 de 10')).toBeVisible();
  await expect(reorder).toBeDisabled();

  // Clearing the filter returns to the paginated view: still disabled.
  await page.getByLabel('Categoría:').selectOption('');
  await expect(page.getByText('Mostrando 1–50 de 80')).toBeVisible();
  await expect(reorder).toBeDisabled();
});

// ── plan 091: discount filters, clear, export ────────────────────────────────

test('discount filter narrows the view and Limpiar restores it', async ({ page }) => {
  await page.getByLabel('Categoría:').selectOption('cat-b');
  await expect(page.getByText('Mostrando 1–10 de 10')).toBeVisible();

  // 5 of cat-b's 10 products have a 10% discount.
  await page.getByLabel('Solo descuento').click();
  await expect(page.getByLabel('Solo descuento')).toBeChecked();
  await expect(page.getByText('Mostrando 1–5 de 5')).toBeVisible();

  // Min % filter keeps only the 10% discounted subset.
  await page.getByLabel('Dto. mín %:').fill('5');
  await expect(page.getByText('Mostrando 1–5 de 5')).toBeVisible();
  await page.getByLabel('Dto. mín %:').fill('50');
  await expect(page.getByText('No se encontraron productos.')).toBeVisible();

  // Limpiar resets every filter (and pagination).
  await page.getByRole('button', { name: 'Limpiar' }).click();
  await expect(page.getByText('Mostrando 1–50 de 80')).toBeVisible();
  await expect(page.getByLabel('Solo descuento')).not.toBeChecked();
});

test('CSV export downloads with the active filters', async ({ page }) => {
  await page.getByLabel('Categoría:').selectOption('cat-b');
  await page.getByLabel('Solo descuento').click();
  await expect(page.getByLabel('Solo descuento')).toBeChecked();
  await expect(page.getByText('Mostrando 1–5 de 5')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '⬇ CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^productos-\d{4}-\d{2}-\d{2}\.csv$/);

  const stream = await download.createReadStream();
  let text = '';
  for await (const chunk of stream) text += chunk.toString();
  expect(text.trim().split('\n')).toHaveLength(6); // header + 5 discounted
});

// ── plan 093: UX foundations (nav, shortcuts, dialog) ────────────────────────

test('persistent nav reaches every tool and marks the active route', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(nav.getByRole('link', { name: 'Productos' })).toHaveAttribute(
    'aria-current',
    'page'
  );

  await nav.getByRole('link', { name: 'Vitrina' }).click();
  await expect(page.locator('h1')).toContainText('Vitrina');
  await expect(nav.getByRole('link', { name: 'Vitrina' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: 'Cambios y recuperación' }).click();
  await expect(page.locator('h1')).toContainText('Cambios y recuperación');
});

test('g-key shortcuts navigate to history, bundles and publish', async ({ page }) => {
  await page.keyboard.press('g');
  await page.keyboard.press('h');
  await expect(page.locator('h1')).toContainText('Cambios y recuperación');

  await page.keyboard.press('g');
  await page.keyboard.press('b');
  await expect(page.locator('h1')).toContainText('Vitrina');

  await page.keyboard.press('g');
  await page.keyboard.press('u');
  await expect(page.locator('h1')).toContainText('Publicación');
});

test('credential dialog traps focus and closes with Escape', async ({ page }) => {
  // Reopen the prompt via the floating button.
  await page.getByRole('button', { name: 'Credencial ✓' }).click();
  const dialog = page.getByRole('dialog', { name: 'Launch credential' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');

  // Focus lands on the input on open; Tab cycles input -> Guardar -> input.
  await expect(page.getByPlaceholder('x-admin-credential')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByPlaceholder('x-admin-credential')).toBeFocused();

  // Escape closes; focus is not left on a removed node — Tab keeps moving
  // through real focusable elements (floating button first, then nav).
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Credencial ✓' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link').first()
  ).toBeFocused();
});

test('sortable columns expose aria-sort state', async ({ page }) => {
  const nameHeader = page.locator('th', { hasText: 'Nombre' });
  await expect(nameHeader).toHaveAttribute('aria-sort', 'none');
  await nameHeader.click();
  await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
  await nameHeader.click();
  await expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
});
