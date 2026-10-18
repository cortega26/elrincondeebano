import { test, expect, type Page } from '@playwright/test';
import { seedDocument } from '../../src/shared/comms.ts';
import type { CommsDocument } from '../../src/shared/schemas/comms.ts';

// Plan 217: flujo del módulo de mensajes sin enviar nada real. La API de
// comms se intercepta (no toca data/.comms/ del operador), window.open y
// navigator.share se reemplazan por espías.

interface Harness {
  saves: CommsDocument[];
}

async function setup(
  page: Page,
  opts: { popupBlocked?: boolean; webShare?: boolean } = {}
): Promise<Harness> {
  const harness: Harness = { saves: [] };
  let current: CommsDocument = {
    ...seedDocument(),
    destinations: [
      { id: 'grupo-vecinos', kind: 'grupo', alias: 'Grupo vecinos Ébano', name: '' },
      {
        id: 'ct-prueba',
        kind: 'contacto',
        alias: 'Prueba',
        name: 'Ana Pérez',
        phone: '56900000000',
      },
    ],
  };
  await page.route('**/api/v1/comms', async (route) => {
    const req = route.request();
    if (req.method() === 'GET') {
      await route.fulfill({ json: current });
      return;
    }
    const body = req.postDataJSON() as { expected_rev: number; document: CommsDocument };
    current = { ...body.document, rev: current.rev + 1 };
    harness.saves.push(current);
    await route.fulfill({ json: current });
  });
  await page.addInitScript(
    ({ popupBlocked, webShare }) => {
      const w = window as unknown as Record<string, unknown>;
      w.__opened = [];
      window.open = ((url: string) => {
        (w.__opened as string[]).push(url);
        return popupBlocked ? null : ({ opener: null } as Window);
      }) as typeof window.open;
      if (webShare) {
        w.__shared = [];
        Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
        Object.defineProperty(navigator, 'share', {
          value: async (data: ShareData) => {
            (w.__shared as unknown[]).push({ text: data.text, files: data.files?.length ?? 0 });
          },
          configurable: true,
        });
      } else {
        Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
      }
      localStorage.setItem('ebano-credential', 'e2e');
    },
    { popupBlocked: Boolean(opts.popupBlocked), webShare: Boolean(opts.webShare) }
  );
  await page.goto('/comms');
  const credential = page.getByPlaceholder('x-admin-credential');
  if (await credential.isVisible().catch(() => false)) {
    await credential.fill('e2e');
    await page.getByRole('button', { name: 'Guardar' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Mensajes de WhatsApp' })).toBeVisible();
  return harness;
}

const opened = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);

test('respuesta a un contacto: abre su chat con el texto y confirma manualmente', async ({
  page,
}) => {
  const harness = await setup(page);
  await page.getByRole('tab', { name: 'Responder a vecino' }).click();
  await page.getByLabel('Buscar plantillas').fill('pago');
  await page.getByLabel('Buscar plantillas').press('Enter');

  const openButton = page.getByRole('button', { name: 'Abrir chat con mensaje' });
  await expect(openButton).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Elige el destino');

  await page.getByRole('combobox', { name: 'Destino' }).selectOption('ct-prueba');
  await expect(page.getByTestId('comms-destination')).toHaveText('Prueba · +56 9 0000 0000');
  // {nombre} se completa con el nombre del contacto.
  await expect(page.getByTestId('comms-preview-text')).toContainText('Hola Ana, puedes pagar');
  await openButton.click();

  const urls = await opened(page);
  expect(urls).toHaveLength(1);
  expect(urls[0]).toMatch(/^https:\/\/wa\.me\/56900000000\?text=Hola%20Ana%2C/);
  await expect(page.getByText('¿Ya lo enviaste en WhatsApp?')).toBeVisible();
  await page.getByRole('button', { name: 'Sí, marcar como enviado' }).click();
  await expect.poll(() => harness.saves.length).toBe(2);
  expect(harness.saves[1].activity.map((a) => a.status)).toEqual([
    'enviado_manual',
    'chat_abierto',
  ]);
});

test('variables incompletas bloquean el envío; número pegado se valida', async ({ page }) => {
  await setup(page);
  await page.getByRole('tab', { name: 'Responder a vecino' }).click();
  await page.getByLabel('Buscar plantillas').fill('si hay disponible');
  await page.getByLabel('Buscar plantillas').press('Enter');
  await page.getByRole('combobox', { name: 'Destino' }).selectOption('__adhoc__');
  await page.getByLabel(/Número \(ej/).fill('123');
  await expect(page.getByRole('alert')).toContainText('Elige el destino');
  await page.getByLabel(/Número \(ej/).fill('9 1111 2222');
  await expect(page.getByTestId('comms-destination')).toHaveText(
    '+56 9 1111 2222 · +56 9 1111 2222'
  );
  await expect(page.getByRole('alert')).toContainText('{nombre}');
  await expect(page.getByRole('button', { name: 'Abrir chat con mensaje' })).toBeDisabled();
  await page.getByLabel('{nombre}').fill('Luis');
  await page.getByLabel('{producto}').fill('Pan amasado');
  await page.getByLabel('{precio}').fill('$1.200');
  await expect(page.getByRole('button', { name: 'Abrir chat con mensaje' })).toBeEnabled();
});

test('grupo: abre el selector de chats, nunca un enlace de invitación', async ({ page }) => {
  await setup(page);
  await page.getByLabel('Buscar plantillas').fill('abrimos');
  await page.getByLabel('Buscar plantillas').press('Enter');
  await page.getByRole('combobox', { name: 'Destino' }).selectOption('grupo-vecinos');
  await page.getByRole('button', { name: 'Abrir WhatsApp y elegir el grupo' }).click();
  const urls = await opened(page);
  expect(urls[0]).toMatch(/^https:\/\/wa\.me\/\?text=Buenos%20d%C3%ADas/);
  expect(urls[0]).not.toContain('chat.whatsapp.com');
});

test('ventana bloqueada: muestra el enlace y no registra actividad', async ({ page }) => {
  const harness = await setup(page, { popupBlocked: true });
  await page.getByLabel('Buscar plantillas').fill('abrimos');
  await page.getByLabel('Buscar plantillas').press('Enter');
  await page.getByRole('combobox', { name: 'Destino' }).selectOption('grupo-vecinos');
  await page.getByRole('button', { name: 'Abrir WhatsApp y elegir el grupo' }).click();
  await expect(page.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/\?text=/
  );
  expect(harness.saves).toHaveLength(0);
});

test('sin Web Share: ofrece copiar/descargar la imagen en vez de prometer compartir', async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel('Buscar plantillas').fill('abrimos');
  await page.getByLabel('Buscar plantillas').press('Enter');
  await page.getByLabel('Adjuntar imagen propia').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    ),
  });
  await expect(page.getByText('no puede compartir imágenes directamente')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar' })).toBeVisible();
});

test('con Web Share: comparte texto + imagen JPEG y registra solo "compartir iniciado"', async ({
  page,
}) => {
  const harness = await setup(page, { webShare: true });
  await page.getByLabel('Buscar plantillas').fill('abrimos');
  await page.getByLabel('Buscar plantillas').press('Enter');
  await page.getByRole('combobox', { name: 'Destino' }).selectOption('grupo-vecinos');
  await page.getByLabel('Adjuntar imagen propia').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    ),
  });
  await page.getByRole('button', { name: 'Compartir texto + imagen' }).click();
  await expect.poll(() => harness.saves.length).toBe(1);
  expect(harness.saves[0].activity[0].status).toBe('compartir_iniciado');
  const shared = await page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared);
  expect(shared).toEqual([{ text: expect.stringContaining('Buenos días'), files: 1 }]);
});

test('mensaje repetido: solo tras un envío confirmado exige confirmación', async ({ page }) => {
  await setup(page);
  await page.getByLabel('Buscar plantillas').fill('abrimos');
  await page.getByLabel('Buscar plantillas').press('Enter');
  await page.getByRole('combobox', { name: 'Destino' }).selectOption('grupo-vecinos');
  const open = page.getByRole('button', { name: 'Abrir WhatsApp y elegir el grupo' });
  await open.click();
  // Abrir el chat no bloquea el fallback de copiar ni un reintento.
  await expect(page.getByRole('button', { name: 'Copiar mensaje' })).toBeEnabled();
  await expect(open).toBeEnabled();
  await page.getByRole('button', { name: 'Sí, marcar como enviado' }).click();
  await expect(open).toBeDisabled();
  await expect(page.getByText('Este mismo texto ya fue a este destino')).toBeVisible();
  await page.getByText('Enviar de todos modos').click();
  await expect(open).toBeEnabled();
});

test('promoción con producto y foto reales del catálogo', async ({ page }) => {
  await setup(page, { webShare: true });
  await page.getByLabel('Buscar plantillas').fill('promocion de producto');
  await page.getByLabel('Buscar plantillas').press('Enter');
  await page.getByRole('combobox', { name: 'Destino' }).selectOption('grupo-vecinos');
  await page.getByPlaceholder('Buscar producto…').fill('nova');
  await page
    .getByRole('list', { name: 'Productos encontrados' })
    .getByRole('button')
    .first()
    .click();
  await expect(page.getByRole('alert')).toContainText('Confirma que el producto está disponible');
  await page.getByText('Revisé que hay stock real').click();
  const preview = page.getByTestId('comms-preview-text');
  await expect(preview).toContainText('$');
  await expect(preview).toContainText('https://www.elrincondeebano.com/');
  // La plantilla de oferta exige {oferta}: si el producto no tiene descuento
  // se completa a mano (nunca se inventa).
  const oferta = page.getByLabel('{oferta}');
  if (
    (await oferta.isVisible()) &&
    (await oferta.inputValue()) === '' &&
    !(await oferta.getAttribute('placeholder'))
  ) {
    await oferta.fill('$1.000');
  }
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar' }).first().click();
  expect((await download).suggestedFilename()).toMatch(/\.jpg$/);
  await page.getByRole('button', { name: /Compartir texto \+ imagen/ }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __shared: Array<{ files: number }> }).__shared[0]?.files
      )
    )
    .toBe(1);
  await page.screenshot({ path: 'reports/e2e/comms-desktop.png', fullPage: true });
});

test('vista móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole('tab', { name: 'Responder a vecino' }).click();
  await page.getByLabel('Buscar plantillas').fill('pedido listo');
  await page.getByLabel('Buscar plantillas').press('Enter');
  await page.getByRole('combobox', { name: 'Destino' }).selectOption('ct-prueba');
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'reports/e2e/comms-mobile.png', fullPage: true });
});
