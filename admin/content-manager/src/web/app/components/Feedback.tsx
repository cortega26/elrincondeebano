import { useEffect, useState } from 'react';

// Plan 093: one feedback pattern for the whole app — dismissible box,
// role="status" for success/info, role="alert" for errors; successes
// auto-dismiss after 5s, errors persist until dismissed.

export type FeedbackKind = 'success' | 'error' | 'info';

export function Feedback({
  kind,
  children,
  onDismiss,
}: {
  kind: FeedbackKind;
  children: string;
  onDismiss?: () => void;
}): React.ReactElement | null {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (kind !== 'success') return;
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, 5000);
    return () => clearTimeout(timer);
  }, [kind, onDismiss]);

  if (!visible) return null;

  const style: React.CSSProperties = {
    padding: '0.35rem 0.5rem',
    marginBottom: '0.5rem',
    borderRadius: 'var(--radius)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.5rem',
    fontSize: '0.85rem',
    background: kind === 'error' ? '#fdecea' : kind === 'success' ? '#e8f5e9' : '#e3f2fd',
    color: kind === 'error' ? '#b71c1c' : kind === 'success' ? '#1b5e20' : '#0d47a1',
  };

  return (
    <div style={style} role={kind === 'error' ? 'alert' : 'status'}>
      <span>{children}</span>
      <button
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
        style={{ padding: '0.05rem 0.4rem', fontSize: '0.8rem' }}
        aria-label="Descartar aviso"
      >
        ×
      </button>
    </div>
  );
}
