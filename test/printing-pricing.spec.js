import { describe, expect, it } from 'vitest';
import { WHATSAPP_NUMBER } from '../astro-poc/src/lib/formatting.js';
import {
  PRINTING_RATES,
  MAX_PRINTING_PAGES_PER_TYPE,
  calculatePrintingQuote,
  buildPrintingWhatsAppUrl,
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
    expect(message).toContain('Total estimado:');
    expect(message).toContain('precio final y la disponibilidad se confirman');
    expect(message).not.toContain('undefined');
  });
});
