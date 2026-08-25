import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ContentManagerClient } from '../../api/client.ts';

const client = new ContentManagerClient();

interface DiagnosticCheck {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  remediation?: string;
}

interface DoctorReport {
  timestamp: string;
  nodeVersion: string;
  repoRoot: string;
  checks: DiagnosticCheck[];
  summary: { ok: number; warn: number; error: number };
  recoveryNeeded: boolean;
}

const STATUS_LABEL: Record<DiagnosticCheck['status'], string> = {
  ok: '✓',
  warn: '⚠',
  error: '✗',
};

export function DiagnosticsPage(): React.ReactElement {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.getDiagnostics();
      setReport(data as unknown as DoctorReport);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const downloadReport = (): void => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diagnostics.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main role="main" aria-label="Diagnóstico">
      <nav
        aria-label="Navegación principal"
        style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}
      >
        <Link to="/products">Productos</Link>
        <Link to="/publish">Publicación</Link>
        <Link to="/diagnostics" aria-current="page">
          Diagnóstico
        </Link>
      </nav>

      <h1>Diagnóstico del Content Manager</h1>

      {error && (
        <p role="alert" style={{ color: '#c62828' }}>
          {error}
        </p>
      )}

      {report && (
        <>
          <p>
            <strong>Resumen:</strong> {report.summary.ok} ok, {report.summary.warn} advertencias,{' '}
            {report.summary.error} errores
            {report.recoveryNeeded && ' — recuperación pendiente'}
            <span style={{ color: '#6c757d', fontSize: '0.85rem' }}>
              {' '}
              (repo: {report.repoRoot}, Node {report.nodeVersion})
            </span>
          </p>
          <button onClick={downloadReport} style={{ padding: '0.25rem 0.75rem' }}>
            Descargar informe
          </button>

          <ul
            role="list"
            aria-label="Chequeos de diagnóstico"
            style={{ listStyle: 'none', padding: 0 }}
          >
            {report.checks.map((check) => (
              <li
                key={check.name}
                style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius)',
                  padding: '0.5rem 0.75rem',
                  marginBottom: '0.5rem',
                }}
              >
                <p style={{ margin: 0 }}>
                  <span
                    style={{
                      color:
                        check.status === 'ok'
                          ? '#2e7d32'
                          : check.status === 'warn'
                            ? '#e65100'
                            : '#c62828',
                    }}
                    aria-hidden="true"
                  >
                    {STATUS_LABEL[check.status]}{' '}
                  </span>
                  <strong>{check.name}:</strong> {check.message}
                </p>
                {check.remediation && (
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.9rem', color: '#6c757d' }}>
                    Remedio: {check.remediation}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p style={{ fontSize: '0.85rem', color: '#6c757d' }}>
            El informe se redacta antes de salir del servidor: sin rutas absolutas, credenciales ni
            valores tipo token.
          </p>
        </>
      )}
      {loading && <p>Cargando…</p>}
    </main>
  );
}
