import { useState, useEffect, useRef } from 'react';
import { ContentManagerClient } from '../../api/client.ts';

// One-click store sync: validate + commit + push to main (CI deploys to
// production from there). The server re-runs preflight and schema validations
// inside the job, so no separate Preview click is needed — a failure surfaces
// inline with the server's message. Push defaults ON: that is the point of
// the button (commit-only is still available on the Publication page).

const client = new ContentManagerClient();

interface DirtyState {
  dirty: boolean;
  changedPaths: number;
  hasConflicts: boolean;
  behind: number;
}

async function loadDirtyState(): Promise<DirtyState> {
  const status = await client.getGitStatus();
  return {
    dirty: status.dirty,
    changedPaths: status.staged.length + status.unstaged.length + status.untracked.length,
    hasConflicts: status.hasConflicts,
    behind: status.behind,
  };
}

interface JobSnapshot {
  status: string;
  progress: number;
  result?: unknown;
  error?: string;
}

// Polls one job to a terminal state. Resolves with the final snapshot;
// rejects only when the status itself cannot be read.
function waitForJob(
  jobId: string,
  onProgress: (percent: number) => void
): { done: Promise<JobSnapshot | null>; cancel: () => void } {
  let timer: ReturnType<typeof setInterval> | null = null;
  const cancel = (): void => {
    if (timer !== null) clearInterval(timer);
  };
  const done = new Promise<JobSnapshot | null>((resolve, reject) => {
    timer = setInterval(() => {
      void client
        .getJob(jobId)
        .then((job) => {
          onProgress(job.progress);
          if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
            cancel();
            resolve({
              status: job.status,
              progress: job.progress,
              result: job.result,
              error: job.error,
            });
          }
        })
        .catch((err: unknown) => {
          cancel();
          reject(err);
        });
    }, 1000);
  });
  return { done, cancel };
}

// Pure outcome formatting — keeps the hook under the function-size limit.
function describeJobOutcome(snapshot: JobSnapshot | null): {
  feedback: string | null;
  error: string | null;
} {
  if (snapshot === null) {
    return { feedback: null, error: 'No se pudo consultar el estado de la sincronización' };
  }
  if (snapshot.status === 'completed') {
    const result = (snapshot.result ?? {}) as { commit?: string; pushed?: boolean };
    const short = typeof result.commit === 'string' ? result.commit.slice(0, 7) : '—';
    return {
      feedback: `Tienda sincronizada ✓ (${short}${result.pushed ? ' · push ✓' : ''}). El sitio se actualiza en unos minutos.`,
      error: null,
    };
  }
  if (snapshot.status === 'cancelled') {
    return { feedback: 'Sincronización cancelada', error: null };
  }
  return { feedback: null, error: snapshot.error ?? 'La sincronización falló' };
}

function confirmSync(state: DirtyState): boolean {
  const behindNote =
    state.behind > 0
      ? `\n\nAtención: el repositorio local está ${state.behind} commit(s) detrás del remoto; el push puede fallar y pedir un pull primero.`
      : '';
  return window.confirm(
    `Sincronizar la tienda ahora?\n\nSe validará el catálogo, se hará commit de ${state.changedPaths} archivo(s) y push a main; el sitio se actualiza solo.${behindNote}`
  );
}

function useSyncStore(
  setFeedback: (v: string | null) => void,
  setOpError: (v: string | null) => void
): {
  dirty: DirtyState | null;
  running: boolean;
  progress: number | null;
  sync: () => Promise<void>;
} {
  const [dirty, setDirty] = useState<DirtyState | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const cancelPollRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    void loadDirtyState()
      .then(setDirty)
      .catch(() => {
        // Status is best-effort; the button stays usable and publish reports
        // the real error.
      });
    return () => {
      cancelPollRef.current?.();
    };
  }, []);

  function finishJob(snapshot: JobSnapshot | null): void {
    cancelPollRef.current?.();
    cancelPollRef.current = null;
    setRunning(false);
    setProgress(null);
    const outcome = describeJobOutcome(snapshot);
    if (outcome.feedback !== null) {
      setFeedback(outcome.feedback);
      if (snapshot?.status === 'completed') {
        void loadDirtyState()
          .then(setDirty)
          .catch(() => {});
      }
    } else if (outcome.error !== null) {
      setOpError(outcome.error);
    }
  }

  async function sync(): Promise<void> {
    if (running) return;
    setOpError(null);
    setFeedback(null);

    let state = dirty;
    if (!state) {
      try {
        state = await loadDirtyState();
        setDirty(state);
      } catch (err) {
        setOpError((err as Error).message);
        return;
      }
    }

    if (state.hasConflicts) {
      setOpError('Hay conflictos de Git sin resolver. Resuélvelos en la página Publicación.');
      return;
    }
    if (!state.dirty) {
      setFeedback('Tienda al día ✓ — no hay cambios para sincronizar.');
      return;
    }
    if (!confirmSync(state)) return;

    setRunning(true);
    setProgress(0);
    try {
      // commitMessage undefined → server default (catálogo: N productos [ts]).
      const result = await client.publish(undefined, true);
      const { done, cancel } = waitForJob(result.job_id, setProgress);
      cancelPollRef.current = cancel;
      try {
        finishJob(await done);
      } catch {
        finishJob(null);
      }
    } catch (err) {
      setRunning(false);
      setProgress(null);
      setOpError((err as Error).message);
    }
  }

  return { dirty, running, progress, sync };
}

export function SyncStoreButton({
  setFeedback,
  setOpError,
}: {
  setFeedback: (v: string | null) => void;
  setOpError: (v: string | null) => void;
}): React.ReactElement {
  const { dirty, running, progress, sync } = useSyncStore(setFeedback, setOpError);

  let label = 'Sincronizar tienda';
  let background = '#2e7d32';
  let color = '#fff';
  let cursor = 'pointer';
  if (running) {
    label = progress === null ? 'Sincronizando…' : `Sincronizando… ${progress}%`;
    cursor = 'wait';
  } else if (dirty !== null && !dirty.dirty) {
    label = 'Tienda al día ✓';
    background = '#e8f5e9';
    color = '#2e7d32';
  } else if (dirty !== null) {
    label = `Sincronizar tienda (${dirty.changedPaths})`;
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
      <button
        onClick={() => void sync()}
        disabled={running}
        aria-label="Sincronizar tienda: validar, commit y push"
        title="Valida el catálogo y lo publica (commit + push a main)"
        style={{
          padding: '0.4rem 1rem',
          fontWeight: 700,
          fontSize: '0.95rem',
          background,
          color,
          border: '1px solid #2e7d32',
          borderRadius: 'var(--radius)',
          cursor,
        }}
      >
        {label}
      </button>
      {running ? (
        <progress
          value={progress ?? 0}
          max={100}
          style={{ width: '6rem' }}
          aria-label="Progreso de sincronización"
        />
      ) : null}
    </span>
  );
}
