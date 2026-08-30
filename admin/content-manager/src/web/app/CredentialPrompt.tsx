import { useState } from 'react';
import { getCredentialValue, setCredential, isLoopbackHostname } from './credentialStore.ts';
import { useDialog } from './components/useDialog.ts';

// The launch credential is operator-supplied (plan 071): ADMIN_CREDENTIAL env
// or the startup log. This prompt is the UI entry point for it; mutations
// without a credential are rejected by the server with 401.
// Loopback bypass (2026-08-29, plan 071 still loopback-only): no prompt when
// accessed from 127.0.0.1 / localhost / ::1 — single-operator local PC.
function isLoopbackWindow(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return isLoopbackHostname(window.location.hostname);
  } catch {
    return false;
  }
}

export function CredentialPrompt(): React.ReactElement {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(() => isLoopbackWindow() || Boolean(getCredentialValue()));
  const isOpen = !saved;
  const dialogRef = useDialog(isOpen, () => setSaved(true));

  function save(): void {
    setCredential(value);
    setValue('');
    setSaved(Boolean(getCredentialValue()));
  }

  if (!saved) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="credential-prompt-title"
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: '1.5rem',
            width: 'min(420px, 90vw)',
          }}
        >
          <h2 id="credential-prompt-title" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            Launch credential
          </h2>
          <p style={{ marginBottom: '0.75rem' }}>
            Write operations require the launch credential shown in the server startup log (or set
            via ADMIN_CREDENTIAL).
          </p>
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
            placeholder="x-admin-credential"
            autoFocus
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              marginBottom: '0.75rem',
            }}
          />
          <button
            type="button"
            onClick={save}
            style={{
              background: 'var(--color-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setSaved(false)}
      title="Cambiar la credencial de lanzamiento"
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        zIndex: 900,
        background: 'transparent',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius)',
        color: 'var(--color-text)',
        padding: '0.35rem 0.75rem',
        cursor: 'pointer',
        fontSize: '0.8rem',
      }}
    >
      Credencial ✓
    </button>
  );
}
