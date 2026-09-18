// Plan 181: small state-machine gaps — quotepath-aware porcelain parsing
// (pure + real-repo end to end). cancelJob is covered in jobRunner.test.ts;
// the hash-gate hardening is covered in test/preflight-hash-gate.test.js.
// The migration-lock slice was dropped with a verdict (see the commit +
// the plan-181 note at the migration write site): the writer is synchronous
// and MutationLock is non-reentrant, so locking there would deadlock
// writeCatalog's in-lock re-read.
import { test, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parsePorcelainStatus,
  unquotePorcelainPath,
} from '../../src/server/adapters/gitAdapter.ts';

test('unquotePorcelainPath passes plain paths through', () => {
  expect(unquotePorcelainPath('assets/images/logo.png')).toBe('assets/images/logo.png');
  expect(unquotePorcelainPath('')).toBe('');
  expect(unquotePorcelainPath('"unterminated')).toBe('"unterminated');
});

test('unquotePorcelainPath decodes quotepath escapes', () => {
  // café.txt in UTF-8 octal bytes, quote and backslash escapes.
  expect(unquotePorcelainPath('"caf\\303\\251.txt"')).toBe('café.txt');
  expect(unquotePorcelainPath('"a\\"b\\\\c\\td"')).toBe('a"b\\c\td');
  expect(unquotePorcelainPath('"plain quoted"')).toBe('plain quoted');
});

test('stock git really does quote non-ASCII porcelain paths (bug premise)', () => {
  const dir = resolve(
    tmpdir(),
    `cm-quotepath-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  try {
    execFileSync('git', ['init'], { cwd: dir });
    execFileSync('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
    execFileSync('git', ['config', 'user.name', 'T'], { cwd: dir });
    writeFileSync(resolve(dir, 'café-日本語.txt'), 'hello');
    execFileSync('git', ['add', 'café-日本語.txt'], { cwd: dir });

    const raw = execFileSync('git', ['status', '--porcelain'], {
      cwd: dir,
      encoding: 'utf-8',
    }) as string;
    expect(raw).toContain('"');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Byte-exact porcelain captured from stock git 2.43 (see od dump in the
// plan-181 work): quoted staged entry + untracked entry + branch line.
const RECORDED_PORCELAIN =
  '## No commits yet on master\n' +
  'A  "caf\\303\\251-\\346\\227\\245\\346\\234\\254.txt"\n' +
  ' M plain-edited.txt\n' +
  '?? "untracked \\346\\227\\245.txt"\n';

test('parsePorcelainStatus decodes quoted paths into real names', () => {
  const parsed = parsePorcelainStatus(RECORDED_PORCELAIN);
  expect(parsed.staged).toEqual(['café-日本.txt']);
  expect(parsed.unstaged).toEqual(['plain-edited.txt']);
  expect(parsed.untracked).toEqual(['untracked 日.txt']);
  expect(parsed.staged.some((p) => p.includes('\\'))).toBe(false);
});

test('parsePorcelainStatus reads ahead/behind/conflicts', () => {
  const parsed = parsePorcelainStatus(
    '## master...origin/master [ahead 2, behind 1]\nUU conflicted.txt\n'
  );
  expect(parsed.ahead).toBe(2);
  expect(parsed.behind).toBe(1);
  expect(parsed.hasConflicts).toBe(true);
  // Unmerged paths surface via the flag only (pre-existing representation,
  // preserved by the extraction — UU carries no M/A/D marker).
  expect(parsed.staged).toEqual([]);
  expect(parsed.unstaged).toEqual([]);
});

test('parsePorcelainStatus tolerates empty output', () => {
  expect(parsePorcelainStatus('')).toEqual({
    staged: [],
    unstaged: [],
    untracked: [],
    ahead: 0,
    behind: 0,
    hasConflicts: false,
  });
});
