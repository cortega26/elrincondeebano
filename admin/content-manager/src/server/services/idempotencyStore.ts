import type { CommandResult } from '../../shared/commands/envelope.ts';

export class IdempotencyStore {
  private readonly cache = new Map<string, CommandResult>();
  private readonly maxEntries: number;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
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
  }

  has(commandId: string): boolean {
    return this.cache.has(commandId);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
