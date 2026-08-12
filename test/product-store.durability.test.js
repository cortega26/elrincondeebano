'use strict';

// Plan 030: fault-injection durability tests for the ProductStore two-file
// commit protocol. A faulting fs adapter injects failures at every write/
// rename boundary; after each simulated interruption a FRESH ProductStore
// must recover to the COMPLETE old or COMPLETE new pair — never a split,
// never invalid JSON, and never a false-success idempotency cache.

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const { createProductStore } = require('../server/productStore');

const BASE_PAYLOAD = {
  version: '20250101-000000',
  last_updated: '2025-01-01T00:00:00.000Z',
  rev: 0,
  products: [
    {
      id: 'Widget',
      name: 'Widget',
      description: '',
      price: 100,
      discount: 0,
      stock: true,
      category: 'Default',
      image_path: '',
      image_avif_path: '',
      order: 0,
      is_archived: false,
      rev: 0,
      field_last_modified: {},
    },
  ],
};

const BASE_LOG = { latest_rev: 0, changes: [], changesets: {} };

function failingFs(failOn) {
  // failOn: set of operation labels to fail ONCE, e.g. 'write:state.txn-tmp'.
  const targets = new Set(failOn);
  const calls = [];
  const fail = (label) => {
    calls.push(label);
    if (targets.has(label)) {
      targets.delete(label);
      const error = new Error(`injected failure: ${label}`);
      error.code = 'EIO';
      throw error;
    }
  };
  return {
    calls,
    async mkdir(dir, opts) {
      return fs.mkdir(dir, opts);
    },
    async readFile(filePath, encoding) {
      return fs.readFile(filePath, encoding);
    },
    async access(filePath) {
      return fs.access(filePath);
    },
    async writeFile(filePath, data, encoding) {
      const base = path.basename(filePath);
      fail(`write:${base}`);
      return fs.writeFile(filePath, data, encoding);
    },
    async rename(from, to) {
      fail(`rename:${path.basename(from)}->${path.basename(to)}`);
      return fs.rename(from, to);
    },
    async unlink(filePath) {
      void fail(`unlink:${path.basename(filePath)}`);
      return fs.unlink(filePath).catch(() => {});
    },
  };
}

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'store-durability-'));
}

async function writeBaselines(dir) {
  await fs.writeFile(path.join(dir, 'product_data.json'), JSON.stringify(BASE_PAYLOAD, null, 2));
  await fs.writeFile(path.join(dir, 'product_changes.json'), JSON.stringify(BASE_LOG, null, 2));
}

async function readPair(dir) {
  const state = JSON.parse(await fs.readFile(path.join(dir, 'product_data.json'), 'utf8'));
  const log = JSON.parse(await fs.readFile(path.join(dir, 'product_changes.json'), 'utf8'));
  return { state, log };
}

function isValidPair(pair) {
  return (
    pair &&
    typeof pair.state?.rev === 'number' &&
    typeof pair.log?.latest_rev === 'number' &&
    pair.state.rev === pair.log.latest_rev
  );
}

const BOUNDARIES = [
  'write:product_data.json.txn-tmp',
  'write:product_changes.json.txn-tmp',
  'write:.product-txn.json',
  'rename:product_data.json->product_data.json.txn-backup',
  'rename:product_changes.json->product_changes.json.txn-backup',
  'rename:product_data.json.txn-tmp->product_data.json',
  'rename:product_changes.json.txn-tmp->product_changes.json',
];

for (const boundary of BOUNDARIES) {
  test(`interruption at ${boundary} recovers to a complete pair`, async () => {
    const dir = await createTempDir();
    try {
      await writeBaselines(dir);
      const adapter = failingFs([boundary]);
      const store = createProductStore({
        dataPath: path.join(dir, 'product_data.json'),
        changeLogPath: path.join(dir, 'product_changes.json'),
        fs: adapter,
      });

      let patchRejected = false;
      try {
        await store.applyPatch({
          productId: 'Widget',
          baseRev: 0,
          fields: { price: 150 },
          source: 'offline',
          changesetId: 'txn-1',
          timestamp: '2025-01-01T00:02:00.000Z',
        });
      } catch (error) {
        patchRejected = true;
        assert.match(String(error.message), /injected failure|EIO/);
      }
      // The failure must not silently succeed, except for cleanup unlinks.
      assert.ok(patchRejected, `patch should have failed at ${boundary}`);

      // A FRESH instance must recover to the complete old or complete new pair.
      const fresh = createProductStore({
        dataPath: path.join(dir, 'product_data.json'),
        changeLogPath: path.join(dir, 'product_changes.json'),
      });
      await fresh._loadState();
      const pair = await readPair(dir);
      assert.ok(isValidPair(pair), `split or invalid pair after ${boundary}`);

      const allowedRevs = [0, 1];
      assert.ok(
        allowedRevs.includes(pair.state.rev),
        `rev must be 0 (old) or 1 (new), got ${pair.state.rev}`
      );
      if (pair.state.rev === 1) {
        assert.equal(pair.state.products[0].price, 150);
        assert.equal(pair.log.latest_rev, 1);
      } else {
        assert.equal(pair.state.products[0].price, 100);
      }
      // A subsequent patch works on the recovered pair.
      const result = await fresh.applyPatch({
        productId: 'Widget',
        baseRev: pair.state.rev,
        fields: { price: 200 },
        source: 'offline',
        changesetId: 'txn-2',
        timestamp: '2025-01-01T00:03:00.000Z',
      });
      assert.equal(result.rev, pair.state.rev + 1);
      assert.equal(result.product.price, 200);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
}

test('failed commit does not publish a false-success idempotency cache', async () => {
  const dir = await createTempDir();
  try {
    await writeBaselines(dir);
    const adapter = failingFs(['write:product_data.json.txn-tmp']);
    const store = createProductStore({
      dataPath: path.join(dir, 'product_data.json'),
      changeLogPath: path.join(dir, 'product_changes.json'),
      fs: adapter,
    });

    await assert.rejects(
      store.applyPatch({
        productId: 'Widget',
        baseRev: 0,
        fields: { price: 150 },
        source: 'offline',
        changesetId: 'fail-cache',
        timestamp: '2025-01-01T00:02:00.000Z',
      })
    );

    // The idempotency cache must NOT answer from memory after the failure.
    await store._loadState();
    assert.equal(store._changeLog.changesets['fail-cache'], undefined);

    // Retrying with a working adapter persists and caches the result once.
    store._fs = fs;
    const retry = await store.applyPatch({
      productId: 'Widget',
      baseRev: 0,
      fields: { price: 150 },
      source: 'offline',
      changesetId: 'fail-cache',
      timestamp: '2025-01-01T00:02:00.000Z',
    });
    assert.equal(retry.rev, 1);
    assert.equal(store._changeLog.changesets['fail-cache'].rev, 1);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('no-op changesets commit durably through the same protocol', async () => {
  const dir = await createTempDir();
  try {
    await writeBaselines(dir);
    const store = createProductStore({
      dataPath: path.join(dir, 'product_data.json'),
      changeLogPath: path.join(dir, 'product_changes.json'),
    });
    const noop = await store.applyPatch({
      productId: 'Widget',
      baseRev: 0,
      fields: { price: 100 }, // same value → no-op
      source: 'offline',
      changesetId: 'noop-1',
      timestamp: '2025-01-01T00:02:00.000Z',
    });
    assert.equal(noop.rev, 0);
    assert.equal(noop.accepted_fields.length, 0);

    // The no-op cache entry survived restart via the durable changelog.
    const fresh = createProductStore({
      dataPath: path.join(dir, 'product_data.json'),
      changeLogPath: path.join(dir, 'product_changes.json'),
    });
    const replay = await fresh.applyPatch({
      productId: 'Widget',
      baseRev: 0,
      fields: { price: 100 },
      source: 'offline',
      changesetId: 'noop-1',
      timestamp: '2025-01-01T00:02:00.000Z',
    });
    assert.equal(replay.rev, 0);
    assert.equal(replay.accepted_fields.length, 0);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('no direct target writeFile calls remain in the commit path', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'server', 'productStore.js'), 'utf8');
  const commitSection = source.slice(source.indexOf('_commit('), source.indexOf('_txnPaths('));
  assert.ok(!commitSection.includes('writeFile(this.dataPath'));
  assert.ok(!commitSection.includes('writeFile(this.changeLogPath'));
});
