import { test, expect, type Page } from '@playwright/test';

// Change-set control center e2e (plan 062 step 5): create a change set via
// API (setup), then drive review -> validate -> apply -> undo -> redo through
// the UI with reloads in between. Runs against the temp fixture repo on :3102.

const BASE = 'http://127.0.0.1:3102';

async function dismissCredentialPrompt(page: Page): Promise<void> {
  const input = page.getByPlaceholder('x-admin-credential');
  if (await input.isVisible()) {
    await input.fill('e2e-import');
    await page.getByRole('button', { name: 'Guardar' }).click();
  }
}

const CH = { 'Content-Type': 'application/json', 'x-admin-credential': 'e2e-import' };

// The control-center UI gates destructive actions behind window.confirm —
// accept the dialogs (the spec already asserts the outcomes they gate).
function acceptConfirmations(page: Page): void {
  page.on('dialog', (dialog) => void dialog.accept());
}

async function createChangeSet(page: Page, ops: Array<Record<string, unknown>>): Promise<string> {
  const created = await page.request.post(`${BASE}/api/v1/change-sets`, {
    headers: CH,
    data: { product_ops: ops },
  });
  expect(created.status()).toBe(201);
  return (await created.json()).id as string;
}

async function productPrice(page: Page): Promise<number> {
  const res = await page.request.get(`${BASE}/api/v1/products/e2e-cafe`);
  expect(res.status()).toBe(200);
  return (await res.json()).price as number;
}

test('edit -> review -> validate -> apply -> undo -> redo, surviving reloads', async ({ page }) => {
  acceptConfirmations(page);
  const csId = await createChangeSet(page, [
    {
      action: 'edit',
      product_id: 'e2e-cafe',
      data: { price: 4999 },
      base_revision: 1,
      idempotency_key: 'e2e-edit-1',
    },
  ]);

  await page.goto(`${BASE}/history`);
  await dismissCredentialPrompt(page);

  // Review: the pending draft is visible with its ops.
  const pendingRow = page.getByRole('row', { name: new RegExp(csId) });
  await expect(pendingRow).toBeVisible();
  await expect(pendingRow).toContainText('Editar');

  // Validate then apply through the UI.
  await page.getByRole('button', { name: 'Validar' }).click();
  await expect(page.getByRole('status')).toContainText('validado');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByRole('status')).toContainText('aplicado');
  expect(await productPrice(page)).toBe(4999);

  // Reload: history persists with the applied change set.
  await page.reload();
  await dismissCredentialPrompt(page);
  await expect(page.getByText(new RegExp(`change-set:change-set-applied:edit`))).toBeVisible();

  // Undo through the history row.
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByRole('status')).toContainText('inverso');

  // The inverse lands in pending already validated (built from exact recorded
  // values): apply it directly.
  await page.getByRole('button', { name: 'Aplicar' }).click();
  expect(await productPrice(page)).toBe(4500);

  // Reload again and redo from the inverse's history row.
  await page.reload();
  await dismissCredentialPrompt(page);
  // Both the 'undo' and 'change-set-applied' history rows reference the
  // inverse — either Rehacer creates the same redo change set.
  await page.getByRole('button', { name: 'Rehacer' }).first().click();
  await expect(page.getByRole('status')).toContainText('redo');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  expect(await productPrice(page)).toBe(4999);
});

test('discard drops a draft without touching the catalog', async ({ page }) => {
  acceptConfirmations(page);
  const csId = await createChangeSet(page, [
    {
      action: 'edit',
      product_id: 'e2e-cafe',
      data: { price: 1111 },
      base_revision: 1,
      idempotency_key: 'e2e-discard-1',
    },
  ]);

  await page.goto(`${BASE}/history`);
  await dismissCredentialPrompt(page);
  await expect(page.getByRole('row', { name: new RegExp(csId) })).toBeVisible();

  await page.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByRole('status')).toContainText('descartado');

  // Discard never touches the catalog: the price stays wherever it was.
  expect(await productPrice(page)).not.toBe(1111);
  await page.reload();
  await dismissCredentialPrompt(page);
  // The draft is gone from pending (history keeps the discarded record).
  await expect(
    page
      .getByRole('table', { name: 'Change sets pendientes' })
      .getByRole('row', { name: new RegExp(csId) })
  ).not.toBeVisible();
});

test('backup restore requires explicit confirmation', async ({ page }) => {
  acceptConfirmations(page);
  await page.goto(`${BASE}/history`);
  await dismissCredentialPrompt(page);

  const created = await page.request.post(`${BASE}/api/v1/backup`, {
    headers: CH,
    data: {},
  });
  expect(created.status()).toBe(200);
  const backupId = (await created.json()).backup_id as string;

  await page.reload();
  await dismissCredentialPrompt(page);

  await page.getByRole('button', { name: 'Restaurar…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmar restauración de backup' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(backupId);

  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).not.toBeVisible();
});
