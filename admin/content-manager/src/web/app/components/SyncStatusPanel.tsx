import { fetchWithCredential } from '../credentialStore.ts';

// Plan 094: sync status + config panel extracted from ProductsPage.

export interface SyncStatus {
  enabled: boolean;
  api_base: string;
  paused: boolean;
  token_configured: boolean;
  queue: { pending: number; error: number; total: number };
  last_push: { ok: boolean; error?: string } | null;
}

export function SyncStatusPanel({
  syncStatus,
  showSyncConfig,
  setShowSyncConfig,
  syncConfig,
  setSyncConfig,
  setFeedback,
  setOpError,
}: {
  syncStatus: SyncStatus;
  showSyncConfig: boolean;
  setShowSyncConfig: (v: boolean) => void;
  syncConfig: { enabled: boolean; api_base: string; api_token: string };
  setSyncConfig: (v: { enabled: boolean; api_base: string; api_token: string }) => void;
  setFeedback: (v: string | null) => void;
  setOpError: (v: string | null) => void;
}): React.ReactElement {
  return (
    <div
      style={{
        background: '#e3f2fd',
        padding: '0.35rem 0.5rem',
        marginBottom: '0.5rem',
        borderRadius: 'var(--radius)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.85rem',
        flexWrap: 'wrap',
      }}
    >
      <span>
        Sync: {syncStatus.enabled ? 'Conectado' : 'Desactivado'} —{' '}
        {syncStatus.api_base || 'No configurado'}
        {syncStatus.enabled && (
          <>
            {' '}
            · cola {syncStatus.queue.pending} pend / {syncStatus.queue.error} err /{' '}
            {syncStatus.queue.total} total
            {syncStatus.paused ? ' · PAUSADO' : ''}
            {syncStatus.last_push?.ok === false && (
              <span style={{ color: '#c62828' }}> · push falló</span>
            )}
          </>
        )}
      </span>
      <button
        onClick={() => {
          setShowSyncConfig(!showSyncConfig);
        }}
        style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem' }}
      >
        Configurar
      </button>
      {syncStatus.enabled && (
        <>
          <button
            onClick={() => {
              const action = syncStatus.paused ? 'resume' : 'pause';
              fetchWithCredential(`/api/v1/sync/${action}`, { method: 'POST' })
                .then(() => window.location.reload())
                .catch(() => setFeedback('Error al cambiar pausa'));
            }}
            style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem' }}
          >
            {syncStatus.paused ? 'Reanudar' : 'Pausar'}
          </button>
          <button
            onClick={() => {
              fetchWithCredential('/api/v1/sync/now', { method: 'POST' })
                .then((r) => r.json())
                .then((d) => setFeedback((d as { message?: string }).message ?? 'Sync solicitado'))
                .catch(() => setFeedback('Error al sincronizar'));
            }}
            style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem' }}
          >
            Sincronizar ahora
          </button>
        </>
      )}
      {showSyncConfig && (
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            flexBasis: '100%',
            marginTop: '0.25rem',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.8rem',
            }}
          >
            <input
              type="checkbox"
              checked={syncConfig.enabled}
              onChange={(e) => setSyncConfig({ ...syncConfig, enabled: e.target.checked })}
            />
            Habilitado
          </label>
          <input
            type="text"
            value={syncConfig.api_base}
            onChange={(e) => setSyncConfig({ ...syncConfig, api_base: e.target.value })}
            placeholder="api_base"
            style={{ padding: '0.15rem 0.25rem', fontSize: '0.8rem', width: '150px' }}
          />
          <span style={{ fontSize: '0.75rem', color: '#6c757d' }}>
            Token: {syncStatus.token_configured ? 'configurado (env)' : 'falta SYNC_API_TOKEN'}
          </span>
          <button
            onClick={async () => {
              try {
                // The token is never sent over the API (plan 057/064):
                // it comes only from SYNC_API_TOKEN.
                const { api_token: _ignored, ...configBody } = syncConfig;
                void _ignored;
                const res = await fetchWithCredential('/api/v1/sync/config', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(configBody),
                });
                if (!res.ok) {
                  const err = await res.json().catch(() => ({}));
                  throw new Error(
                    (err as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
                  );
                }
                await res.json();
                setShowSyncConfig(false);
                setFeedback('Configuración de sync guardada ✓');
                window.setTimeout(() => window.location.reload(), 300);
              } catch (err) {
                setOpError((err as Error).message);
              }
            }}
            style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem' }}
          >
            Guardar
          </button>
          <button
            onClick={() => setShowSyncConfig(false)}
            style={{ padding: '0.15rem 0.5rem', fontSize: '0.8rem' }}
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}
