'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { createProductStore } = require('../server/productStore');

async function createTempStore(initialProducts = []) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'product-sync-'));
  const dataPath = path.join(tmpDir, 'product_data.json');
  const changeLogPath = path.join(tmpDir, 'product_changes.json');
  const payload = {
    version: '20250101-000000',
    last_updated: '2025-01-01T00:00:00.000Z',
    rev: 0,
    products: initialProducts.map((product, index) => ({
      order: index,
      stock: true,
      discount: 0,
      category: 'Default',
      description: '',
      image_path: '',
      ...product,
    })),
  };
  await fs.writeFile(dataPath, JSON.stringify(payload, null, 2));
  const store = createProductStore({ dataPath, changeLogPath });
  return { store, dataPath, changeLogPath, tmpDir };
}

test('accepts updates on distinct fields without conflict', async (t) => {
  const { store } = await createTempStore([
    { name: 'Widget', price: 1000 },
  ]);

  const first = await store.applyPatch({
    productId: 'Widget',
    baseRev: 0,
    fields: { price: 1200 },
    source: 'offline',
    changesetId: 'offline-1',
    timestamp: '2025-01-01T00:01:00.000Z',
  });

  assert.deepEqual(first.accepted_fields, ['price']);
  assert.equal(first.product.price, 1200);
  assert.equal(first.rev, 1);

  const second = await store.applyPatch({
    productId: 'Widget',
    baseRev: 1,
    fields: { description: 'Nuevo' },
    source: 'admin',
    changesetId: 'admin-1',
    timestamp: '2025-01-01T00:02:00.000Z',
  });

  assert.deepEqual(second.accepted_fields, ['description']);
  assert.equal(second.product.description, 'Nuevo');
  assert.equal(second.rev, 2);
  assert.equal(second.product.price, 1200);
  assert.equal(second.conflicts.length, 0);

  const history = await store.getChangesSince(0);
  assert.equal(history.changes.length, 2);
});

test('rejects outdated updates on same field with conflict details', async () => {
  const { store } = await createTempStore([
    { name: 'Widget', price: 1000 },
  ]);

  await store.applyPatch({
    productId: 'Widget',
    baseRev: 0,
    fields: { price: 1500 },
    source: 'admin',
    changesetId: 'admin-1',
    timestamp: '2025-01-01T00:01:00.000Z',
  });

  const outdated = await store.applyPatch({
    productId: 'Widget',
    baseRev: 0,
    fields: { price: 900 },
    source: 'offline',
    changesetId: 'offline-1',
    timestamp: '2025-01-01T00:01:30.000Z',
  });

  assert.equal(outdated.accepted_fields.length, 0);
  assert.equal(outdated.conflicts.length, 1);
  assert.equal(outdated.conflicts[0].field, 'price');
  assert.equal(outdated.conflicts[0].resolved_to, 1500);
  assert.equal(outdated.rev, 1);
});

test('uses timestamp tiebreaker when base revisions match', async () => {
  const { store } = await createTempStore([
    { name: 'Widget', price: 1000 },
  ]);

  await store.applyPatch({
    productId: 'Widget',
    baseRev: 0,
    fields: { price: 1300 },
    source: 'offline',
    changesetId: 'offline-1',
    timestamp: '2025-01-01T00:01:00.000Z',
  });

  const second = await store.applyPatch({
    productId: 'Widget',
    baseRev: 1,
    fields: { price: 1350 },
    source: 'admin',
    changesetId: 'admin-2',
    timestamp: '2025-01-01T00:02:00.000Z',
  });

  assert.equal(second.product.price, 1350);
  assert.equal(second.rev, 2);
});

test('idempotent patches reuse prior response', async () => {
  const { store } = await createTempStore([
    { name: 'Widget', price: 1000 },
  ]);

  const first = await store.applyPatch({
    productId: 'Widget',
    baseRev: 0,
    fields: { stock: false },
    source: 'offline',
    changesetId: 'offline-1',
    timestamp: '2025-01-01T00:01:30.000Z',
  });

  const second = await store.applyPatch({
    productId: 'Widget',
    baseRev: 0,
    fields: { stock: false },
    source: 'offline',
    changesetId: 'offline-1',
    timestamp: '2025-01-01T00:02:00.000Z',
  });

  assert.deepEqual(second, first);

  const history = await store.getChangesSince(0);
  assert.equal(history.changes.length, 1);
});

test('admin precedence resolves exact timestamp collision', async () => {
  const { store } = await createTempStore([
    { name: 'Widget', price: 1000 },
  ]);

  await store.applyPatch({
    productId: 'Widget',
    baseRev: 0,
    fields: { price: 1400 },
    source: 'offline',
    changesetId: 'offline-1',
    timestamp: '2025-01-01T00:01:00.000Z',
  });

  const offline = await store.applyPatch({
    productId: 'Widget',
    baseRev: 1,
    fields: { price: 1100 },
    source: 'offline',
    changesetId: 'offline-2',
    timestamp: '2025-01-01T00:02:00.000Z',
  });

  assert.equal(offline.product.price, 1100);
  assert.equal(offline.rev, 2);

  const adminTie = await store.applyPatch({
    productId: 'Widget',
    baseRev: 2,
    fields: { price: 1250 },
    source: 'admin',
    changesetId: 'admin-3',
    timestamp: '2025-01-01T00:02:00.000Z',
  });

  assert.equal(adminTie.product.price, 1250);
  assert.equal(adminTie.rev, 3);
});

test('stable hash fallback provides deterministic result for identical sources', async () => {
  const { store } = await createTempStore([
    { name: 'Widget', price: 1000 },
  ]);

  const initial = await store.applyPatch({
    productId: 'Widget',
    baseRev: 0,
    fields: { discount: 100 },
    source: 'offline',
    changesetId: 'offline-1',
    timestamp: '2025-01-01T00:01:00.000Z',
  });

  assert.equal(initial.product.discount, 100);

  const conflictWinner = await store.applyPatch({
    productId: 'Widget',
    baseRev: 1,
    fields: { discount: 200 },
    source: 'offline',
    changesetId: 'offline-za',
    timestamp: '2025-01-01T00:02:00.000Z',
  });

  assert.equal(conflictWinner.product.discount, 200);

  const tieLoser = await store.applyPatch({
    productId: 'Widget',
    baseRev: 1,
    fields: { discount: 50 },
    source: 'offline',
    changesetId: 'offline-aa',
    timestamp: '2025-01-01T00:02:00.000Z',
  });

  assert.equal(tieLoser.conflicts.length, 1);
  assert.equal(tieLoser.product.discount, 200);
});

test('rejects invalid price updates that fail validation', async () => {
  const { store } = await createTempStore([
    { name: 'Widget', price: 1000 },
  ]);

  await assert.rejects(
    store.applyPatch({
      productId: 'Widget',
      baseRev: 0,
      fields: { price: 'abc' },
      source: 'admin',
      changesetId: 'invalid-price',
      timestamp: '2025-01-01T00:03:00.000Z',
    }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /price/i);
      return true;
    },
  );
});

test('rejects discounts that exceed the product price', async () => {
  const { store } = await createTempStore([
    { name: 'Widget', price: 1000 },
  ]);

  await assert.rejects(
    store.applyPatch({
      productId: 'Widget',
      baseRev: 0,
      fields: { discount: 2000 },
      source: 'offline',
      changesetId: 'invalid-discount',
      timestamp: '2025-01-01T00:03:30.000Z',
    }),
    (error) => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /discount/i);
      return true;
    },
  );
});

test('records conflicts for unsupported fields instead of mutating the product', async () => {
  const { store } = await createTempStore([
    { name: 'Widget', price: 1000 },
  ]);

  const response = await store.applyPatch({
    productId: 'Widget',
    baseRev: 0,
    fields: { rev: 999 },
    source: 'admin',
    changesetId: 'unsupported-field',
    timestamp: '2025-01-01T00:04:00.000Z',
  });

  assert.equal(response.rev, 0);
  assert.deepEqual(response.accepted_fields, []);
  assert.equal(response.conflicts.length, 1);
  assert.equal(response.conflicts[0].field, 'rev');
  assert.equal(response.conflicts[0].reason, 'field_not_supported');
  assert.equal(response.product.rev, 0);
});
