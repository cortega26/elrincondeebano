import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IdempotencyStore } from './idempotencyStore.ts';
import type { CommandResult } from '../../shared/commands/envelope.ts';

export class PersistentIdempotencyStore {
  private readonly cache = new Map<string, CommandResult>();
  private readonly maxEntries: number;
  private readonly filePath: string;

  constructor(repoRoot: string, maxEntries = 200) {
    this.maxEntries = maxEntries;
    const dir = resolve(repoRoot, 'data');
    mkdirSync(dir, { recursive: true });
    this.filePath = resolve(dir, 'idempotency.json');
    this.load();
  }

  get(commandId: string): CommandResult | undefined {
    return this.cache.get(commandId);
  }

  set(commandId: string, result: CommandResult): void {
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(commandId, result);
    this.persist();
  }

  has(commandId: string): boolean {
    return this.cache.has(commandId);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
    try {
      unlinkSync(this.filePath);
    } catch {
      /* ignore */
    }
  }

  private persist(): void {
    try {
      const data = Object.fromEntries(this.cache);
      writeFileSync(this.filePath, JSON.stringify(data), { encoding: 'utf-8', flush: true });
    } catch {
      // Best-effort persistence
    }
  }

  private load(): void {
    if (!existsSync(this.filePath)) return;
    try {
      const raw = readFileSync(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, CommandResult>;
      for (const [key, value] of Object.entries(data)) {
        this.cache.set(key, value);
      }
    } catch {
      // Corrupt file — start fresh
      try {
        unlinkSync(this.filePath);
      } catch {
        /* ignore */
      }
    }
  }
}
