// Plan 127 F3.3: proactive recovery banner — when the recovery journal has
// pending writes, the operator sees a global alert linking to Diagnostics.
// Polls the diagnostics endpoint (30s) so a crash-recovery state surfaces
// without visiting the diagnostics page.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

interface DiagnosticsReport {
  recoveryNeeded?: boolean;
}

export function RecoveryBanner(): React.ReactElement | null {
  const [recoveryNeeded, setRecoveryNeeded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async (): Promise<void> => {
      try {
        const res = await fetch('/api/v1/diagnostics');
        const report = (await res.json()) as DiagnosticsReport;
        if (!cancelled) setRecoveryNeeded(report.recoveryNeeded === true);
      } catch {
        // Diagnostics unavailable — keep the previous state.
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  if (!recoveryNeeded) {
    return null;
  }

  return (
    <p
      role="alert"
      style={{
        margin: 0,
        padding: '0.5rem 1rem',
        background: '#fff3cd',
        borderBottom: '1px solid #ffc107',
        fontSize: '0.9rem',
      }}
    >
      ⚠ Hay una escritura sin recuperar en el catálogo. Revisa{' '}
      <Link to="/diagnostics" style={{ fontWeight: 700 }}>
        Diagnósticos
      </Link>{' '}
      antes de seguir editando.
    </p>
  );
}
