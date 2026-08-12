import { test, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { relocateFileForTest } from '../../src/server/services/mediaRelocation.ts';

const setup = () => {
  const dir = resolve(
    tmpdir(),
    `media-relocation-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(resolve(dir, 'assets', 'images', 'oldcat'), { recursive: true });
  mkdirSync(resolve(dir, 'assets', 'images', 'newcat'), { recursive: true });
  writeFileSync(resolve(dir, 'assets', 'images', 'oldcat', 'foto.webp'), 'FAKE-WEBP');
  return dir;
};

test('relocates a file between valid category folders (plan 100)', () => {
  const dir = setup();
  try {
    const result = relocateFileForTest(dir, 'assets/images/oldcat/foto.webp', 'oldcat', 'newcat');
    expect(result.moved).toBe(true);
    expect(result.to).toBe('assets/images/newcat/foto.webp');
    expect(existsSync(resolve(dir, 'assets', 'images', 'newcat', 'foto.webp'))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('refuses to move the file outside the image tree (plan 100)', () => {
  const dir = setup();
  try {
    const result = relocateFileForTest(
      dir,
      'assets/images/oldcat/foto.webp',
      'oldcat',
      '../../../../../../tmp/escaped'
    );
    expect(result.moved).toBe(false);
    expect(existsSync(resolve(dir, 'assets', 'images', 'oldcat', 'foto.webp'))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
