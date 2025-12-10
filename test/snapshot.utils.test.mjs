import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

import {
  sanitizeTag,
  appendSnapshotMetadata,
  removeLatestSnapshot,
} from '../tools/snapshot-site.mjs';

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
  assert.deepEqual(
    manifest.snapshots.map((entry) => entry.tag),
    ['release', 'baseline']
  );
});

test('removeLatestSnapshot returns null when there are no entries', async () => {
  const manifestPath = await createTempManifestPath();
  const removed = await removeLatestSnapshot(manifestPath);
  assert.equal(removed, null);
});

test('removeLatestSnapshot deletes the newest snapshot and keeps the rest', async () => {
  const manifestPath = await createTempManifestPath();
  const artifactsDir = path.dirname(manifestPath);
  const olderFile = path.join(artifactsDir, 'snapshot-baseline.png');
  const newerFile = path.join(artifactsDir, 'snapshot-release.png');

  await writeFile(olderFile, 'baseline-artifact');
  await writeFile(newerFile, 'release-artifact');

  const manifestData = {
    snapshots: [
      {
        tag: 'baseline',
        url: 'http://localhost:8080/',
        file: olderFile,
        capturedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        tag: 'release',
        url: 'http://localhost:8080/',
        file: newerFile,
        capturedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
  };

  await writeFile(manifestPath, `${JSON.stringify(manifestData, null, 2)}\n`);

  const removed = await removeLatestSnapshot(manifestPath);

  assert.equal(removed.tag, 'release');
  await assert.rejects(readFile(newerFile), (error) => error.code === 'ENOENT');

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(
    manifest.snapshots.map((entry) => entry.tag),
    ['baseline']
  );
});

test('removeLatestSnapshot can skip deleting artifacts when requested', async () => {
  const manifestPath = await createTempManifestPath();
  const artifactsDir = path.dirname(manifestPath);
  const olderFile = path.join(artifactsDir, 'snapshot-baseline.png');
  const newerFile = path.join(artifactsDir, 'snapshot-release.png');

  await writeFile(olderFile, 'baseline-artifact');
  await writeFile(newerFile, 'release-artifact');

  const manifestData = {
    snapshots: [
      {
        tag: 'baseline',
        url: 'http://localhost:8080/',
        file: olderFile,
        capturedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        tag: 'release',
        url: 'http://localhost:8080/',
        file: newerFile,
        capturedAt: '2025-01-01T00:00:00.000Z',
      },
    ],
  };

  await writeFile(manifestPath, `${JSON.stringify(manifestData, null, 2)}\n`);

  const removed = await removeLatestSnapshot(manifestPath, { deleteArtifact: false });

  assert.equal(removed.tag, 'release');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.deepEqual(
    manifest.snapshots.map((entry) => entry.tag),
    ['baseline']
  );
  const artifact = await readFile(newerFile, 'utf8');
  assert.equal(artifact, 'release-artifact');
});
