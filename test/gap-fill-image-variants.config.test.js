import { test, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { GAP_FILL_WIDTHS, PRODUCT_IMAGE_WIDTHS } = require('../tools/utils/constants.js');
const { pruneStaleImageVariantWidths } = require('../tools/gap-fill-image-variants.js');

test('gap-fill script exists and reads the canonical products file', () => {
  const script = resolve(process.cwd(), 'tools', 'gap-fill-image-variants.js');
  expect(readFileSync(script, 'utf-8')).toContain('buildVariant');

  const catalog = JSON.parse(
    readFileSync(resolve(process.cwd(), 'data', 'product_data.json'), 'utf-8')
  );
  expect(Array.isArray(catalog.products)).toBe(true);
});

// Plan 235: el gap-fill debe generar exactamente los anchos que piden los
// srcsets de la UI (catalog.ts) — antes generaba 600/800/1200 sin consumidor.
test('GAP_FILL_WIDTHS matches PRODUCT_IMAGE_WIDTHS', () => {
  expect([...GAP_FILL_WIDTHS]).toEqual([...PRODUCT_IMAGE_WIDTHS]);

  const script = readFileSync(
    resolve(process.cwd(), 'tools', 'gap-fill-image-variants.js'),
    'utf-8'
  );
  expect(script).toContain('GAP_FILL_WIDTHS: WIDTHS');
});

// Plan 235: las entradas image_variants con anchos fuera del set canónico
// quedan muertas (sus archivos ya no se generan) y deben descartarse.
test('pruneStaleImageVariantWidths drops widths outside the canonical set', () => {
  const canonicalWidths = new Set([...PRODUCT_IMAGE_WIDTHS, ...GAP_FILL_WIDTHS]);
  const products = [
    {
      image_path: 'assets/images/bebidas/demo.webp',
      image_variants: [
        { width: 200, src: 'a' },
        { width: 600, src: 'b' },
        { width: 1200, src: 'c' },
      ],
    },
    {
      image_path: 'assets/images/bebidas/kept.webp',
      image_variants: [{ width: 320, src: 'd' }],
    },
    { image_path: 'assets/images/bebidas/none.webp' },
  ];

  const pruned = pruneStaleImageVariantWidths(products, canonicalWidths);

  expect(pruned).toBe(2);
  expect(products[0].image_variants).toEqual([{ width: 200, src: 'a' }]);
  expect(products[1].image_variants).toEqual([{ width: 320, src: 'd' }]);
});
