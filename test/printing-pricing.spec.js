import { describe, expect, it } from 'vitest';
import { WHATSAPP_NUMBER } from '../astro-poc/src/lib/formatting.js';
import {
  PRINTING_RATES,
  MAX_PRINTING_PAGES_PER_TYPE,
  calculatePrintingQuote,
  buildPrintingWhatsAppUrl,
  buildPrintingWhatsAppMessage,
  MAX_PRINTING_FILE_BYTES,
  validatePrintingFile,
} from '../astro-poc/src/lib/printing-pricing.js';

describe('printing service quote', () => {
  it('charges the fixed fee exactly once for a one-page order', () => {
    expect(calculatePrintingQuote(1, 0)).toMatchObject({
      blackAndWhitePages: 1,
      colorPages: 0,
      serviceCost: 500,
      blackAndWhiteCost: 200,
      colorCost: 0,
      total: 700,
      hasPages: true,
    });
    expect(calculatePrintingQuote(0, 1).total).toBe(900);
  });

  it('calculates mixed orders without duplicating the service fee', () => {
    const result = calculatePrintingQuote(2, 1);
    expect(result).toMatchObject({
      blackAndWhiteCost: 400,
      colorCost: 400,
      serviceCost: 500,
      total: 1300,
    });
    expect(result.total).toBe(
      PRINTING_RATES.service +
        2 * PRINTING_RATES.blackAndWhite +
        PRINTING_RATES.color
    );
  });

  it('uses carta by default and applies oficio surcharge per printed page', () => {
    const carta = calculatePrintingQuote(2, 1);
    const oficio = calculatePrintingQuote(2, 1, 'oficio');

    expect(carta).toMatchObject({
      paperSize: 'carta',
      paperSizeLabel: 'Carta',
      blackAndWhiteUnitPrice: 200,
      colorUnitPrice: 400,
      total: 1300,
    });
    expect(oficio).toMatchObject({
      paperSize: 'oficio',
      paperSizeLabel: 'Oficio',
      blackAndWhiteUnitPrice: 250,
      colorUnitPrice: 500,
      blackAndWhiteCost: 500,
      colorCost: 500,
      serviceCost: 500,
      total: 1500,
    });
    expect(oficio.total - carta.total).toBe(2 * 50 + 100);
  });

  it('does not apply oficio surcharge to the fixed fee or an empty order', () => {
    const empty = calculatePrintingQuote(0, 0, 'oficio');
    expect(empty).toMatchObject({ serviceCost: 0, total: 0, hasPages: false });
    expect(buildPrintingWhatsAppUrl(empty)).toBeNull();
    expect(calculatePrintingQuote(0, 1, 'oficio').total).toBe(1000);
    expect(calculatePrintingQuote(1, 0, 'oficio').total).toBe(750);
  });

  it.each(['A4', '', 'carta/oficio', null])(
    'rejects unsupported format %s',
    (paperSize) => {
      expect(() => calculatePrintingQuote(1, 1, paperSize)).toThrow(RangeError);
    }
  );

  it('does not charge or enable WhatsApp for an empty order', () => {
    const result = calculatePrintingQuote(0, 0);
    expect(result).toMatchObject({ serviceCost: 0, total: 0, hasPages: false });
    expect(buildPrintingWhatsAppUrl(result)).toBeNull();
  });

  it.each([
    ['', 0],
    [null, 0],
    [undefined, 0],
    [-1, 0],
    [1.5, 0],
    ['2.5', 1],
    [MAX_PRINTING_PAGES_PER_TYPE + 1, 0],
    [0, -2],
    [0, Infinity],
    [NaN, 0],
  ])('rejects invalid page counts (%s, %s)', (bw, color) => {
    expect(() => calculatePrintingQuote(bw, color)).toThrow(RangeError);
  });

  it('accepts the documented maximum and returns safe amounts', () => {
    const result = calculatePrintingQuote(MAX_PRINTING_PAGES_PER_TYPE, MAX_PRINTING_PAGES_PER_TYPE);
    expect(result.total).toBe(
      PRINTING_RATES.service +
        MAX_PRINTING_PAGES_PER_TYPE * (PRINTING_RATES.blackAndWhite + PRINTING_RATES.color)
    );
  });

  it('builds an encoded WhatsApp prequote with quantities, fee and no personal data', () => {
    const quote = calculatePrintingQuote(2, 1);
    const href = buildPrintingWhatsAppUrl(quote);
    const url = new URL(href);

    expect(url.origin).toBe('https://wa.me');
    expect(url.pathname).toBe(`/${WHATSAPP_NUMBER}`);
    const message = url.searchParams.get('text');
    expect(message).toContain('Blanco y negro: 2 página(s)');
    expect(message).toContain('Color: 1 página(s)');
    expect(message).toContain('Formato: Carta.');
    expect(message).toContain('a $200 c/u');
    expect(message).toContain('a $400 c/u');
    expect(message).toContain('Total estimado:');
    expect(message).toContain('papel bond de 75 g/m², tamaño carta y a una cara');
    expect(message).not.toContain('A4');
    expect(message).toContain('precio final y la disponibilidad se confirman');
    expect(message).not.toContain('undefined');
  });

  it('includes oficio, its unit prices and adjusted total in the WhatsApp request', () => {
    const message = new URL(buildPrintingWhatsAppUrl(calculatePrintingQuote(2, 1, 'oficio')))
      .searchParams.get('text');
    expect(message).toContain('Formato: Oficio.');
    expect(message).toContain('a $250 c/u');
    expect(message).toContain('a $500 c/u');
    expect(message).toContain('Total estimado: $1.500');
    expect(message).toContain('papel bond de 75 g/m², tamaño oficio y a una cara');
    expect(message).not.toContain('A4');
  });
  it('distinguishes an estimated physical-original handoff from a digital-file request', () => {
    const quote = calculatePrintingQuote(6, 0, 'oficio');
    const message = buildPrintingWhatsAppMessage(quote, { requestType: 'original' });
    expect(message).toContain('Tipo: fotocopia de originales físicos.');
    expect(message).toContain('Formato: Oficio.');
    expect(message).toContain('Total estimado: $2.000');
    expect(message).toContain('páginas finales estimadas');
    expect(message).toContain('recepción y devolución de los originales físicos');
    expect(message).not.toContain('Compartiré el archivo');

    const url = buildPrintingWhatsAppUrl(quote, { requestType: 'original' });
    expect(new URL(url).searchParams.get('text')).toBe(message);
    expect(buildPrintingWhatsAppMessage(quote)).toContain('Tipo: impresión desde archivo digital.');
    expect(() => buildPrintingWhatsAppMessage(quote, { requestType: 'unknown' })).toThrow(RangeError);
  });

  it('validates local document metadata without uploading or reading file contents', () => {
    for (const name of ['tarea.PDF', 'texto.doc', 'texto.DOCX', 'foto.jpg', 'foto.jpeg', 'foto.PNG']) {
      expect(validatePrintingFile({ name, size: 1024 })).toEqual({ valid: true, message: '' });
    }
    expect(validatePrintingFile({ name: 'tarea.pdf', size: MAX_PRINTING_FILE_BYTES }).valid).toBe(true);
    expect(validatePrintingFile({ name: 'tarea.pdf', size: MAX_PRINTING_FILE_BYTES + 1 }).valid).toBe(false);
    expect(validatePrintingFile({ name: 'tarea.pdf', size: 0 }).valid).toBe(false);
    expect(validatePrintingFile({ name: 'tarea.exe', size: 200 }).valid).toBe(false);
    expect(validatePrintingFile({ name: 'tarea.pdf.exe', size: 200 }).valid).toBe(false);
    expect(validatePrintingFile(null).valid).toBe(false);
  });

  it('preserves single fixed fee for physical and digital estimates alike', () => {
    const mixed = calculatePrintingQuote(2, 1, 'oficio');
    expect(mixed.serviceCost).toBe(500);
    expect(buildPrintingWhatsAppMessage(mixed, { requestType: 'original' })).toContain('Total estimado: $1.500');
    expect(buildPrintingWhatsAppMessage(mixed, { requestType: 'archivo' })).toContain('Total estimado: $1.500');
  });

});
