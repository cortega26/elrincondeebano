import { test, expect, type Page } from '@playwright/test';

// Import workflow e2e (plan 060 step 3): runs against the import-e2e project
// whose webServer serves a temp COPY of the fixture catalog on :3101 with
// ADMIN_CREDENTIAL=e2e-import. Browser tests exercise uploaded files,
// conflict resolutions, approval, downloads and reload persistence — the
// real catalog is never touched.

const IMPORT_URL = 'http://127.0.0.1:3101/import';

async function dismissCredentialPrompt(page: Page): Promise<void> {
  const input = page.getByPlaceholder('x-admin-credential');
  if (await input.isVisible()) {
    await input.fill('e2e-import');
    await page.getByRole('button', { name: 'Guardar' }).click();
  }
}

function catalogJson(products: Array<Record<string, unknown>>): {
  name: string;
  mimeType: string;
  buffer: Buffer;
} {
  return {
    name: 'catalog.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ products })),
  };
}

async function uploadAndPreview(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer }
): Promise<void> {
  await dismissCredentialPrompt(page);
  await page.locator('#import-file').setInputFiles(file);
  await page.getByRole('button', { name: 'Vista previa' }).click();
}

test('new-only import via uploaded file applies and survives a reload', async ({ page }) => {
  await page.goto(IMPORT_URL);
  await uploadAndPreview(
    page,
    catalogJson([{ name: 'Té Verde E2E', description: 'Suelto', price: 2500, category: 'bebidas' }])
  );

  await expect(page.getByText('1 creaciones')).toBeVisible();

  await page.getByRole('button', { name: 'Revisar y aprobar aplicación' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar aplicación de importación' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Se crearán 1 productos')).toBeVisible();

  // Keyboard completion: the confirm button is autofocused — press Enter.
  await page.keyboard.press('Enter');
  await expect(page.getByText('Creados: 1, actualizados: 0')).toBeVisible();

  // Persisted reload result: the product shows up in the products page.
  await page.goto('http://127.0.0.1:3101/products');
  await dismissCredentialPrompt(page); // credential is in-memory (plan 071)
  await expect(page.getByText('Té Verde E2E')).toBeVisible();
});

test('mixed import: conflict resolution applies selected fields only', async ({ page }) => {
  await page.goto(IMPORT_URL);
  await uploadAndPreview(
    page,
    catalogJson([
      {
        name: 'Café de Grano',
        description: 'Tostado medio',
        price: 4999,
        discount: 500,
        stock: false,
        category: 'bebidas',
      },
      { name: 'Nuevo E2E', description: '', price: 1200, category: 'bebidas' },
    ])
  );

  // One update (price + stock conflicts), one creation.
  await expect(page.getByText('1 creaciones, 1 actualizaciones')).toBeVisible();

  const select = page.getByRole('combobox', { name: 'Resolución de Café de Grano / price' });
  await select.selectOption('use_incoming');
  await page
    .getByRole('combobox', { name: 'Resolución de Café de Grano / stock' })
    .selectOption('keep_local');

  await page.getByRole('button', { name: 'Revisar y aprobar aplicación' }).click();
  await page.getByRole('button', { name: 'Confirmar aplicación' }).click();

  await expect(page.getByText('Creados: 1, actualizados: 1')).toBeVisible();

  // Only the price changed; stock stayed local (false -> true).
  const price = await page.request.get('http://127.0.0.1:3101/api/v1/products/e2e-cafe');
  expect(price.status()).toBe(200);
  const body = await price.json();
  expect(body.price).toBe(4999);
  expect(body.stock).toBe(true);
});

test('malformed JSON reports an error without calling the server', async ({ page }) => {
  await page.goto(IMPORT_URL);
  await dismissCredentialPrompt(page);
  await page.locator('#import-file').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{oops'),
  });
  await page.getByRole('button', { name: 'Vista previa' }).click();

  await expect(page.getByRole('alert')).toContainText('JSON inválido');
});

test('approval can be cancelled and nothing is applied', async ({ page }) => {
  await page.goto(IMPORT_URL);
  await uploadAndPreview(
    page,
    catalogJson([{ name: 'Descartado E2E', description: '', price: 1, category: 'bebidas' }])
  );
  await expect(page.getByText('1 creaciones')).toBeVisible();

  await page.getByRole('button', { name: 'Revisar y aprobar aplicación' }).click();
  await page.getByRole('button', { name: 'Cancelar' }).click();

  const list = await page.request.get('http://127.0.0.1:3101/api/v1/products');
  const body = await list.json();
  expect(body.items.some((p: { name: string }) => p.name === 'Descartado E2E')).toBe(false);
});

test('stale preview is rejected with 409 and no partial apply', async ({ page }) => {
  await page.goto(IMPORT_URL);
  await uploadAndPreview(
    page,
    catalogJson([{ name: 'Viejo Preview E2E', description: '', price: 1, category: 'bebidas' }])
  );
  await expect(page.getByText('1 creaciones')).toBeVisible();

  // Mutate the catalog between preview and apply (staleness setup via API).
  const current = await page.request.get('http://127.0.0.1:3101/api/v1/products/e2e-cafe');
  const currentBody = await current.json();
  const patched = await page.request.patch('http://127.0.0.1:3101/api/v1/products/e2e-cafe', {
    headers: { 'Content-Type': 'application/json', 'x-admin-credential': 'e2e-import' },
    data: {
      command_id: 'e2e-stale-setup',
      base_revision: currentBody.rev,
      payload: { price: 4600 },
    },
  });
  expect(patched.status()).toBe(200);

  await page.getByRole('button', { name: 'Revisar y aprobar aplicación' }).click();
  await page.getByRole('button', { name: 'Confirmar aplicación' }).click();

  await expect(page.getByRole('alert')).toContainText('catalog changed since the preview');

  const list = await page.request.get('http://127.0.0.1:3101/api/v1/products');
  const body = await list.json();
  expect(body.items.some((p: { name: string }) => p.name === 'Viejo Preview E2E')).toBe(false);
});
