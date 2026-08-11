import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:3104';

async function dismissCredentialPrompt(page: Page): Promise<void> {
  const input = page.getByPlaceholder('x-admin-credential');
  if (await input.isVisible()) {
    await input.fill('e2e-import');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  }
}

test('bundle create with product picker persists and survives reload', async ({ page }) => {
  await page.goto(`${BASE}/bundles`);
  await dismissCredentialPrompt(page);

  await page.getByRole('button', { name: '+ Nuevo combo' }).click();
  await page.getByLabel('ID del combo 1').fill('e2e-combo');
  await page.getByLabel('Título del combo 1').fill('Combo E2E');
  await page.getByLabel('Descripción del combo 1').fill('Café y agua');
  await page.getByRole('button', { name: '+ Agregar producto' }).click();
  await page.getByRole('button', { name: 'Café de Grano (bebidas)' }).click();

  await page.getByRole('button', { name: 'Guardar combos' }).click();
  await expect(page.getByRole('status')).toContainText('guardados');

  await page.reload();
  await dismissCredentialPrompt(page);
  await expect(page.getByLabel('Título del combo 1')).toHaveValue('Combo E2E');
  await expect(page.getByText('Café de Grano')).toBeVisible();

  const projection = await page.request.get(`${BASE}/api/v1/storefront/bundles`);
  const body = await projection.json();
  expect(body.bundles).toHaveLength(1);
  expect(body.bundles[0].id).toBe('e2e-combo');
});

test('delete-last bundle persists [] in the projection Astro loads', async ({ page }) => {
  const created = await page.request.put(`${BASE}/api/v1/storefront/bundles`, {
    headers: { 'Content-Type': 'application/json', 'x-admin-credential': 'e2e-import' },
    data: {
      bundles: [
        {
          id: 'tmp-bundle',
          title: 'Temporal',
          description: 'Para borrar',
          items: [{ category: 'bebidas', name: 'Café de Grano' }],
        },
      ],
    },
  });
  expect(created.status()).toBe(200);

  await page.goto(`${BASE}/bundles`);
  await dismissCredentialPrompt(page);
  await page.getByRole('button', { name: 'Eliminar combo 1' }).click();
  await page.getByRole('button', { name: 'Guardar combos' }).click();
  await expect(page.getByRole('status')).toContainText('guardados');

  const projection = await page.request.get(`${BASE}/api/v1/storefront/bundles`);
  expect((await projection.json()).bundles).toEqual([]);
});

test('featured edits preserve unrelated subtrees byte-semantically', async ({ page }) => {
  await page.goto(`${BASE}/bundles`);
  await dismissCredentialPrompt(page);

  await page.getByRole('button', { name: '+ Agregar destacado' }).click();
  await page.getByRole('button', { name: 'Agua Mineral (bebidas)' }).click();
  await page.getByRole('button', { name: 'Guardar destacados' }).click();
  await expect(page.getByRole('status')).toContainText('guardados');

  const featured = await page.request.get(`${BASE}/api/v1/storefront/featured`);
  const body = await featured.json();
  expect(body.featuredStaples).toEqual([{ category: 'bebidas', name: 'Agua Mineral' }]);
  // The trust bar was never touched.
  expect(body.trustBar).toEqual({ highlights: [], statusItems: [] });
});
