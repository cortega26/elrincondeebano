import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { ContentManagerClient } from "../../api/client.ts";
import { fetchWithCredential } from "../credentialStore.ts";

interface FieldConflict {
  field: string;
  base_value: unknown;
  local_value: unknown;
  server_value: unknown;
  resolution: string;
  manual_value?: unknown;
  resolved_at?: string;
}

interface Conflict {
  id: string;
  status: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string;
  base_revision: number;
  local_snapshot: Record<string, unknown>;
  server_snapshot: Record<string, unknown>;
  fields: FieldConflict[];
  created_at: string;
  updated_at: string;
  retry_count: number;
  last_error?: string;
  resolution_audit: Array<{ timestamp: string; field: string; from: string; to: string }>;
}

interface ConflictsSummary {
  unresolved: number;
  retrying: number;
  resolved: number;
  failed: number;
  total: number;
}

interface ConflictsResponse {
  conflicts: Conflict[];
  summary: ConflictsSummary;
}

const client = new ContentManagerClient();

function statusBadge(status: string): React.ReactElement {
  const colors: Record<string, string> = {
    unresolved: "#fff3e0",
    resolving: "#e3f2fd",
    resolved: "#e8f5e9",
    retrying: "#f3e5f5",
    failed: "#ffebee",
  };
  return (
    <span style={{ background: colors[status] ?? "#eee", padding: "0.1rem 0.4rem", borderRadius: "3px", fontSize: "0.8rem", fontWeight: "bold" }}>
      {status}
    </span>
  );
}

export function ConflictsPage(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<ConflictsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fieldResolutions, setFieldResolutions] = useState<Record<string, { resolution: string; manualValue: string }>>({});

  const activeTab = searchParams.get("status") ?? "";

  const fetchConflicts = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl = "http://127.0.0.1:3000";
      const searchParams = new URLSearchParams();
      if (activeTab) searchParams.set("status", activeTab);
      const qs = searchParams.toString();
      const url = `${baseUrl}/api/v1/conflicts${qs ? `?${qs}` : ""}`;
      const response = await fetch(url, { headers: { "Content-Type": "application/json" } });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`);
      }
      const result = (await response.json()) as ConflictsResponse;
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConflicts();
  }, [activeTab]);

  function setTab(status: string): void {
    const next = new URLSearchParams(searchParams);
    if (status) {
      next.set("status", status);
    } else {
      next.delete("status");
    }
    setSearchParams(next);
  }

  function getFieldResolution(conflictId: string, field: string): { resolution: string; manualValue: string } {
    return fieldResolutions[`${conflictId}::${field}`] ?? { resolution: "", manualValue: "" };
  }

  function setFieldResolution(conflictId: string, field: string, value: { resolution: string; manualValue: string }): void {
    setFieldResolutions((prev) => ({ ...prev, [`${conflictId}::${field}`]: value }));
  }

  async function handleResolveField(conflictId: string, field: string): Promise<void> {
    const fr = getFieldResolution(conflictId, field);
    if (!fr.resolution) {
      setError("Selecciona una resolución (local, server o manual)");
      return;
    }

    try {
      const baseUrl = "http://127.0.0.1:3000";
      const body: Record<string, unknown> = { field, resolution: fr.resolution };
      if (fr.resolution === "manual" && fr.manualValue) {
        body.manual_value = fr.manualValue;
      }
      const response = await fetchWithCredential(`${baseUrl}/api/v1/conflicts/${encodeURIComponent(conflictId)}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error((errBody as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`);
      }

      setFeedback(`Campo "${field}" resuelto`);
      void fetchConflicts();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRetry(conflictId: string): Promise<void> {
    try {
      const baseUrl = "http://127.0.0.1:3000";
      const response = await fetchWithCredential(`${baseUrl}/api/v1/conflicts/${encodeURIComponent(conflictId)}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error((errBody as { error?: { message?: string } }).error?.message ?? `HTTP ${response.status}`);
      }

      setFeedback("Conflicto reenviado para reintento");
      void fetchConflicts();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (error) {
    return (
      <main role="main" aria-label="Conflictos">
        <h1>Conflictos</h1>
        <p role="alert">{error}</p>
        <button onClick={() => { setError(null); void fetchConflicts(); }}>Reintentar</button>
      </main>
    );
  }

  const tabs = [
    { key: "", label: "Todos" },
    { key: "unresolved", label: "Sin resolver" },
    { key: "resolved", label: "Resueltos" },
    { key: "failed", label: "Fallidos" },
  ];

  return (
    <main role="main" aria-label="Conflictos">
      <h1>Centro de Conflictos</h1>

      {feedback && (
        <div role="status" aria-live="polite" style={{ background: "#e8f5e9", padding: "0.5rem", marginBottom: "0.5rem", borderRadius: "var(--radius)" }}>
          {feedback}
          <button onClick={() => setFeedback(null)} style={{ marginLeft: "0.5rem", background: "none", border: "none", cursor: "pointer" }} aria-label="Cerrar">×</button>
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          {[
            { key: "unresolved", label: "Sin resolver", color: "#fff3e0" },
            { key: "retrying", label: "Reintentando", color: "#f3e5f5" },
            { key: "resolved", label: "Resueltos", color: "#e8f5e9" },
            { key: "failed", label: "Fallidos", color: "#ffebee" },
          ].map((s) => (
            <div key={s.key} style={{ background: s.color, padding: "0.75rem 1rem", borderRadius: "var(--radius)", minWidth: "120px", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{data.summary[s.key as keyof ConflictsSummary]}</div>
              <div style={{ fontSize: "0.8rem" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <nav aria-label="Filtros de conflictos" style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "0.25rem 0.75rem",
              background: activeTab === t.key ? "var(--color-primary, #1976d2)" : "transparent",
              color: activeTab === t.key ? "white" : "inherit",
              border: "1px solid var(--color-border, #ccc)",
              borderRadius: "var(--radius)",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading && <p aria-live="polite">Cargando…</p>}

      {!loading && data && data.conflicts.length === 0 && <p>No hay conflictos.</p>}

      {/* Conflict list */}
      {!loading && data && data.conflicts.map((conflict) => (
        <section
          key={conflict.id}
          style={{
            border: "1px solid var(--color-border, #ccc)",
            borderRadius: "var(--radius)",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <strong>{conflict.entity_name ?? conflict.entity_id}</strong>
            <span style={{ background: "#e3f2fd", padding: "0.1rem 0.4rem", borderRadius: "3px", fontSize: "0.75rem" }}>
              {conflict.entity_type}
            </span>
            {statusBadge(conflict.status)}
            <span style={{ fontSize: "0.75rem", color: "#6c757d" }}>
              rev {conflict.base_revision}
            </span>
            <span style={{ fontSize: "0.75rem", color: "#6c757d" }}>
              {new Date(conflict.created_at).toLocaleString("es-MX")}
            </span>
          </div>

          {/* Retry count and error */}
          {conflict.retry_count > 0 && (
            <div style={{ fontSize: "0.8rem", color: "#6c757d", marginBottom: "0.5rem" }}>
              Reintentos: {conflict.retry_count}
              {conflict.last_error && (
                <div style={{ color: "#c62828", marginTop: "0.25rem" }}>
                  Último error: {conflict.last_error}
                </div>
              )}
            </div>
          )}

          {/* Field conflicts table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--color-border, #ccc)" }}>
                <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Campo</th>
                <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Base</th>
                <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Local</th>
                <th style={{ textAlign: "left", padding: "0.25rem 0.5rem" }}>Servidor</th>
                <th style={{ textAlign: "center", padding: "0.25rem 0.5rem" }}>Resolución</th>
              </tr>
            </thead>
            <tbody>
              {conflict.fields.map((fc) => {
                const fr = getFieldResolution(conflict.id, fc.field);
                const isResolved = fc.resolution !== "unresolved";
                return (
                  <tr key={fc.field} style={{ borderBottom: "1px solid #eee", background: isResolved ? "#f9fbe7" : "transparent" }}>
                    <td style={{ padding: "0.25rem 0.5rem", fontWeight: "bold" }}>{fc.field}</td>
                    <td style={{ padding: "0.25rem 0.5rem", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <code>{JSON.stringify(fc.base_value)}</code>
                    </td>
                    <td style={{ padding: "0.25rem 0.5rem", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <code>{JSON.stringify(fc.local_value)}</code>
                    </td>
                    <td style={{ padding: "0.25rem 0.5rem", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <code>{JSON.stringify(fc.server_value)}</code>
                    </td>
                    <td style={{ padding: "0.25rem 0.5rem", textAlign: "center" }}>
                      {isResolved ? (
                        <span style={{ background: "#c8e6c9", padding: "0.1rem 0.3rem", borderRadius: "3px", fontSize: "0.75rem" }}>
                          {fc.resolution}{fc.manual_value !== undefined ? `: ${JSON.stringify(fc.manual_value)}` : ""}
                        </span>
                      ) : conflict.status !== "resolved" ? (
                        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                          <select
                            value={fr.resolution}
                            onChange={(e) => setFieldResolution(conflict.id, fc.field, { ...fr, resolution: e.target.value })}
                            style={{ padding: "0.15rem", fontSize: "0.8rem" }}
                            aria-label={`Resolución para ${fc.field}`}
                          >
                            <option value="">—</option>
                            <option value="local">Usar local</option>
                            <option value="server">Usar servidor</option>
                            <option value="manual">Manual</option>
                          </select>
                          {fr.resolution === "manual" && (
                            <input
                              type="text"
                              value={fr.manualValue}
                              onChange={(e) => setFieldResolution(conflict.id, fc.field, { ...fr, manualValue: e.target.value })}
                              placeholder="Valor manual"
                              style={{ padding: "0.15rem", fontSize: "0.8rem", width: "80px" }}
                            />
                          )}
                          <button
                            onClick={() => { void handleResolveField(conflict.id, fc.field); }}
                            style={{ padding: "0.1rem 0.4rem", fontSize: "0.75rem" }}
                          >
                            Resolver
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Retry button for failed */}
          {conflict.status === "failed" && (
            <div style={{ marginTop: "0.75rem" }}>
              <button onClick={() => { void handleRetry(conflict.id); }}>
                Reintentar sincronización
              </button>
            </div>
          )}

          {/* Resolution audit trail */}
          {conflict.resolution_audit.length > 0 && (
            <details style={{ marginTop: "0.75rem", fontSize: "0.8rem" }}>
              <summary>Historial de resoluciones ({conflict.resolution_audit.length})</summary>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #eee" }}>
                    <th style={{ textAlign: "left", padding: "0.15rem 0.5rem" }}>Timestamp</th>
                    <th style={{ textAlign: "left", padding: "0.15rem 0.5rem" }}>Campo</th>
                    <th style={{ textAlign: "left", padding: "0.15rem 0.5rem" }}>De</th>
                    <th style={{ textAlign: "left", padding: "0.15rem 0.5rem" }}>A</th>
                  </tr>
                </thead>
                <tbody>
                  {conflict.resolution_audit.map((entry, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: "0.15rem 0.5rem" }}>{new Date(entry.timestamp).toLocaleString("es-MX")}</td>
                      <td style={{ padding: "0.15rem 0.5rem" }}>{entry.field}</td>
                      <td style={{ padding: "0.15rem 0.5rem" }}>{entry.from}</td>
                      <td style={{ padding: "0.15rem 0.5rem" }}>{entry.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </section>
      ))}
    </main>
  );
}
