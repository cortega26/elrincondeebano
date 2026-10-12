import { expect, test } from '@playwright/test';

test.describe('Landing de impresiones', () => {
  test('is discoverable from the store and has correct metadata', async ({ page }) => {
    await page.goto('/');
    const homeLink = page.locator('.home-entry__help-link[href="/impresiones/"]');
    await expect(homeLink).toBeVisible();
    await homeLink.click();

    await expect(page).toHaveURL(/\/impresiones\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Lo resuelves aquí');
    await expect(page.locator('.printing-terms')).toContainText('papel bond de');
    await expect(page.locator('.printing-terms')).toContainText('75 g/m², tamaño carta u oficio');
    await expect(page.locator('.printing-terms')).toContainText(
      'Oficio tiene un recargo de $50 por página B/N y $100 por página a color respecto de carta.'
    );
    await expect(page.locator('.printing-terms')).not.toContainText('A4');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://www.elrincondeebano.com/impresiones/'
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      'content',
      'https://www.elrincondeebano.com/impresiones/'
    );
  });

  test('offers discoverable minus/plus buttons that update prices and enforce zero', async ({ page }) => {
    await page.goto('/impresiones/');

    const bw = page.locator('#printing-bw');
    const color = page.locator('#printing-color');
    const bwMinus = page.getByRole('button', { name: 'Quitar una página en blanco y negro carta' });
    const bwPlus = page.getByRole('button', { name: 'Agregar una página en blanco y negro carta' });
    const colorMinus = page.getByRole('button', { name: 'Quitar una página a color carta' });
    const colorPlus = page.getByRole('button', { name: 'Agregar una página a color carta' });
    const whatsapp = page.locator('#printing-whatsapp');

    await expect(bw).toHaveValue('1');
    await expect(color).toHaveValue('0');
    await expect(bwMinus).toBeEnabled();
    await expect(colorMinus).toBeDisabled();

    await bwMinus.click();
    await expect(bw).toHaveValue('0');
    await expect(bwMinus).toBeDisabled();
    await expect(page.locator('#printing-total')).toContainText('0');
    await expect(whatsapp).not.toHaveAttribute('href');

    await bwPlus.click();
    await colorPlus.click();
    await expect(bw).toHaveValue('1');
    await expect(color).toHaveValue('1');
    await expect(page.locator('#printing-total')).toContainText('1.100');

    await page.locator('#printing-bw-oficio').fill('1');
    await expect(page.locator('#printing-total')).toContainText('1.350');
    const message = new URL((await whatsapp.getAttribute('href')) as string).searchParams.get('text');
    expect(message).toContain('Total: $1.350');

    await colorMinus.click();
    await expect(color).toHaveValue('0');
    await expect(colorMinus).toBeDisabled();
    await expect(page.locator('#printing-total')).toContainText('950');
  });

  test('steppers respect manual editing and the 500-page limit', async ({ page }) => {
    await page.goto('/impresiones/');

    const bw = page.locator('#printing-bw');
    const bwMinus = page.getByRole('button', { name: 'Quitar una página en blanco y negro carta' });
    const bwPlus = page.getByRole('button', { name: 'Agregar una página en blanco y negro carta' });
    await bw.fill('499');
    await bwPlus.click();
    await expect(bw).toHaveValue('500');
    await expect(bwPlus).toBeDisabled();

    await bwMinus.click();
    await expect(bw).toHaveValue('499');
    await expect(bwPlus).toBeEnabled();

    await bw.fill('501');
    await expect(page.locator('#printing-whatsapp')).not.toHaveAttribute('href');
    await expect(bwPlus).toBeDisabled();
    await expect(bwMinus).toBeDisabled();

    await bw.fill('');
    await expect(bwPlus).toBeDisabled();
    await expect(bwMinus).toBeDisabled();

    await bw.fill('2');
    await expect(bwPlus).toBeEnabled();
    await expect(bwMinus).toBeEnabled();
    await expect(page.locator('#printing-total')).toContainText('900');
  });

  test('quantity controls remain usable without horizontal clipping on a narrow phone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/impresiones/');

    const controls = page.locator('.printing-quote__quantity');
    await expect(controls).toHaveCount(4);
    for (const group of await controls.all()) {
      const fitsInsideQuote = await group.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const quote = node.closest('.printing-quote')?.getBoundingClientRect();
        return Boolean(quote && rect.left >= quote.left && rect.right <= quote.right);
      });
      expect(fitsInsideQuote).toBe(true);
    }
    await page.getByRole('button', { name: 'Agregar una página a color carta' }).click();
    await expect(page.locator('#printing-color')).toHaveValue('1');
  });

  test('updates a mixed order and prepares the real WhatsApp prequote', async ({ page }) => {
    await page.goto('/impresiones/');

    const bw = page.locator('#printing-bw');
    const color = page.locator('#printing-color');
    const total = page.locator('#printing-total');
    const whatsapp = page.locator('#printing-whatsapp');

    await expect(total).toContainText('700');
    await expect(page.locator('#printing-bw-unit-price')).toContainText('200');
    await expect(page.locator('#printing-color-unit-price')).toContainText('400');
    await bw.fill('2');
    await color.fill('1');

    await expect(total).toContainText('1.300');
    await expect(page.locator('#printing-service-cost')).toContainText('500');
    await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/56951118901\?text=/);

    const message = new URL((await whatsapp.getAttribute('href')) as string).searchParams.get('text');
    expect(message).toContain('Blanco y negro: 2 página(s)');
    expect(message).toContain('Color: 1 página(s)');
    expect(message).toContain('Formato: Carta.');
    expect(message).toContain('Total:');
  });

  test('combines carta and oficio with exact prices and preserves one service charge', async ({
    page,
  }) => {
    await page.goto('/impresiones/');

    const bw = page.locator('#printing-bw');
    const color = page.locator('#printing-color');
    const oficioBw = page.locator('#printing-bw-oficio');
    const oficioColor = page.locator('#printing-color-oficio');
    const total = page.locator('#printing-total');
    const whatsapp = page.locator('#printing-whatsapp');

    await bw.fill('2');
    await color.fill('1');
    await oficioBw.fill('3');
    await oficioColor.fill('2');

    await expect(page.locator('#printing-bw-unit-price')).toContainText('200');
    await expect(page.locator('#printing-color-unit-price')).toContainText('400');
    await expect(page.locator('#printing-bw-oficio-unit-price')).toContainText('250');
    await expect(page.locator('#printing-color-oficio-unit-price')).toContainText('500');
    await expect(page.locator('#printing-bw-cost')).toContainText('400');
    await expect(page.locator('#printing-color-cost')).toContainText('400');
    await expect(page.locator('#printing-bw-oficio-cost')).toContainText('750');
    await expect(page.locator('#printing-color-oficio-cost')).toContainText('1.000');
    await expect(page.locator('#printing-service-cost')).toContainText('500');
    await expect(total).toContainText('3.050');
    await expect(page.locator('.printing-quote__total span')).toHaveText('Total');
    await expect(page.locator('.printing-quote__scope')).toContainText('Fotografías');

    const message = new URL((await whatsapp.getAttribute('href')) as string).searchParams.get('text');
    expect(message).toContain('Formato: Carta.');
    expect(message).toContain('Formato: Oficio.');
    expect(message).toContain('Blanco y negro: 3 página(s) a $250 c/u');
    expect(message).toContain('Color: 2 página(s) a $500 c/u');
    expect(message).toContain('Total: $3.050');
    expect(message).not.toContain('Total estimado');

    await oficioBw.fill('0');
    await oficioColor.fill('0');
    await expect(total).toContainText('1.300');
    const cartaMessage = new URL((await whatsapp.getAttribute('href')) as string).searchParams.get('text');
    expect(cartaMessage).not.toContain('Formato: Oficio.');
  });

  test('can share an on-device PDF and prequote through the native share sheet', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: ({ files }: { files?: File[] }) => Array.isArray(files) && files.length === 1,
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async ({ files, text }: { files?: File[]; text?: string }) => {
          Object.assign(window, {
            __printingShareTest: { files: files?.map((file) => file.name), text },
          });
        },
      });
    });
    await page.goto('/impresiones/');

    await expect(page.locator('input[name="printing-source"][value="archivo"]')).toBeChecked();
    await expect(page.locator('#printing-share-file')).toBeHidden();
    await page.locator('#printing-file').setInputFiles({
      name: 'guia.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nprueba\n'),
    });
    await expect(page.locator('#printing-file-feedback')).toContainText('Archivo listo: guia.pdf');
    await expect(page.locator('#printing-share-file')).toBeVisible();

    await page.locator('#printing-share-file').click();
    const receipt = await page.evaluate(() => Reflect.get(window, '__printingShareTest'));
    expect(receipt.files).toEqual(['guia.pdf']);
    expect(receipt.text).toContain('Tipo: impresión desde archivo digital.');
    expect(receipt.text).toContain('Formato: Carta.');
    expect(receipt.text).toContain('Total: $700');
    await expect(page.locator('#printing-share-feedback')).toContainText('Comprueba');

    await page.locator('#printing-bw').fill('0');
    await page.locator('#printing-bw-oficio').fill('1');
    await expect(page.locator('#printing-share-file')).toBeVisible();
    await page.locator('#printing-share-file').click();
    const oficioReceipt = await page.evaluate(() => Reflect.get(window, '__printingShareTest'));
    expect(oficioReceipt.text).toContain('Formato: Oficio.');
    expect(oficioReceipt.text).toContain('Total: $750');
  });

  test('falls back to WhatsApp when the browser cannot share selected files', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'canShare', {
        configurable: true,
        value: () => false,
      });
    });
    await page.goto('/impresiones/');

    await page.locator('#printing-file').setInputFiles({
      name: 'informe.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('word-test'),
    });
    await expect(page.locator('#printing-share-file')).toBeHidden();
    await expect(page.locator('#printing-file-feedback')).toContainText('adjúntalo allí');
    const href = await page.locator('#printing-whatsapp').getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\//);
    expect(new URL(href as string).searchParams.get('text')).toContain('Tipo: impresión desde archivo digital.');
  });

  test('physical photocopies coordinate handoff, never try to share a file', async ({ page }) => {
    await page.goto('/impresiones/');
    await page.locator('#printing-file').setInputFiles({
      name: 'original.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n'),
    });

    await page.locator('input[name="printing-source"][value="original"]').check();
    await expect(page.locator('#printing-physical-section')).toBeVisible();
    await expect(page.locator('#printing-digital-section')).toBeHidden();
    await expect(page.locator('#printing-share-file')).toBeHidden();
    await expect(page.locator('#printing-whatsapp-label')).toContainText('Coordinar originales');

    await page.locator('#printing-bw').fill('6');
    await page.locator('#printing-color').fill('0');
    await page.locator('#printing-bw').fill('0');
    await page.locator('#printing-bw-oficio').fill('6');
    await expect(page.locator('#printing-total')).toContainText('2.000');

    const href = await page.locator('#printing-whatsapp').getAttribute('href');
    const message = new URL(href as string).searchParams.get('text');
    expect(message).toContain('Tipo: fotocopia de originales físicos.');
    expect(message).toContain('recepción y devolución');
    expect(message).toContain('Total: $2.000');

    await page.locator('input[name="printing-source"][value="archivo"]').check();
    await expect(page.locator('#printing-file')).toHaveValue('');
    await expect(page.locator('#printing-digital-section')).toBeVisible();
    await expect(page.locator('#printing-physical-section')).toBeHidden();
  });

  test('keeps the left hero aligned when switching the request type', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/impresiones/');

    const copy = page.locator('.printing-hero__copy');
    const top = await copy.evaluate((node) => node.getBoundingClientRect().top);

    await page.locator('input[name="printing-source"][value="original"]').check();
    await expect(page.locator('#printing-physical-section')).toBeVisible();
    const physicalTop = await copy.evaluate((node) => node.getBoundingClientRect().top);
    expect(Math.abs(physicalTop - top)).toBeLessThan(1);

    await page.locator('input[name="printing-source"][value="archivo"]').check();
    const digitalTop = await copy.evaluate((node) => node.getBoundingClientRect().top);
    expect(Math.abs(digitalTop - top)).toBeLessThan(1);
  });

  test('disables the call to action for an empty or invalid order', async ({ page }) => {
    await page.goto('/impresiones/');

    const bw = page.locator('#printing-bw');
    const color = page.locator('#printing-color');
    const whatsapp = page.locator('#printing-whatsapp');

    await bw.fill('0');
    await color.fill('0');
    await expect(page.locator('#printing-total')).toContainText('0');
    await expect(whatsapp).toHaveAttribute('aria-disabled', 'true');
    await expect(whatsapp).not.toHaveAttribute('href');

    await color.fill('-1');
    await expect(page.locator('#printing-error')).toContainText('Ingresa entre 0');
    await expect(whatsapp).not.toHaveAttribute('href');
  });
});
