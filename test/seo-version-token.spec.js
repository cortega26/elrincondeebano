import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { versionTokenFromFile } from '../astro-poc/src/lib/seo.ts';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-tok-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeAsset(name, bytes) {
  const rel = `assets/images/og/${name}`;
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, bytes);
  return rel;
}

function expectedToken(bytes) {
  return crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 12);
}

describe('versionTokenFromFile memoization (plan 185)', () => {
  it('returns stable tokens and reads each file once', () => {
    const rel = writeAsset('memo-a.og.jpg', Buffer.from('bytes-one'));
    const readSpy = vi.spyOn(fs, 'readFileSync');
    try {
      const first = versionTokenFromFile(rel, { repoRoot: dir });
      const second = versionTokenFromFile(rel, { repoRoot: dir });
      expect(first).toBe(second);
      expect(first).toBe(expectedToken(Buffer.from('bytes-one')));
      expect(readSpy).toHaveBeenCalledTimes(1);
    } finally {
      readSpy.mockRestore();
    }
  });

  it('re-hashes when bytes change (mtime-keyed, never path-alone)', () => {
    const rel = writeAsset('memo-b.og.jpg', Buffer.from('v1'));
    const before = versionTokenFromFile(rel, { repoRoot: dir });
    const abs = path.resolve(dir, rel);
    fs.writeFileSync(abs, Buffer.from('v2-bytes-different'));
    const later = new Date(Date.now() + 2000);
    fs.utimesSync(abs, later, later);
    const after = versionTokenFromFile(rel, { repoRoot: dir });
    expect(after).not.toBe(before);
    expect(after).toBe(expectedToken(Buffer.from('v2-bytes-different')));
  });

  it('returns null for missing and non-file inputs', () => {
    expect(versionTokenFromFile('assets/images/og/nope.jpg', { repoRoot: dir })).toBeNull();
    fs.mkdirSync(path.join(dir, 'assets', 'images', 'og', 'adir'), { recursive: true });
    expect(versionTokenFromFile('assets/images/og/adir', { repoRoot: dir })).toBeNull();
  });
});
