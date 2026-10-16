import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { z } from 'zod';
import { JsonFileRepository } from './jsonFileRepository.ts';
import { commsDocumentSchema, type CommsDocument } from '../../shared/schemas/comms.ts';
import { seedDocument } from '../../shared/comms.ts';

// Plan 217 / ADR 0011: datos privados de comunicaciones (plantillas,
// destinos con teléfonos, registro de actividad). Viven en data/.comms/,
// que está en .gitignore completo (incluye los .backup_* del writer
// atómico) y fuera de BACKUP_FILES, del sync al storefront y del git add
// de publicación (que solo agrega rutas explícitas).
export const COMMS_RELATIVE_PATH = 'data/.comms/comms.json';

export class CommsConflictError extends Error {
  public readonly currentRev: number;

  constructor(currentRev: number) {
    super(`La revisión cambió (actual: ${currentRev}); recarga antes de guardar`);
    this.name = 'CommsConflictError';
    this.currentRev = currentRev;
  }
}

export class CommsRepository extends JsonFileRepository<CommsDocument> {
  private readonly filePath: string;

  constructor(repoRoot: string) {
    super();
    this.filePath = resolve(repoRoot, COMMS_RELATIVE_PATH);
  }

  getFilePath(): string {
    return this.filePath;
  }

  protected getSchema(): z.ZodType<CommsDocument> {
    return commsDocumentSchema as z.ZodType<CommsDocument>;
  }

  /** Documento actual, o el inicial (sin persistir) si aún no existe. */
  read(): CommsDocument {
    if (!existsSync(this.filePath)) return seedDocument();
    return this.load();
  }

  /**
   * Reemplaza el documento completo con control de concurrencia optimista:
   * `expectedRev` debe coincidir con la revisión guardada.
   */
  save(next: CommsDocument, expectedRev: number): CommsDocument {
    const current = this.read();
    if (current.rev !== expectedRev) {
      throw new CommsConflictError(current.rev);
    }
    const stored: CommsDocument = {
      ...next,
      rev: current.rev + 1,
      updated_at: new Date().toISOString(),
    };
    mkdirSync(dirname(this.filePath), { recursive: true, mode: 0o700 });
    this.saveAtomic(stored, { maxBackups: 10 });
    try {
      chmodSync(this.filePath, 0o600);
    } catch {
      /* best-effort en sistemas sin permisos POSIX */
    }
    return stored;
  }
}
