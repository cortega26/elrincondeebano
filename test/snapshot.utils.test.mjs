import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import { sanitizeTag, appendSnapshotMetadata } from '../tools/snapshot-site.mjs';

const TMP_PREFIX = 'snapshot-utils-test-';

async function createTempManifestPath() {
  const tempDir = await mkdtemp(path.join(tmpdir(), TMP_PREFIX));
  return path.join(tempDir, 'manifest.json');
}

test('sanitizeTag normalises whitespace and removes diacritics', () => {
  const result = sanitizeTag('  Álbum Promoción 2025  ');
  assert.equal(result, 'album-promocion-2025');
});

test('sanitizeTag enforces minimum length', () => {
  assert.throws(() => sanitizeTag('   '), /tag cannot be empty/);
  assert.throws(() => sanitizeTag('***'), /sanitisation removed all characters/);
});

test('sanitizeTag truncates very long strings', () => {
  const longTag = 'a'.repeat(200);
  const result = sanitizeTag(longTag);
  assert.equal(result.length, 64);
});

test('appendSnapshotMetadata appends entries and keeps them sorted', async () => {
  const manifestPath = await createTempManifestPath();
  const firstEntry = {
    tag: 'baseline',
    url: 'http://localhost:8080/',
    file: 'reports/snapshots/snapshot-baseline.png',
    capturedAt: '2024-01-01T00:00:00.000Z',
  };
  const latestEntry = {
    tag: 'release',
    url: 'http://localhost:8080/',
    file: 'reports/snapshots/snapshot-release.png',
    capturedAt: '2025-01-01T00:00:00.000Z',
  };

  await appendSnapshotMetadata(manifestPath, firstEntry);
  await appendSnapshotMetadata(manifestPath, latestEntry);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(manifest.snapshots.map((entry) => entry.tag), ['release', 'baseline']);
});
