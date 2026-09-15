// Plan 197: instance-level (system) slice of ContentManagerClient —
// diagnostics plus the repo/dev endpoints that are not a domain of their own.
// Pure functions over the shared ApiRequestFn core — no call-site churn:
// the facade keeps every signature, these just move.
import type { ApiRequestFn } from './requestCore.ts';

export interface DiagnosticsReport {
  timestamp: string;
  nodeVersion: string;
  repoRoot: string;
  checks: Array<{
    name: string;
    status: 'ok' | 'warn' | 'error';
    message: string;
    remediation?: string;
  }>;
  summary: { ok: number; warn: number; error: number };
  recoveryNeeded: boolean;
}

export async function getDiagnostics(request: ApiRequestFn): Promise<DiagnosticsReport> {
  return request<DiagnosticsReport>('/diagnostics');
}
