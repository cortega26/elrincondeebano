import { describe, expect, it } from 'vitest';
import {
  absoluteUrl,
  publicAssetUrl,
  normalizeShareDescription,
  createSharePreviewMetadata,
} from '../astro-poc/src/lib/seo.ts';

describe('absoluteUrl', () => {
  it('prepends site origin to a relative path', () => {
    expect(absoluteUrl('/pagina')).toBe('https://www.elrincondeebano.com/pagina');
  });

  it('returns an absolute URL unchanged', () => {
    expect(absoluteUrl('https://otro.com/pagina')).toBe('https://otro.com/pagina');
  });

  it('returns origin for empty input', () => {
    expect(absoluteUrl('')).toBe('https://www.elrincondeebano.com');
  });

  it('ensures leading slash for bare path', () => {
    expect(absoluteUrl('pagina')).toBe('https://www.elrincondeebano.com/pagina');
  });
});

describe('publicAssetUrl', () => {
  it('returns a relative path with leading slash', () => {
    expect(publicAssetUrl('/assets/img.png')).toBe('/assets/img.png');
  });

  it('returns an external URL unchanged', () => {
    expect(publicAssetUrl('https://externo.com/img.png')).toBe('https://externo.com/img.png');
  });

  it('adds leading slash to a bare path', () => {
    expect(publicAssetUrl('assets/img.png')).toBe('/assets/img.png');
  });

  it('returns / for empty input', () => {
    expect(publicAssetUrl('')).toBe('/');
  });
});

describe('normalizeShareDescription', () => {
  it('returns the string unchanged when under 180 characters', () => {
    const short = 'Descripción corta para el producto.';
    expect(normalizeShareDescription(short)).toBe(short);
  });

  it('truncates a string over 180 characters with ellipsis', () => {
    const long = 'a'.repeat(200);
    const result = normalizeShareDescription(long);
    expect(result.length).toBeLessThanOrEqual(180);
    expect(result.endsWith('...')).toBe(true);
  });

  it('strips HTML tags from the description', () => {
    const html = '<p>Descripción <strong>limpia</strong></p>';
    expect(normalizeShareDescription(html)).toBe('Descripción limpia');
  });

  it('uses the fallback when value is undefined', () => {
    const result = normalizeShareDescription(undefined, 'Fallback personalizado');
    expect(result).toBe('Fallback personalizado');
  });

  it('uses the fallback when value is empty', () => {
    const result = normalizeShareDescription('', 'Otro fallback');
    expect(result).toBe('Otro fallback');
  });

  it('uses DEFAULT_SHARE_DESCRIPTION when fallback is also empty', () => {
    const result = normalizeShareDescription('', '');
    expect(result).toBe(
      'Minimarket privado para residentes del edificio Ébano. Pedidos por WhatsApp y entrega dentro del edificio.'
    );
  });
});

describe('createSharePreviewMetadata', () => {
  it('returns all required fields with minimal input', () => {
    const meta = createSharePreviewMetadata({ title: 'Test Page' });
    expect(meta).toHaveProperty('title');
    expect(meta).toHaveProperty('description');
    expect(meta).toHaveProperty('canonicalUrl');
    expect(meta).toHaveProperty('ogUrl');
    expect(meta).toHaveProperty('ogImage');
    expect(meta).toHaveProperty('ogImageAlt');
    expect(meta).toHaveProperty('ogType');
    expect(meta).toHaveProperty('twitterCard');
    expect(meta.title).toBe('Test Page');
    expect(meta.ogType).toBe('website');
    expect(meta.twitterCard).toBe('summary_large_image');
  });

  it('uses an explicit canonicalUrl when provided', () => {
    const meta = createSharePreviewMetadata({
      title: 'Test',
      canonicalUrl: 'https://www.elrincondeebano.com/p/test-123/',
      ogImage: 'https://example.com/custom.jpg',
    });
    expect(meta.canonicalUrl).toBe('https://www.elrincondeebano.com/p/test-123/');
    expect(meta.ogUrl).toBe('https://www.elrincondeebano.com/p/test-123/');
  });

  it('builds an absolute URL from canonicalPath', () => {
    const meta = createSharePreviewMetadata({
      title: 'Test',
      canonicalPath: '/categoria/',
      ogImage: 'https://example.com/custom.jpg',
    });
    expect(meta.canonicalUrl).toBe('https://www.elrincondeebano.com/categoria/');
    expect(meta.ogUrl).toBe('https://www.elrincondeebano.com/categoria/');
  });

  it('uses the default canonicalPath "/" when none given', () => {
    const meta = createSharePreviewMetadata({
      title: 'Home',
      ogImage: 'https://example.com/custom.jpg',
    });
    expect(meta.canonicalUrl).toBe('https://www.elrincondeebano.com/');
  });

  it('preserves external ogImage URLs', () => {
    const meta = createSharePreviewMetadata({
      title: 'Test',
      ogImage: 'https://cdn.externo.com/og.jpg',
    });
    expect(meta.ogImage).toBe('https://cdn.externo.com/og.jpg');
  });
});
