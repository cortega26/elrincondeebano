import { useState } from 'react';
import { buildBackup, parseBackup } from '../../../shared/comms.ts';
import type { CommsDocument } from '../../../shared/schemas/comms.ts';
import { downloadBlob } from './handoff.ts';

export function BackupPanel({
  doc,
  busy,
  onImport,
  onError,
}: {
  doc: CommsDocument;
  busy: boolean;
  onImport: (doc: CommsDocument) => Promise<void>;
  onError: (text: string) => void;
}): React.ReactElement {
  const [pending, setPending] = useState<CommsDocument | null>(null);
  return (
    <details className="comms-panel">
      <summary>Respaldo</summary>
      <p className="comms-hint">
        El respaldo incluye teléfonos de vecinos: guárdalo en un lugar privado, nunca en el repo.
      </p>
      <div className="comms-actions">
        <button
          type="button"
          onClick={() => {
            const blob = new Blob([JSON.stringify(buildBackup(doc), null, 2)], {
              type: 'application/json',
            });
            downloadBlob(blob, `rincon-mensajes-${new Date().toISOString().slice(0, 10)}.json`);
          }}
        >
          Exportar respaldo
        </button>
        <label className="comms-upload">
          Importar respaldo
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              const result = parseBackup(await file.text());
              if (!result.ok) {
                onError(`Respaldo inválido: ${result.errors.slice(0, 3).join('; ')}`);
                return;
              }
              setPending(result.value);
            }}
          />
        </label>
      </div>
      {pending && (
        <div className="comms-confirm">
          <span>
            Reemplazar todo por el respaldo ({pending.templates.length} plantillas,{' '}
            {pending.destinations.length} destinos)?
          </span>
          <button
            type="button"
            className="btn--danger"
            disabled={busy}
            onClick={async () => {
              await onImport(pending);
              setPending(null);
            }}
          >
            Reemplazar
          </button>
          <button type="button" onClick={() => setPending(null)}>
            Cancelar
          </button>
        </div>
      )}
    </details>
  );
}
