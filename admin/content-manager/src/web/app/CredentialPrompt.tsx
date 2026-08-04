import { useState } from 'react';
import { getCredentialValue, setCredential } from './credentialStore.ts';

// The launch credential is operator-supplied (plan 071): ADMIN_CREDENTIAL env
// or the startup log. This prompt is the UI entry point for it; mutations
// without a credential are rejected by the server with 401.
export function CredentialPrompt(): React.ReactElement {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(Boolean(getCredentialValue()));

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
          style={{
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            padding: '1.5rem',
            width: 'min(420px, 90vw)',
          }}
        >
          <h2 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Launch credential</h2>
          <p style={{ marginBottom: '0.75rem' }}>
            Write operations require the launch credential shown in the server
            startup log (or set via ADMIN_CREDENTIAL).
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
