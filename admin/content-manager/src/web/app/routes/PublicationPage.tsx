import { useState, useEffect, useRef, useCallback } from 'react';
import { ContentManagerClient } from '../../api/client.ts';
import type {
  GitStatusResponse,
  PublicationPreviewResponse,
  JobResponse,
} from '../../api/client.ts';

const client = new ContentManagerClient();

export function PublicationPage(): React.ReactElement {
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [preview, setPreview] = useState<PublicationPreviewResponse | null>(null);
  const [commitMessage, setCommitMessage] = useState('chore(catalog): publication');
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const [publishAt, setPublishAt] = useState('');
  const [job, setJob] = useState<JobResponse | null>(null);
  const [pendingJobs, setPendingJobs] = useState<JobResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pullStatus, setPullStatus] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    (jobId: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const result = await client.getJob(jobId);
          setJob(result);
          if (
            result.status === 'completed' ||
            result.status === 'failed' ||
            result.status === 'cancelled'
          ) {
            stopPolling();
          }
        } catch {
          stopPolling();
        }
      }, 1000);
    },
    [stopPolling]
  );

  const refreshPending = useCallback(async (): Promise<void> => {
    try {
      const res = await client.listJobs();
      setPendingJobs(res.jobs);
    } catch {
      // Ignore — pending list is best-effort.
    }
  }, []);

  useEffect(() => {
    // Plan 097: git status refreshes every 30s while the page is open.
    const timer = setInterval(() => void refreshGitStatus().catch(() => {}), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void refreshPending();
    const timer = setInterval(() => void refreshPending().catch(() => {}), 5_000);
    return () => clearInterval(timer);
  }, [refreshPending]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  async function handlePreview(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const result = await client.previewPublication();
      setGitStatus(result.git);
      setPreview(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish(push: boolean): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const iso = publishAt ? new Date(publishAt).toISOString() : undefined;
      const result = await client.publish(commitMessage, push, iso);
      setJob({
        id: result.job_id,
        type: 'publication',
        status: 'scheduled',
        progress: 0,
        scheduled_at: iso,
      });
      pollJob(result.job_id);
      void refreshPending();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(): Promise<void> {
    if (!job) return;
    setError(null);
    try {
      const result = await client.cancelJob(job.id);
      setJob(result);
      stopPolling();
      void refreshPending();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCancelPending(id: string): Promise<void> {
    setError(null);
    try {
      await client.cancelJob(id);
      void refreshPending();
      if (job?.id === id) {
        try {
          const updated = await client.getJob(id);
          setJob(updated);
        } catch {
          // ignore
        }
        stopPolling();
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function refreshGitStatus(): Promise<void> {
    setError(null);
    try {
      const result = await client.getGitStatus();
      setGitStatus(result);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleGitPull(): Promise<void> {
    setError(null);
    setPullStatus(null);
    try {
      const result = await client.gitPull();
      const jobId = result.job_id;
      const poll = async (): Promise<void> => {
        try {
          const jobState = await client.getJob(jobId);
          if (jobState.status === 'completed') {
            const output = (jobState.result as { output?: string } | undefined)?.output ?? '';
            setPullStatus(output ? `Pull ✓ — ${output}` : 'Pull ✓');
            await refreshGitStatus();
          } else if (jobState.status === 'failed') {
            const msg =
              (jobState.result as { error?: string } | undefined)?.error ?? 'Pull fallido';
            setPullStatus(msg);
          } else if (jobState.status === 'cancelled') {
            setPullStatus('Pull cancelado');
          } else {
            window.setTimeout(() => void poll(), 800);
          }
        } catch {
          setPullStatus('Error consultando el pull');
        }
      };
      void poll();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <main role="main" aria-label="Publicación">
      <h1>Publicación</h1>

      {error && (
        <div
          role="alert"
          style={{
            background: '#ffebee',
            padding: '0.5rem',
            marginBottom: '0.5rem',
            borderRadius: 'var(--radius)',
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {/* Git status */}
      <section
        aria-label="Estado de Git"
        style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <h2 style={{ margin: 0 }}>Git Status</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => void handleGitPull()} style={{ padding: '0.25rem 0.75rem' }}>
              Git pull (rebase)
            </button>
            <button onClick={() => void refreshGitStatus()} style={{ padding: '0.25rem 0.75rem' }}>
              Refresh
            </button>
          </div>
        </div>
        {pullStatus && (
          <p
            role="status"
            style={{ fontSize: '0.9rem', color: pullStatus.includes('✓') ? '#2e7d32' : '#e65100' }}
          >
            {pullStatus}
          </p>
        )}
        {gitStatus ? (
          <div>
            <p>
              <strong>Branch:</strong> {gitStatus.branch}{' '}
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.1rem 0.5rem',
                  borderRadius: 'var(--radius)',
                  fontSize: '0.85rem',
                  background: gitStatus.dirty ? '#fff3e0' : '#e8f5e9',
                  color: gitStatus.dirty ? '#e65100' : '#2e7d32',
                }}
              >
                {gitStatus.dirty ? 'Dirty' : 'Clean'}
              </span>
              {gitStatus.hasConflicts && (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '0.1rem 0.5rem',
                    borderRadius: 'var(--radius)',
                    fontSize: '0.85rem',
                    background: '#ffebee',
                    color: '#c62828',
                    marginLeft: '0.5rem',
                  }}
                >
                  Conflicts
                </span>
              )}
            </p>
            {gitStatus.staged.length > 0 && (
              <div>
                <strong>Staged ({gitStatus.staged.length}):</strong>
                <ul style={{ margin: '0.25rem 0', paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                  {gitStatus.staged.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {gitStatus.unstaged.length > 0 && (
              <div>
                <strong>Unstaged ({gitStatus.unstaged.length}):</strong>
                <ul style={{ margin: '0.25rem 0', paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                  {gitStatus.unstaged.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {gitStatus.untracked.length > 0 && (
              <div>
                <strong>Untracked ({gitStatus.untracked.length}):</strong>
                <ul style={{ margin: '0.25rem 0', paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                  {gitStatus.untracked.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {gitStatus.staged.length === 0 &&
              gitStatus.unstaged.length === 0 &&
              gitStatus.untracked.length === 0 && (
                <p style={{ color: '#6c757d', fontSize: '0.9rem' }}>No pending changes</p>
              )}
          </div>
        ) : (
          <p style={{ color: '#6c757d' }}>
            Haz clic en "Vista previa" o "Actualizar" para cargar el estado de Git.
          </p>
        )}
      </section>

      {/* Preflight */}
      {preview && (
        <section
          aria-label="Preflight"
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
          }}
        >
          <h2 style={{ margin: '0 0 0.5rem' }}>Preflight Checks</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {preview.preflight.checks.map((check) => (
              <li
                key={check.name}
                style={{
                  display: 'flex',
                  gap: '0.5rem',
                  alignItems: 'center',
                  padding: '0.25rem 0',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: '1.2rem',
                    height: '1.2rem',
                    borderRadius: '50%',
                    background:
                      check.status === 'pass'
                        ? '#4caf50'
                        : check.status === 'warn'
                          ? '#ff9800'
                          : '#f44336',
                    color: '#fff',
                    textAlign: 'center',
                    lineHeight: '1.2rem',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                  }}
                >
                  {check.status === 'pass' ? '✓' : check.status === 'warn' ? '!' : '✗'}
                </span>
                <span>
                  {check.name}: {check.message}
                </span>
              </li>
            ))}
            {preview.preflight.validations && (
              <>
                <li
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.25rem 0',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '1.2rem',
                      height: '1.2rem',
                      borderRadius: '50%',
                      background: preview.preflight.validations.products.ok ? '#4caf50' : '#f44336',
                      color: '#fff',
                      textAlign: 'center',
                      lineHeight: '1.2rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    {preview.preflight.validations.products.ok ? '✓' : '✗'}
                  </span>
                  <span>
                    products-schema:{' '}
                    {preview.preflight.validations.products.ok
                      ? 'Valid'
                      : preview.preflight.validations.products.errors.join('; ')}
                  </span>
                </li>
                <li
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.25rem 0',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '1.2rem',
                      height: '1.2rem',
                      borderRadius: '50%',
                      background: preview.preflight.validations.categories.ok
                        ? '#4caf50'
                        : '#f44336',
                      color: '#fff',
                      textAlign: 'center',
                      lineHeight: '1.2rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    {preview.preflight.validations.categories.ok ? '✓' : '✗'}
                  </span>
                  <span>
                    category-schema:{' '}
                    {preview.preflight.validations.categories.ok
                      ? 'Valid'
                      : preview.preflight.validations.categories.errors.join('; ')}
                  </span>
                </li>
                <li
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.25rem 0',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '1.2rem',
                      height: '1.2rem',
                      borderRadius: '50%',
                      background: preview.preflight.validations.storefront.ok
                        ? '#4caf50'
                        : '#f44336',
                      color: '#fff',
                      textAlign: 'center',
                      lineHeight: '1.2rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                    }}
                  >
                    {preview.preflight.validations.storefront.ok ? '✓' : '✗'}
                  </span>
                  <span>
                    storefront-schema:{' '}
                    {preview.preflight.validations.storefront.ok
                      ? 'Valid'
                      : preview.preflight.validations.storefront.errors.join('; ')}
                  </span>
                </li>
              </>
            )}
          </ul>
        </section>
      )}

      {/* Publication actions */}
      <section
        aria-label="Acciones de publicación"
        style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem' }}>Publicar cambios</h2>
        <div style={{ marginBottom: '0.5rem' }}>
          <label>
            Commit message:
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              style={{ width: '100%', padding: '0.25rem 0.5rem', marginTop: '0.25rem' }}
            />
          </label>
        </div>
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.75rem' }}
        >
          <input
            type="checkbox"
            checked={pushAfterCommit}
            onChange={(e) => setPushAfterCommit(e.target.checked)}
          />
          Push after commit
        </label>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            Programar para (opcional):
            <input
              type="datetime-local"
              aria-label="Fecha programada"
              value={publishAt}
              onChange={(e) => setPublishAt(e.target.value)}
              style={{ width: '100%', padding: '0.25rem 0.5rem', marginTop: '0.25rem' }}
            />
          </label>
          <p style={{ fontSize: '0.85rem', color: '#6c757d', margin: '0.25rem 0 0' }}>
            Vacío = publicación inmediata. Con fecha, la publicación quedará programada y pendiente
            hasta esa hora.
          </p>
          <p
            role="note"
            style={{
              fontSize: '0.85rem',
              color: '#856404',
              background: '#fff3cd',
              border: '1px solid #ffeaa7',
              padding: '0.4rem 0.6rem',
              borderRadius: 'var(--radius)',
              marginTop: '0.5rem',
            }}
          >
            Nota: el admin debe estar corriendo a la hora programada — las publicaciones programadas
            son en memoria y no sobreviven a un reinicio.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => void handlePreview()}
            disabled={loading}
            style={{ padding: '0.25rem 0.75rem' }}
          >
            Preview
          </button>
          <button
            onClick={() => void handlePublish(false)}
            disabled={loading || job?.status === 'running'}
            style={{ padding: '0.25rem 0.75rem' }}
          >
            Commit
          </button>
          <button
            onClick={() => void handlePublish(true)}
            disabled={loading || job?.status === 'running'}
            style={{ padding: '0.25rem 0.75rem' }}
          >
            Commit + Push
          </button>
          {job &&
            (job.status === 'running' ||
              job.status === 'pending' ||
              job.status === 'scheduled') && (
              <button
                onClick={() => void handleCancel()}
                style={{
                  padding: '0.25rem 0.75rem',
                  background: '#ff5252',
                  color: '#fff',
                  border: 'none',
                }}
              >
                Cancel
              </button>
            )}
        </div>
      </section>

      {/* Pending / scheduled jobs */}
      <section
        aria-label="Publicaciones programadas"
        style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <h2 style={{ margin: 0 }}>Programadas / pendientes</h2>
          <button onClick={() => void refreshPending()} style={{ padding: '0.25rem 0.75rem' }}>
            Actualizar
          </button>
        </div>
        {pendingJobs.length === 0 ? (
          <p style={{ color: '#6c757d', fontSize: '0.9rem' }}>No hay publicaciones programadas.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {pendingJobs.map((pj) => (
              <li
                key={pj.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0',
                  borderBottom: '1px solid var(--color-border)',
                  fontSize: '0.9rem',
                }}
              >
                <span>
                  <strong>{pj.id}</strong> · {pj.type} · {pj.status}
                  {pj.scheduled_at && (
                    <> · programada para {new Date(pj.scheduled_at).toLocaleString()}</>
                  )}
                  {pj.started_at && <> · inicio {new Date(pj.started_at).toLocaleString()}</>}
                  {' · '}
                  {pj.progress}%
                </span>
                {(pj.status === 'pending' || pj.status === 'running') && (
                  <button
                    onClick={() => void handleCancelPending(pj.id)}
                    style={{
                      padding: '0.2rem 0.6rem',
                      background: '#ff5252',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.85rem',
                    }}
                    aria-label={`Cancelar ${pj.id}`}
                  >
                    Cancelar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Job progress */}
      {job && (
        <section
          aria-label="Progreso del job"
          style={{
            padding: '0.75rem',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
          }}
        >
          <h2 style={{ margin: '0 0 0.5rem' }}>Job: {job.id}</h2>
          <p>
            <strong>Status:</strong> {job.status}
            {job.started_at && <> · Started: {new Date(job.started_at).toLocaleTimeString()}</>}
            {job.completed_at && (
              <> · Completed: {new Date(job.completed_at).toLocaleTimeString()}</>
            )}
          </p>
          <div style={{ margin: '0.5rem 0' }}>
            <progress
              value={job.progress}
              max={100}
              style={{ width: '100%', height: '1.25rem' }}
              aria-label={`Progress: ${job.progress}%`}
            />
            <span style={{ fontSize: '0.85rem', marginLeft: '0.5rem' }}>{job.progress}%</span>
          </div>
          {job.status === 'completed' && job.result != null && (
            <div
              style={{ background: '#e8f5e9', padding: '0.5rem', borderRadius: 'var(--radius)' }}
            >
              <strong>Success:</strong> Commit{' '}
              <code>
                {typeof job.result === 'object' && job.result !== null && 'commit' in job.result
                  ? String((job.result as Record<string, unknown>).commit)
                  : '—'}
              </code>
              {typeof job.result === 'object' &&
              job.result !== null &&
              'pushed' in job.result &&
              (job.result as Record<string, unknown>).pushed
                ? ' · Pushed'
                : null}
            </div>
          )}
          {job.status === 'failed' && (
            <div
              style={{ background: '#ffebee', padding: '0.5rem', borderRadius: 'var(--radius)' }}
            >
              <strong>Error:</strong> {job.error ?? 'Unknown error'}
            </div>
          )}
          {job.status === 'cancelled' && (
            <div
              style={{ background: '#fff3e0', padding: '0.5rem', borderRadius: 'var(--radius)' }}
            >
              Job cancelled.
            </div>
          )}
        </section>
      )}
    </main>
  );
}
