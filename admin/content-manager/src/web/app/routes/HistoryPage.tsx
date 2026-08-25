import { useState, useEffect, useCallback } from 'react';
import { ContentManagerClient } from '../../api/client.ts';
import { fetchWithCredential } from '../credentialStore.ts';

const client = new ContentManagerClient();

interface HistoryEntry {
  product_name: string;
  product_id?: string;
  field: string;
  timestamp?: string;
  by?: string;
  rev?: number;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  change_set_id?: string;
  source_change_set_id?: string;
}

interface ChangeSetOp {
  action: string;
  product_id?: string;
  data: Record<string, unknown>;
  base_revision?: number;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  resulting_revision?: number;
}

interface ChangeSet {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  product_ops: ChangeSetOp[];
  source_change_set_id?: string;
}

interface BackupEntry {
  id: string;
  timestamp: string;
  files: Array<{ name: string; size: number }>;
  backup_class?: string;
  protected_reason?: string;
  cleanup_warning?: string;
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Crear',
  edit: 'Editar',
  archive: 'Archivar',
  restore: 'Restaurar',
};

export function HistoryPage(): React.ReactElement {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>>({});
  const [changeSets, setChangeSets] = useState<ChangeSet[]>([]);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [history, csData, backupData] = await Promise.all([
        client.getHistory(),
        client.getChangeSets(),
        client.getBackups(),
      ]);
      setEntries(history.entries as unknown as HistoryEntry[]);
      setSummary(history as unknown as Record<string, unknown>);
      setChangeSets(csData.items as unknown as ChangeSet[]);
      setBackups(backupData.backups.entries as unknown as BackupEntry[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (url: string, payload?: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetchWithCredential(url, {
        method: 'POST',
        body: JSON.stringify(payload ?? {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          (body as { error?: { message?: string } }).error?.message ?? `Error ${res.status}`
        );
        return false;
      }
      await load();
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleApply = (id: string): void => {
    if (!window.confirm('Aplicar este change set al catálogo?')) return;
    void post(`/api/v1/change-sets/${id}/apply`).then((ok) => {
      if (ok) setFeedback('Change set aplicado ✓');
    });
  };

  const handleDiscard = (id: string): void => {
    if (!window.confirm('Descartar este change set? Esta acción no se puede deshacer.')) return;
    void post(`/api/v1/change-sets/${id}/discard`).then((ok) => {
      if (ok) setFeedback('Change set descartado');
    });
  };

  const handleValidate = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      for (const status of ['validating', 'validated']) {
        const res = await fetchWithCredential(`/api/v1/change-sets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(
            (body as { error?: { message?: string } }).error?.message ?? `Error ${res.status}`
          );
          return;
        }
      }
      setFeedback('Change set validado');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRevert = async (productId: string, rev: number, name: string): Promise<void> => {
    if (!window.confirm(`¿Revertir "${name}" al estado de la revisión ${rev}?`)) return;
    setBusy(true);
    try {
      const res = await fetchWithCredential(
        `/api/v1/history/${encodeURIComponent(productId)}/revert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to_rev: rev }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
        );
      }
      setFeedback('Producto revertido ✓');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = (id: string): void => {
    if (!window.confirm('Crear un change set inverso para deshacer este cambio?')) return;
    void post(`/api/v1/change-sets/${id}/undo`).then((ok) => {
      if (ok) setFeedback('Change set inverso creado (validated) — revisa y aplica');
    });
  };

  const handleRedo = (id: string): void => {
    if (!window.confirm('Reaplicar la operación original (redo)?')) return;
    void post(`/api/v1/change-sets/${id}/redo`).then((ok) => {
      if (ok) setFeedback('Change set de redo creado — revisa y aplica');
    });
  };

  const [prunePreview, setPrunePreview] = useState<Array<{ id: string; reason: string }>>([]);

  const loadPrunePreview = async (): Promise<void> => {
    setError(null);
    try {
      const res = await fetchWithCredential('/api/v1/backup/prune-preview', { method: 'POST' });
      if (!res.ok) return;
      const data = (await res.json()) as { prunable: Array<{ id: string; reason: string }> };
      setPrunePreview(data.prunable);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handlePrune = async (): Promise<void> => {
    if (prunePreview.length === 0) return;
    if (
      !window.confirm(
        `Eliminar ${prunePreview.length} backup(s) según la política de retención? Los puntos protegidos no se tocan.`
      )
    ) {
      setPrunePreview([]);
      return;
    }
    const ok = await post('/api/v1/backup/prune', { ids: prunePreview.map((p) => p.id) });
    setPrunePreview([]);
    if (ok) setFeedback('Backups limpiados según política ✓');
  };

  const handleRestore = async (): Promise<void> => {
    if (!restoreTarget) return;
    if (
      !window.confirm(
        `Restaurar el backup ${restoreTarget.id}? Se sobrescribirán los archivos canónicos (se crea un snapshot pre-restore).`
      )
    ) {
      setRestoreTarget(null);
      return;
    }
    const ok = await post(`/api/v1/backup/${restoreTarget.id}/restore`);
    setRestoreTarget(null);
    if (ok) setFeedback('Backup restaurado ✓');
  };

  const pending = changeSets.filter((cs) => cs.status === 'draft' || cs.status === 'validated');
  const publishedIds = new Set(
    changeSets.filter((cs) => cs.status === 'published').map((cs) => cs.id)
  );

  return (
    <main role="main" aria-label="Cambios y recuperación">
      <h1>Cambios y recuperación</h1>

      {error && (
        <p role="alert" style={{ color: '#c62828' }}>
          {error}
        </p>
      )}
      {feedback && (
        <p role="status" style={{ color: '#2e7d32' }}>
          {feedback}
        </p>
      )}
      {loading && <p>Cargando…</p>}

      <section aria-label="Change sets pendientes" style={{ marginBottom: '1.5rem' }}>
        <h2>Change sets pendientes ({pending.length})</h2>
        {pending.length === 0 && <p style={{ color: '#6c757d' }}>No hay change sets pendientes.</p>}
        {pending.length > 0 && (
          <table
            aria-label="Change sets pendientes"
            style={{ width: '100%', borderCollapse: 'collapse' }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Id</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Estado</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Operaciones</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((cs) => (
                <tr key={cs.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    <code>{cs.id}</code>
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>{cs.status}</td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    {cs.product_ops
                      .map((op) => `${ACTION_LABEL[op.action] ?? op.action}`)
                      .join(', ') || '—'}
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    {cs.status === 'draft' && (
                      <button onClick={() => void handleValidate(cs.id)} disabled={busy}>
                        Validar
                      </button>
                    )}{' '}
                    {cs.status === 'validated' && (
                      <button onClick={() => handleApply(cs.id)} disabled={busy}>
                        Aplicar
                      </button>
                    )}{' '}
                    <button onClick={() => handleDiscard(cs.id)} disabled={busy}>
                      Descartar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Backups" style={{ marginBottom: '1.5rem' }}>
        <h2>Backups ({backups.length})</h2>
        {backups.length === 0 && <p style={{ color: '#6c757d' }}>No hay backups.</p>}
        {backups.length > 0 && (
          <>
            <table aria-label="Backups" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Id</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Clase</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Archivos</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Protección</th>
                  <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.25rem 0.5rem' }}>
                      <code>{b.id}</code>
                      {b.cleanup_warning && (
                        <div style={{ fontSize: '0.8rem', color: '#e65100' }}>
                          {b.cleanup_warning}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{b.backup_class ?? '—'}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>
                      {b.files
                        .map((f) => `${f.name} (${Math.round(f.size / 1024)} KB)`)
                        .join(', ') || '—'}
                    </td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{b.protected_reason ?? '—'}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>
                      <button onClick={() => setRestoreTarget(b)} disabled={busy}>
                        Restaurar…
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
            >
              <button onClick={() => void loadPrunePreview()} disabled={busy}>
                Previsualizar limpieza
              </button>
              {prunePreview.length > 0 && (
                <span style={{ fontSize: '0.9rem', color: '#6c757d' }}>
                  {prunePreview.length} elegibles:{' '}
                  {prunePreview
                    .slice(0, 3)
                    .map((p) => p.id)
                    .join(', ')}
                  {prunePreview.length > 3 ? '…' : ''}
                </span>
              )}
              {prunePreview.length > 0 && (
                <button onClick={() => void handlePrune()} disabled={busy}>
                  Confirmar limpieza
                </button>
              )}
            </div>
          </>
        )}

        {restoreTarget && (
          <div
            role="dialog"
            aria-label="Confirmar restauración de backup"
            style={{
              border: '1px solid var(--color-border)',
              padding: '1rem',
              marginTop: '1rem',
            }}
          >
            <p>
              Restaurar <strong>{restoreTarget.id}</strong> ({restoreTarget.files.join(', ')}):
              sobrescribirá los archivos canónicos.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => void handleRestore()} disabled={busy} autoFocus>
                Confirmar restauración
              </button>
              <button onClick={() => setRestoreTarget(null)} disabled={busy}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      <section aria-label="Historial" style={{ marginBottom: '1.5rem' }}>
        <h2>Historial</h2>
        <p style={{ color: '#6c757d', marginBottom: '1rem' }}>
          {String(summary.products_with_history ?? 0)} de {String(summary.total_products ?? 0)}{' '}
          productos con historial
        </p>
        {entries.length > 0 && (
          <table
            aria-label="Historial de cambios"
            style={{ width: '100%', borderCollapse: 'collapse' }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Producto</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Campo</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Antes → Después</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Fecha</th>
                <th style={{ textAlign: 'right', padding: '0.25rem 0.5rem' }}>Rev</th>
                <th style={{ padding: '0.25rem 0.5rem' }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.25rem 0.5rem' }}>{e.product_name}</td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    <code>{e.field}</code>
                    {e.change_set_id && (
                      <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                        <code>{e.change_set_id}</code>
                        {publishedIds.has(e.change_set_id) && (
                          <button
                            onClick={() => handleUndo(e.change_set_id!)}
                            disabled={busy}
                            style={{
                              marginLeft: '0.5rem',
                              padding: '0.1rem 0.4rem',
                              fontSize: '0.8rem',
                            }}
                          >
                            Deshacer
                          </button>
                        )}
                        {publishedIds.has(e.change_set_id) && e.source_change_set_id && (
                          <button
                            onClick={() => handleRedo(e.change_set_id!)}
                            disabled={busy}
                            style={{
                              marginLeft: '0.5rem',
                              padding: '0.1rem 0.4rem',
                              fontSize: '0.8rem',
                            }}
                          >
                            Rehacer
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}>
                    {e.before !== undefined || e.after !== undefined ? (
                      <>
                        <code>{JSON.stringify(e.before)}</code> →{' '}
                        <code>{JSON.stringify(e.after)}</code>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>{e.timestamp ?? '—'}</td>
                  <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>{e.rev ?? '—'}</td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    {e.product_id && e.rev !== undefined && e.before !== undefined && (
                      <button
                        onClick={() => {
                          if (e.product_id && e.rev !== undefined)
                            void handleRevert(e.product_id, e.rev, e.product_name);
                        }}
                        disabled={busy}
                        style={{ padding: '0.1rem 0.4rem', fontSize: '0.8rem' }}
                        title={`Restaurar "${e.product_name}" al estado de la rev ${e.rev}`}
                      >
                        Revertir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!loading && entries.length === 0 && <p>No hay entradas de historial.</p>}
      </section>
    </main>
  );
}
