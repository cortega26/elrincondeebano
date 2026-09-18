import { test, expect, type Page } from '@playwright/test';
import { e2eCredential } from './e2eCredential.ts';

// Media workbench e2e (plan 063 step 5): upload -> intent -> run -> apply
// through the UI against the temp fixture repo on :3103.

const BASE = 'http://127.0.0.1:3103';

async function dismissCredentialPrompt(page: Page): Promise<void> {
  const input = page.getByPlaceholder('x-admin-credential');
  if (await input.isVisible()) {
    await input.fill(e2eCredential());
    await page.getByRole('button', { name: 'Guardar' }).click();
  }
}

// 1x1 white PNG
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

test('upload -> create intent -> run avif -> apply updates product and assets', async ({
  page,
}) => {
  await page.goto(`${BASE}/media`);
  await dismissCredentialPrompt(page);

  // Upload a real PNG through the file input.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'cafe.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_B64, 'base64'),
  });
  await expect(page.getByRole('status')).toContainText('staging');

  // Target path was prefilled; select the product and create the intent.
  const target = page.getByLabel('Ruta destino');
  await expect(target).toHaveValue('assets/images/cafe.png');
  await page.getByLabel('Producto destino').selectOption('e2e-cafe');
  await page.getByRole('button', { name: 'Crear intent' }).click();
  await expect(page.getByRole('status')).toContainText('Intent creado');

  // Run the avif job and wait for success.
  await page.getByRole('button', { name: 'Ejecutar', exact: true }).click();
  await expect(page.getByText('Listo')).toBeVisible({ timeout: 15_000 });

  // Apply: the product gains the AVIF reference and the canonical file exists.
  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('aplicado');

  const product = await page.request.get(`${BASE}/api/v1/products/e2e-cafe`);
  const body = await product.json();
  expect(body.image_avif_path).toBe('assets/images/cafe.avif');

  // Inventory shows the canonical asset (assets-relative path).
  await expect(page.getByText('cafe.avif')).toBeVisible();
});

test('garbage upload is rejected without staging', async ({ page }) => {
  await page.goto(`${BASE}/media`);
  await dismissCredentialPrompt(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('definitely-not-a-png'),
  });
  await expect(page.getByRole('alert')).toContainText('does not match the file content');
});

test('batch select -> cancel -> discard multiple intents (plan 127 F2.4)', async ({
  page,
  request,
}) => {
  // Seed three pending OG intents via the API (no staged files needed).
  for (const seedSlug of ['batch-1', 'batch-2', 'batch-3']) {
    const res = await request.post(`${BASE}/api/v1/media/intents`, {
      headers: { 'x-admin-credential': e2eCredential(), 'Content-Type': 'application/json' },
      data: {
        type: 'og',
        target_path: `assets/images/og/categories/${seedSlug}.png`,
        category_slug: seedSlug,
      },
    });
    expect(res.status()).toBe(201);
  }

  await page.goto(`${BASE}/media`);
  await dismissCredentialPrompt(page);

  const table = page.getByRole('table', { name: 'Intents de medios' });
  // Test 1 leaves an avif intent in the fixture — scope to OUR rows.
  const myRows = table.locator('tbody tr', { hasText: 'batch-' });
  await expect(myRows).toHaveCount(3);

  // Select all three rows.
  for (let i = 0; i < 3; i += 1) {
    await myRows.nth(i).locator('input[type=checkbox]').check();
  }

  await expect(page.getByText('3 seleccionados')).toBeVisible();

  // Batch cancel: pending -> cancelled.
  // (Plan 193: wait for enabled — under parallel load the selection state
  // lags and the button stays disabled past the click.)
  const cancelSelected = page.getByRole('button', { name: 'Cancelar seleccionados' });
  await expect(cancelSelected).toBeEnabled({ timeout: 10_000 });
  await cancelSelected.click();
  await expect(page.getByRole('status')).toContainText('Batch cancel: 3 aplicados');

  // Batch actions clear the selection by design — re-select for discard.
  for (let i = 0; i < 3; i += 1) {
    await myRows.nth(i).locator('input[type=checkbox]').check();
  }
  await expect(page.getByText('3 seleccionados')).toBeVisible();

  // Batch discard: rows disappear.
  const discardSelected = page.getByRole('button', { name: 'Descartar seleccionados' });
  await expect(discardSelected).toBeEnabled({ timeout: 10_000 });
  // Native confirm() blocks the renderer main thread, which stalls any
  // post-click CDP round-trip — so handle the dialog via a pre-registered
  // listener and never await the click's aftermath (plan 193).
  let discardDialogMessage = '';
  page.on('dialog', (dialog) => {
    discardDialogMessage = dialog.message();
    void dialog.accept();
  });
  await discardSelected.click({ noWaitAfter: true });
  await expect
    .poll(() => discardDialogMessage, { timeout: 10_000 })
    .toContain('Descartar 3 intents');
  await expect(page.getByRole('status')).toContainText('Batch discard: 3 aplicados');
  await expect(table.locator('tbody tr', { hasText: 'batch-' })).toHaveCount(0);
});
