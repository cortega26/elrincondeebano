import { describe, expect, it } from 'vitest';
import { WHATSAPP_NUMBER, formatCurrency } from '../astro-poc/src/lib/formatting.js';

describe('formatting', () => {
  describe('formatCurrency', () => {
    it('formats CLP values without decimals', () => {
      expect(formatCurrency(1000)).toMatch(/\$\s*1\.000/);
      expect(formatCurrency(1000)).not.toMatch(/,\d{2}$/);
    });

    it('formats zero', () => {
      expect(formatCurrency(0)).toMatch(/\$\s*0/);
    });

    it('falls back to zero for invalid numeric input', () => {
      expect(formatCurrency(undefined)).toMatch(/\$\s*0/);
      expect(formatCurrency('not-a-number')).toMatch(/\$\s*0/);
    });
  });

  describe('WHATSAPP_NUMBER', () => {
    it('keeps the storefront contact number centralized', () => {
      expect(WHATSAPP_NUMBER).toBe('56951118901');
    });
  });
});
