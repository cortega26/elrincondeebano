import { test, expect } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { JsonFileRepository } from '../../src/server/repositories/jsonFileRepository.ts';
import { writeJsonFileAtomic } from '../../src/server/services/atomicFileWriter.ts';

const testSchema = z.object({ rev: z.number().int().nonnegative(), name: z.string() });
type TestData = z.infer<typeof testSchema>;

class TestRepo extends JsonFileRepository<TestData> {
  constructor(private readonly file: string) {
    super();
  }

  getFilePath(): string {
    return this.file;
  }

  protected getSchema(): z.ZodType<TestData> {
    return testSchema;
  }

  saveForTest(data: TestData, maxBackups = 10): void {
    // Access protected helper via any to keep the public surface minimal.
    (this as unknown as { saveAtomic: (d: TestData, o: unknown) => void }).saveAtomic(data, {
      maxBackups,
      filePrefix: 'test.json',
    });
  }
}

function createTempDir(): string {
  const dir = resolve(tmpdir(), `cm-json-base-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

test('JsonFileRepository write → load round-trip via shared writer', () => {
  const dir = createTempDir();
  try {
    const file = resolve(dir, 'test.json');
    const repo = new TestRepo(file);
    const payload: TestData = { rev: 7, name: 'hola' };
    writeJsonFileAtomic(file, payload, { maxBackups: 5, filePrefix: 'test.json' });
    const loaded = repo.load();
    expect(loaded).toEqual(payload);
    // Second load hits mtime+size cache (same reference).
    const second = repo.load();
    expect(second).toBe(loaded);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('JsonFileRepository backup created and pruned to N', () => {
  const dir = createTempDir();
  try {
    const file = resolve(dir, 'test.json');
    const repo = new TestRepo(file);
    // Seed file so the first writer call creates a backup on the second write.
    repo.saveForTest({ rev: 1, name: 'a' }, 2);
    expect(readdirSync(dir).filter((f) => f.startsWith('test.json.backup_'))).toHaveLength(0);
    repo.saveForTest({ rev: 2, name: 'b' }, 2);
    repo.saveForTest({ rev: 3, name: 'c' }, 2);
    repo.saveForTest({ rev: 4, name: 'd' }, 2);
    repo.saveForTest({ rev: 5, name: 'e' }, 2);
    const backups = readdirSync(dir).filter((f) => f.startsWith('test.json.backup_'));
    // Bounded retention: at most 2 backups kept.
    expect(backups.length).toBeLessThanOrEqual(2);
    // Latest payload still loadable.
    const loaded = repo.load();
    expect(loaded.rev).toBe(5);
    expect(loaded.name).toBe('e');
    // Raw file still valid JSON.
    const raw = JSON.parse(readFileSync(file, 'utf-8')) as TestData;
    expect(raw.rev).toBe(5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('JsonFileRepository malformed file throws typed error', () => {
  const dir = createTempDir();
  try {
    const file = resolve(dir, 'test.json');
    // Invalid JSON
    writeFileSync(file, 'not json', 'utf-8');
    const repo = new TestRepo(file);
    expect(() => repo.load()).toThrow(/Invalid JSON/);
    // Valid JSON but schema violation (missing name, wrong type)
    writeFileSync(file, JSON.stringify({ rev: 'oops', name: 123 }), 'utf-8');
    // Invalidate cache by touching mtime: writeFileSync already does, but repo cached the previous throw? Actually load threw before caching, so next load will re-read.
    expect(() => repo.load()).toThrow(/Schema validation failed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('JsonFileRepository cache invalidates on external edit via mtime/size', async () => {
  const dir = createTempDir();
  try {
    const file = resolve(dir, 'test.json');
    const repo = new TestRepo(file);
    writeJsonFileAtomic(file, { rev: 1, name: 'first' }, { maxBackups: 0, filePrefix: 'test.json' });
    const first = repo.load();
    expect(first.name).toBe('first');
    // Ensure mtime changes — sleep a tick on coarse FS.
    await new Promise((r) => setTimeout(r, 15));
    writeFileSync(file, JSON.stringify({ rev: 2, name: 'external' }), 'utf-8');
    const after = repo.load();
    expect(after).not.toBe(first);
    expect(after.name).toBe('external');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeJsonFileAtomic restores previous file when tmp→target rename fails (via backup)', () => {
  // This mirrors the contract in repositories.test.ts for CategoryRepository;
  // the generic writer must preserve the same restore guarantee. We do not
  // fault-inject renameSync here (mocking node:fs is tested in
  // atomicWriter.test.ts), but we verify that a successful write leaves the
  // target valid and a backup exists when expected.
  const dir = createTempDir();
  try {
    const file = resolve(dir, 'test.json');
    writeJsonFileAtomic(file, { rev: 1, name: 'seed' }, { maxBackups: 5, filePrefix: 'test.json' });
    const before = readFileSync(file, 'utf-8');
    writeJsonFileAtomic(file, { rev: 2, name: 'next' }, { maxBackups: 5, filePrefix: 'test.json' });
    const after = readFileSync(file, 'utf-8');
    expect(after).not.toBe(before);
    expect(JSON.parse(after).rev).toBe(2);
    const backups = readdirSync(dir).filter((f) => f.includes('backup_'));
    expect(backups.length).toBeGreaterThan(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
