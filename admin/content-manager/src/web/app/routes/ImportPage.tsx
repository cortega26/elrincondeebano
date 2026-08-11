import { useState } from 'react';
import { fetchWithCredential } from '../credentialStore.ts';
import type {
  ImportPreviewResponse,
  ImportApplyResponse,
  ImportResolution,
} from '../../../shared/schemas/importExport.ts';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function ImportPage(): React.ReactElement {
  const [input, setInput] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null);
  const [resolutions, setResolutions] = useState<
    Record<string, Record<string, 'keep_local' | 'use_incoming'>>
  >({});
  const [approvalPending, setApprovalPending] = useState(false);
  const [result, setResult] = useState<ImportApplyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hasInput = input.trim().length > 0 || fileName !== null;

  const handleFile = (file: File | undefined): void => {
    if (!file) {
      setFileName(null);
      setFileSize(null);
      return;
    }
    setError(null);
    setResult(null);
    setPreview(null);

    if (file.size > MAX_FILE_SIZE) {
      setFileName(file.name);
      setFileSize(file.size);
      setError(`El archivo supera el límite de ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB`);
      return;
    }

    setFileName(file.name);
    setFileSize(file.size);
    const reader = new FileReader();
    reader.onload = (): void => {
      setInput(String(reader.result ?? ''));
    };
    reader.onerror = (): void => {
      setError('No se pudo leer el archivo');
    };
    reader.readAsText(file, 'utf-8');
  };

  const handlePreview = async (): Promise<void> => {
    setError(null);
    setResult(null);
    setApprovalPending(false);
    setLoading(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(input);
      } catch {
        setError('JSON inválido');
        setLoading(false);
        return;
      }

      const products = (parsed as Record<string, unknown>)?.products ?? parsed;

      const response = await fetchWithCredential('/api/v1/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError(
          (err as { error?: { message?: string } }).error?.message ?? `Error ${response.status}`
        );
        setLoading(false);
        return;
      }

      setPreview((await response.json()) as ImportPreviewResponse);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResolution = (
    productId: string,
    field: string,
    resolution: 'keep_local' | 'use_incoming'
  ): void => {
    setResolutions((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] ?? {}), [field]: resolution },
    }));
  };

  const conflicts = preview?.conflicts ?? [];
  const resolvedCount = conflicts.filter(
    (c) => resolutions[c.product_id]?.[c.field] !== undefined
  ).length;
  const allResolved = resolvedCount === conflicts.length;
  const pendingCount = conflicts.length - resolvedCount;
  const actionable = (preview?.summary.additions ?? 0) + (preview?.summary.updates ?? 0) > 0;

  const handleApply = async (): Promise<void> => {
    if (!preview || !allResolved) return;

    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const resolutionList: ImportResolution[] = conflicts
        .filter((c) => resolutions[c.product_id]?.[c.field] !== undefined)
        .map((c) => ({
          product_id: c.product_id,
          field: c.field,
          resolution: resolutions[c.product_id][c.field],
        }));

      const response = await fetchWithCredential('/api/v1/import/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview_id: preview.preview_id, resolutions: resolutionList }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        setError(
          (err as { error?: { message?: string } }).error?.message ?? `Error ${response.status}`
        );
        setApprovalPending(false);
        setLoading(false);
        return;
      }

      const data = (await response.json()) as ImportApplyResponse;
      setResult(data);
      setPreview(null);
      setResolutions({});
      setApprovalPending(false);
      if (data.errors && data.errors.length > 0) {
        setError(`${data.errors.length} productos con errores — descarga el informe.`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const downloadErrorReport = (): void => {
    if (!result?.errors?.length) return;
    const blob = new Blob([result.errors.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-error-report.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main role="main" aria-label="Importar catálogo">
      <h1>Importar catálogo</h1>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="import-file" style={{ display: 'block', marginBottom: '0.25rem' }}>
          Archivo JSON del catálogo
        </label>
        <input
          id="import-file"
          type="file"
          accept=".json,application/json"
          onChange={(e) => handleFile(e.currentTarget.files?.[0])}
        />
        {fileName && (
          <p style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {fileName}
            {fileSize !== null ? ` — ${Math.round(fileSize / 1024)} KB` : ''}
          </p>
        )}
      </div>

      <details style={{ marginBottom: '1rem' }}>
        <summary>Pegar JSON (ruta experta)</summary>
        <textarea
          aria-label="Pegar catálogo JSON"
          rows={12}
          cols={80}
          value={input}
          onChange={(e) => setInput(e.currentTarget.value)}
          placeholder='Pega aquí el catálogo JSON... Ej: { "products": [...] }'
          style={{
            width: '100%',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            marginTop: '0.5rem',
          }}
        />
      </details>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={handlePreview} disabled={loading || !hasInput}>
          Vista previa
        </button>
        {preview && actionable && allResolved && !approvalPending && (
          <button onClick={() => setApprovalPending(true)} disabled={loading}>
            Revisar y aprobar aplicación
          </button>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: '#c62828' }}>
          {error}
        </p>
      )}
      {loading && <p>Cargando…</p>}

      {result && (
        <div style={{ marginBottom: '1rem' }}>
          <p style={{ color: '#2e7d32' }}>
            Creados: {result.created}, actualizados: {result.updated}, omitidos: {result.skipped} —
            revisión {result.resulting_revision}
          </p>
          {result.errors && result.errors.length > 0 && (
            <button onClick={downloadErrorReport}>Descargar informe de errores</button>
          )}
        </div>
      )}

      {preview && (
        <div style={{ marginBottom: '1rem' }}>
          <p>
            <strong>{preview.summary.additions}</strong> creaciones,{' '}
            <strong>{preview.summary.updates}</strong> actualizaciones,{' '}
            <strong>{preview.summary.unchanged}</strong> sin cambios,{' '}
            <strong>{preview.summary.invalid}</strong> inválidos —{' '}
            <strong>{preview.summary.conflicts}</strong> conflictos,{' '}
            <strong>{resolvedCount}</strong> resueltos, <strong>{pendingCount}</strong> pendientes
          </p>

          {preview.validation_errors.length > 0 && (
            <ul role="list" aria-label="Errores de validación">
              {preview.validation_errors.map((v) => (
                <li key={`${v.product_name}-${v.message}`}>
                  {v.product_name}: {v.message}
                </li>
              ))}
            </ul>
          )}

          {conflicts.length > 0 && (
            <table
              aria-label="Conflictos de importación"
              style={{ width: '100%', borderCollapse: 'collapse' }}
            >
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Producto</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Campo</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Valor actual</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Valor entrante</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Resolución</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((c) => (
                  <tr
                    key={`${c.product_id}-${c.field}`}
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                  >
                    <td style={{ padding: '0.25rem 0.5rem' }}>{c.product_name}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{c.field}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{String(c.local_value)}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{String(c.incoming_value)}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>
                      <select
                        aria-label={`Resolución de ${c.product_name} / ${c.field}`}
                        value={resolutions[c.product_id]?.[c.field] ?? ''}
                        onChange={(e) =>
                          handleResolution(
                            c.product_id,
                            c.field,
                            e.currentTarget.value as 'keep_local' | 'use_incoming'
                          )
                        }
                      >
                        <option value="">Elegir…</option>
                        <option value="keep_local">Mantener local</option>
                        <option value="use_incoming">Usar entrante</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {approvalPending && (
            <div
              role="dialog"
              aria-label="Confirmar aplicación de importación"
              style={{
                border: '1px solid var(--color-border)',
                padding: '1rem',
                marginTop: '1rem',
              }}
            >
              <h2>Confirmar aplicación</h2>
              <p>
                Se crearán <strong>{preview.summary.additions}</strong> productos y se actualizarán{' '}
                <strong>{preview.summary.updates}</strong>. Los campos{' '}
                <strong>Mantener local</strong> no se tocan.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={handleApply} disabled={loading} autoFocus>
                  Confirmar aplicación
                </button>
                <button onClick={() => setApprovalPending(false)} disabled={loading}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
