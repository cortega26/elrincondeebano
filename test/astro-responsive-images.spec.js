import { describe, expect, it } from 'vitest';
import {
  PRODUCT_CARD_IMAGE_SIZES,
  getProductCardImageSource,
  getProductDetailImageSource,
} from '../astro-poc/src/lib/catalog.ts';

describe('astro responsive images', () => {
  it('uses existing local variants for product cards when they are available', () => {
    const image = getProductCardImageSource('assets/images/lacteos/Leche entera Líder 1L.webp');

    expect(image.src).toBe(
      '/assets/images/variants/w200/images/lacteos/Leche%20entera%20L%C3%ADder%201L.webp'
    );
    expect(image.srcset).toContain(
      '/assets/images/variants/w320/images/lacteos/Leche%20entera%20L%C3%ADder%201L.webp 320w'
    );
    expect(image.sizes).toBe(PRODUCT_CARD_IMAGE_SIZES);
  });

  it('falls back to the original asset when responsive variants are missing', () => {
    const image = getProductCardImageSource('assets/images/bebidas/no-existe.webp');

    expect(image.src).toBe('/assets/images/bebidas/no-existe.webp');
    expect(image.srcset).toBeUndefined();
    expect(image.sizes).toBeUndefined();
  });

  it('serves larger variants on product detail pages when they exist', () => {
    const image = getProductDetailImageSource(
      'assets/images/carnes_y_embutidos/Jamón PF acaramelado 200g.webp'
    );

    expect(image.src).toBe(
      '/assets/images/variants/w320/images/carnes_y_embutidos/Jam%C3%B3n%20PF%20acaramelado%20200g.webp'
    );
    expect(image.srcset).toContain(
      '/assets/images/variants/w640/images/carnes_y_embutidos/Jam%C3%B3n%20PF%20acaramelado%20200g.webp 640w'
    );
  });
});
