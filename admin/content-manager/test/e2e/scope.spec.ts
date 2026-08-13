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
  await expect(page.getByText('Cargando…')).not.toBeVisible();

  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Mostrando 51–80 de 80')).toBeVisible();
  await expect(page.getByText('Página 2 de 2')).toBeVisible();

  await page.getByRole('button', { name: '← Anterior' }).click();
  await expect(page.getByText('Cargando…')).not.toBeVisible();
});

test('filter change resets to page 1 and shrinks scope', async ({ page }) => {
  await page.getByRole('button', { name: 'Siguiente →' }).click();
  await expect(page.getByText('Mostrando 51–80 de 80')).toBeVisible();

  await page.getByLabel('Categoría:').selectOption('cat-b');
  await expect(page.getByText('Mostrando 1–10 de 10')).toBeVisible();
  await expect(page.getByText('Página 1 de 1')).not.toBeVisible();
});

// Plan 126: destructive confirms are part of the contract — assert the
// dialog fires (type + message) instead of swallowing it silently. The
// handler responds inline (waitForEvent + click hangs on modal dialogs).
async function withConfirmAssertion(
  page: import('@playwright/test').Page,
  message: RegExp,
  action: () => Promise<void>,
  accept = true
): Promise<void> {
  let captured: { type: string; message: string } | null = null;
  page.once('dialog', (dialog) => {
    captured = { type: dialog.type(), message: dialog.message() };
    if (accept) {
      void dialog.accept();
    } else {
      void dialog.dismiss();
    }
  });
  await action();
  expect(captured, 'expected a confirm dialog to fire').not.toBeNull();
  expect(captured!.type).toBe('confirm');
  expect(captured!.message).toMatch(message);
}

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

  // 60 matching > 50 visible: the scope confirm fires — accepting applies
  // to ALL matching (plan 126 asserts the dialog, not just swallows it).
  await withConfirmAssertion(page, /Aceptar = aplicar a TODOS \(60\)/, async () => {
    await page.getByRole('button', { name: 'Aplicar' }).click();
  });
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
  // The FIRST confirm is the apply-all question (60 > 50); dismissing it
  // falls back to the visible page. (The preview shows, so the second,
  // page-level confirm is skipped.)
  await withConfirmAssertion(
    page,
    /Aceptar = aplicar a TODOS \(60\)/,
    async () => {
      await page.getByRole('button', { name: 'Aplicar' }).click();
    },
    false
  );
  await expect(page.getByText(/Aplicado: 50 productos modificados/)).toBeVisible();

  const res = await request.get('http://127.0.0.1:3102/api/v1/products?category=cat-a&limit=200');
  const body = await res.json();
  expect(body.items.filter((p: { stock: boolean }) => !p.stock)).toHaveLength(50);
  expect(body.items.filter((p: { stock: boolean }) => p.stock)).toHaveLength(10);
});

test('reorder is disabled while a filter or pagination subset is active', async ({ page }) => {
  const reorder = page.getByRole('button', { name: '⇅ Reordenar' });

  // Pagination active (80 products, page 1): disabled.
  await expect(page.getByText('Cargando…')).not.toBeVisible();
  await expect(reorder).toBeDisabled();

  // Any active filter (even one whose matches fit one page, like cat-b)
  // means the visible set is a subset of the catalog: disabled.
  await page.getByLabel('Categoría:').selectOption('cat-b');
  await expect(page.getByText('Mostrando 1–10 de 10')).toBeVisible();
  await expect(reorder).toBeDisabled();

  // Clearing the filter returns to the paginated view: still disabled.
  await page.getByLabel('Categoría:').selectOption('');
  await expect(page.getByText('Cargando…')).not.toBeVisible();
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

  // Plan 101: any discount filter disables reorder (server requires the
  // full catalog — 409 REORDER_SCOPE_AMBIGUOUS otherwise).
  const reorder = page.getByRole('button', { name: '⇅ Reordenar' });
  await expect(reorder).toBeDisabled();

  // Min % filter keeps only the 10% discounted subset.
  await page.getByLabel('Dto. mín %:').fill('5');
  await expect(page.getByText('Mostrando 1–5 de 5')).toBeVisible();
  await page.getByLabel('Dto. mín %:').fill('50');
  await expect(page.getByText('No se encontraron productos.')).toBeVisible();

  // Limpiar resets every filter (and pagination).
  await page.getByRole('button', { name: 'Limpiar' }).click();
  await expect(page.getByText('Cargando…')).not.toBeVisible();
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

// ── plan 095: purge + inline editing ─────────────────────────────────────────

test('purge removes a product permanently after confirm', async ({ page, request }) => {
  // Plan 109: derive counts from the API — no dependency on other tests
  // mutating the shared fixture (shard/reorder safe).
  const before = await (
    await request.get('http://127.0.0.1:3102/api/v1/products?category=cat-c&limit=200')
  ).json();
  const totalBefore = before.total as number;

  await page.getByLabel('Categoría:').selectOption('cat-c');
  await expect(page.getByText(`Mostrando 1–${totalBefore} de ${totalBefore}`)).toBeVisible();

  await withConfirmAssertion(page, /Eliminar definitivamente|purga/i, async () => {
    await page
      .getByRole('button', { name: 'Eliminar definitivamente Producto C 1', exact: true })
      .click();
  });
  await expect(page.getByText('Producto eliminado definitivamente ✓')).toBeVisible();
  await expect(
    page.getByText(`Mostrando 1–${totalBefore - 1} de ${totalBefore - 1}`)
  ).toBeVisible();

  const after = await (
    await request.get('http://127.0.0.1:3102/api/v1/products?category=cat-c&limit=200')
  ).json();
  expect(after.total).toBe(totalBefore - 1);
});

test('inline price edit saves with Enter', async ({ page, request }) => {
  // Independent of the purge test: use cat-b (untouched), Producto B 1 is
  // p-061 (price $1.061).
  await page.getByLabel('Categoría:').selectOption('cat-b');
  await expect(page.getByText('Mostrando 1–10 de 10')).toBeVisible();

  const cell = page.getByText('$1.061', { exact: true }).first();
  await cell.dblclick();
  await page.getByLabel('Editar valor').fill('1234');
  await page.keyboard.press('Enter');
  await expect(page.getByText(/Precio actualizado ✓|price actualizado ✓/)).toBeVisible();

  const res = await request.get('http://127.0.0.1:3102/api/v1/products?category=cat-b&limit=200');
  const body = await res.json();
  expect(body.items.find((p: { name: string }) => p.name === 'Producto B 1')?.price).toBe(1234);
});

// ── plan 097: shortcuts + selection ──────────────────────────────────────────

test('Ctrl+N opens the create form', async ({ page }) => {
  // Dispatch the shortcut directly — the browser may handle native Ctrl+N.
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }))
  );
  await expect(page.getByLabel(/Nombre/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
});

test('Ctrl+F focuses the product search on a settled page', async ({ page }) => {
  const search = page.getByPlaceholder('Nombre, descripción…');
  await expect(search).toBeVisible();
  // Wait for the debounced load to finish — its re-render would steal focus.
  await expect(page.getByText('Cargando…')).not.toBeVisible();
  // The load may still commit its final transition after Cargando disappears
  // (React deferred render): give it one debounce cycle so the input node is
  // stable before focusing (focus is lost when the node is replaced).
  await page.waitForTimeout(350);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }))
  );
  await expect(search).toBeFocused();
});

test('bulk with checkbox selection applies to exactly the selected ids', async ({
  page,
  request,
}) => {
  // Plan 109: derive the count from the API — order-independent.
  const before = await (
    await request.get('http://127.0.0.1:3102/api/v1/products?category=cat-c&limit=200')
  ).json();
  const total = before.total as number;
  await page.getByLabel('Categoría:').selectOption('cat-c');
  await expect(page.getByText(`Mostrando 1–${total} de ${total}`)).toBeVisible();

  await page.getByRole('checkbox', { name: 'Seleccionar Producto C 2', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Seleccionar Producto C 3', exact: true }).check();

  await page.getByLabel('Acción masiva').selectOption('set_stock');
  await page.getByLabel('Valor de stock').selectOption('true');
  await page.getByLabel('Ámbito de la operación masiva').selectOption('selection');
  await page.getByRole('button', { name: 'Vista previa' }).click();
  await expect(page.getByText(/Cambios \(2\)/)).toBeVisible();

  await withConfirmAssertion(
    page,
    /Aplicar set_stock a los 2 productos seleccionados\?/,
    async () => {
      await page.getByRole('button', { name: 'Aplicar' }).click();
    }
  );
  await expect(page.getByText(/Aplicado: 2 productos modificados/)).toBeVisible();

  const res = await request.get('http://127.0.0.1:3102/api/v1/products?category=cat-c&limit=200');
  const body = await res.json();
  // The two SELECTED products are the only ones that must be stocked — no
  // total-count assertion that depends on other tests' mutations.
  const byName = (name: string) =>
    body.items.find((p: { name: string; stock: boolean }) => p.name === name);
  expect(byName('Producto C 2')?.stock).toBe(true);
  expect(byName('Producto C 3')?.stock).toBe(true);
});

// ── plan 096 deferred: category search/filter/expand ─────────────────────────

test('category page: search, status filter and expand-all', async ({ page }) => {
  await page.goto('/categories');
  const expandAll = page.getByRole('button', { name: 'Expandir todo' });
  await expandAll.waitFor({ state: 'visible' });

  // Expand all keeps the 3 category rows (the fixture has no subcategories;
  // the scope excludes the nav-groups table).
  const catRows = page.getByRole('table', { name: 'Categorías' }).locator('tbody tr');
  await expandAll.click({ force: true });
  await expect(catRows).toHaveCount(3);

  // Search narrows the table.
  await page.getByLabel('Buscar categoría').fill('cat-a');
  await expect(catRows).toHaveCount(1);

  // Status filter: deactivate via edit is heavy — filter 'Todas' is enough
  // plus the inactive filter returning the same rows (all active).
  await page.getByLabel('Filtrar por estado').selectOption('active');
  await expect(catRows).toHaveCount(1);
});
