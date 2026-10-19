import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import { e2eCredential } from './e2eCredential.ts';

// Lazy product form e2e (plan 274): create-save and edit-save against the
// isolated 80-product fixture (playwright.products.config.ts, :3106). The
// form arrives through React.lazy/Suspense (plan 271); these tests exercise
// the real write path, not just the unit-tested form logic.

async function dismissCredentialPrompt(page: Page): Promise<void> {
  const input = page.getByPlaceholder('x-admin-credential');
  if (await input.isVisible()) {
    await input.fill(e2eCredential());
    await page.getByRole('button', { name: 'Guardar' }).click();
  }
}

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

interface ChunkRequest {
  url: string;
  afterClick: boolean;
}

// Best-effort boundary probe: the hashed chunk name is build-dependent, so a
// missing observation only annotates the test; an eager (pre-click) request
// is still a real regression and fails.
function observeFormChunk(page: Page): { markClick: () => void; assertLazy: () => void } {
  const requests: ChunkRequest[] = [];
  let clicked = false;
  page.on('request', (request) => {
    if (/\/assets\/ProductForm-[^/]+\.js(?:\?|$)/.test(request.url())) {
      requests.push({ url: request.url(), afterClick: clicked });
    }
  });
  return {
    markClick(): void {
      clicked = true;
    },
    assertLazy(): void {
      expect(
        requests.filter((request) => !request.afterClick),
        'the ProductForm chunk must not be requested before the form opens'
      ).toHaveLength(0);
      if (requests.length === 0) {
        test.info().annotations.push({
          type: 'lazy-chunk',
          description: 'ProductForm-*.js not observed; the chunk name may have changed',
        });
        return;
      }
      expect(
        requests.some((request) => request.afterClick),
        'the ProductForm chunk should be requested when the form opens'
      ).toBe(true);
      test.info().annotations.push({
        type: 'lazy-chunk',
        description: requests.map((request) => request.url).join(', '),
      });
    },
  };
}

async function openProducts(page: Page): Promise<string[]> {
  const consoleErrors = watchConsole(page);
  await page.goto('/products');
  await dismissCredentialPrompt(page);
  await expect(page.locator('h1')).toContainText('Productos');
  await expect(page.getByText('Cargando…')).not.toBeVisible();
  return consoleErrors;
}

test('create: the lazy form saves a new product and the row appears', async ({ page }) => {
  const chunk = observeFormChunk(page);
  const consoleErrors = await openProducts(page);

  chunk.markClick();
  await page.getByRole('button', { name: '+ Nuevo' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible();

  const productName = `Producto Lazy E2E ${Date.now()}`;
  await page.getByLabel(/Nombre/).fill(productName);
  await page.getByLabel(/Precio \*/).fill('4321');
  const category = page.getByLabel(/Categoría \*/);
  await expect(category.locator('option')).toHaveCount(3);
  await category.selectOption('cat-a');

  chunk.assertLazy();

  await page.getByRole('button', { name: 'Crear producto' }).click();
  await expect(page.getByText('Producto creado ✓')).toBeVisible();

  await page.getByPlaceholder('Nombre, descripción…').fill(productName);
  await expect(
    page.getByRole('table', { name: 'Lista de productos' }).getByText(productName, { exact: true })
  ).toBeVisible();

  expect(consoleErrors, 'no console errors expected').toEqual([]);
});

test('edit: the lazy form saves a changed field and the row reflects it', async ({ page }) => {
  const chunk = observeFormChunk(page);
  const consoleErrors = await openProducts(page);

  await page.getByLabel('Categoría:').selectOption('cat-b');
  await expect(page.getByText('Mostrando 1–10 de 10')).toBeVisible();

  chunk.markClick();
  await page.getByRole('button', { name: 'Editar Producto B 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Editar: Producto B 1' })).toBeVisible();

  const price = page.getByLabel(/Precio \*/);
  await expect(price).toBeVisible();
  const nextPrice = Number(await price.inputValue()) + 1;
  await price.fill(String(nextPrice));
  chunk.assertLazy();

  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Producto actualizado ✓')).toBeVisible();

  const row = page.getByRole('row', { name: /Producto B 1\b/ });
  await expect(
    row.getByText(`$${nextPrice.toLocaleString('es-CL')}`, { exact: true })
  ).toBeVisible();

  expect(consoleErrors, 'no console errors expected').toEqual([]);
});
