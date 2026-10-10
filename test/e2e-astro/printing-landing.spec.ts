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

  test('updates a mixed order and prepares the real WhatsApp prequote', async ({ page }) => {
    await page.goto('/impresiones/');

    const bw = page.locator('#printing-bw');
    const color = page.locator('#printing-color');
    const total = page.locator('#printing-total');
    const whatsapp = page.locator('#printing-whatsapp');

    await expect(total).toContainText('700');
    await expect(page.locator('#printing-paper-size')).toHaveValue('carta');
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
    expect(message).toContain('Total estimado:');
  });

  test('oficio changes both unit prices and WhatsApp quote, returning to carta restores them', async ({
    page,
  }) => {
    await page.goto('/impresiones/');

    const size = page.locator('#printing-paper-size');
    const bw = page.locator('#printing-bw');
    const color = page.locator('#printing-color');
    const total = page.locator('#printing-total');
    const whatsapp = page.locator('#printing-whatsapp');

    await bw.fill('2');
    await color.fill('1');
    await size.selectOption('oficio');

    await expect(page.locator('#printing-bw-unit-price')).toContainText('250');
    await expect(page.locator('#printing-color-unit-price')).toContainText('500');
    await expect(page.locator('#printing-bw-cost')).toContainText('500');
    await expect(page.locator('#printing-color-cost')).toContainText('500');
    await expect(page.locator('#printing-service-cost')).toContainText('500');
    await expect(total).toContainText('1.500');

    const message = new URL((await whatsapp.getAttribute('href')) as string).searchParams.get('text');
    expect(message).toContain('Formato: Oficio.');
    expect(message).toContain('a $250 c/u');
    expect(message).toContain('a $500 c/u');
    expect(message).toContain('Total estimado: $1.500');
    expect(message).toContain('tamaño oficio y a una cara');

    await size.selectOption('carta');
    await expect(total).toContainText('1.300');
    await expect(page.locator('#printing-bw-unit-price')).toContainText('200');
    await expect(page.locator('#printing-color-unit-price')).toContainText('400');
    const cartaMessage = new URL((await whatsapp.getAttribute('href')) as string).searchParams.get('text');
    expect(cartaMessage).toContain('Formato: Carta.');
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
