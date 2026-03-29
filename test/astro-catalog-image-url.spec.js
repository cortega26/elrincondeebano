import { describe, expect, it } from 'vitest';
import { resolveImageUrl } from '../astro-poc/src/lib/catalog.ts';

describe('astro catalog image URLs', () => {
  it('encodes relative asset paths for srcset-safe output', () => {
    expect(resolveImageUrl('assets/images/aguas/Shweppes - Agua Tonica 1,5L.avif')).toBe(
      '/assets/images/aguas/Shweppes%20-%20Agua%20Tonica%201%2C5L.avif'
    );
  });

  it('preserves already encoded paths without double encoding', () => {
    expect(
      resolveImageUrl(
        'https://www.elrincondeebano.com/assets/images/vinos/Cousi%C3%B1o%20Macul.avif'
      )
    ).toBe('https://www.elrincondeebano.com/assets/images/vinos/Cousi%C3%B1o%20Macul.avif');
  });

  it('falls back to the placeholder for empty values', () => {
    expect(resolveImageUrl('')).toBe('/assets/images/web/placeholder.svg');
  });
});
