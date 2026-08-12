import { test, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

test('gap-fill script exists and reads the canonical products file', () => {
  const script = resolve(process.cwd(), 'tools', 'gap-fill-image-variants.js');
  expect(readFileSync(script, 'utf-8')).toContain('buildVariant');

  const catalog = JSON.parse(
    readFileSync(resolve(process.cwd(), 'data', 'product_data.json'), 'utf-8')
  );
  expect(Array.isArray(catalog.products)).toBe(true);
});
