import assert from 'assert';
import { setBaseGlobals } from './helpers/dom-globals.js';

test('generateStableId', async () => {
  setBaseGlobals();
  const { generateStableId } = await import('../src/js/script.mjs');

  const prodA1 = { name: 'Milk', category: 'Dairy' };
  const prodA2 = { name: 'Milk', category: 'Dairy' };
  assert.strictEqual(
    generateStableId(prodA1),
    generateStableId(prodA2),
    'identical products should yield the same id'
  );

  const prodB = { name: 'Cheese', category: 'Dairy' };
  assert.notStrictEqual(
    generateStableId(prodA1),
    generateStableId(prodB),
    'different products should yield different ids'
  );
});
