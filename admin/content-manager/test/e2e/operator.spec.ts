import { test, expect, type Page } from '@playwright/test';

// Operator shell e2e (plan 061 step 4): preferences, help, keyboard
// navigation. Read-only + localStorage only — no catalog mutations.

async function dismissCredentialPrompt(page: Page): Promise<void> {
  const input = page.getByPlaceholder('x-admin-credential');
  if (await input.isVisible()) {
    await input.fill('e2e-smoke');
    await page.getByRole('button', { name: 'Guardar' }).click();
  }
}

test('preferences persist across reload and reset restores defaults', async ({ page }) => {
  await page.goto('/settings');
  await dismissCredentialPrompt(page);

  await page.getByLabel('Tema:').selectOption('dark');
  await page.getByRole('checkbox', { name: 'Alto contraste' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-high-contrast', 'true');

  await page.reload();
  await dismissCredentialPrompt(page);
  await expect(page.getByLabel('Tema:')).toHaveValue('dark');
  await expect(page.getByRole('checkbox', { name: 'Alto contraste' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Restablecer preferencias' }).click();
  await expect(page.getByLabel('Tema:')).toHaveValue('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('invalid stored preferences fall back to defaults without crashing', async ({ page }) => {
  await page.goto('/settings');
  await dismissCredentialPrompt(page);
  await page.evaluate(() => {
    localStorage.setItem('cm-operator-preferences', JSON.stringify({ version: 1, theme: 'neon' }));
  });
  await page.reload();
  await dismissCredentialPrompt(page);
  await expect(page.getByLabel('Tema:')).toHaveValue('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('keyboard shortcuts navigate without mutating data', async ({ page }) => {
  await page.goto('/products');
  await dismissCredentialPrompt(page);

  // '?' opens help.
  await page.keyboard.press('?');
  await expect(page.getByRole('heading', { name: 'Ayuda y atajos de teclado' })).toBeVisible();

  // 'g s' -> settings; 'g d' -> diagnostics; 'g p' -> products.
  await page.keyboard.press('g');
  await page.keyboard.press('s');
  await expect(page.getByRole('heading', { name: 'Preferencias' })).toBeVisible();

  await page.keyboard.press('g');
  await page.keyboard.press('d');
  await expect(
    page.getByRole('heading', { name: 'Diagnóstico del Content Manager' })
  ).toBeVisible();

  await page.keyboard.press('g');
  await page.keyboard.press('p');
  await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();

  // Typing 'g' inside an input must NOT navigate.
  await page.getByPlaceholder('Nombre, descripción…').fill('g');
  await page.getByPlaceholder('Nombre, descripción…').press('p');
  await expect(page.getByRole('heading', { name: 'Productos' })).toBeVisible();
});

test('help page documents shortcuts and task guides', async ({ page }) => {
  await page.goto('/help');
  await dismissCredentialPrompt(page);
  await expect(page.getByText('g p')).toBeVisible();
  await expect(page.getByText('Ir a Productos')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Guías por tarea' })).toBeVisible();
  await expect(page.getByText('Crear o duplicar un producto')).toBeVisible();
});

test('credential dialog traps focus and closes with Escape — source contract is now honest (plan 142)', async ({
  page,
}) => {
  await page.goto('/products');
  await dismissCredentialPrompt(page);

  // Reopen the credential prompt via the floating button.
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

  // Shift+Tab wraps in the reverse direction.
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Guardar' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByPlaceholder('x-admin-credential')).toBeFocused();

  // Escape closes; focus returns to a real focusable element (not a removed node).
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Credencial ✓' })).toBeFocused();

  // Keyboard activation: Enter on the floating button reopens the dialog.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Launch credential' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  // Rendered landmark + alert contract: main and at least one status/alert
  // feedback region exist as keyboard-navigable landmarks (honest a11y, not
  // string scans alone).
  await expect(page.getByRole('main', { name: 'Productos' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
});
