// Plan 197: publications/jobs (+ git ops used by the publication flow)
// domain slice of ContentManagerClient.
// Pure functions over the shared ApiRequestFn core — no call-site churn:
// the facade keeps every signature, these just move.
import type { ApiRequestFn } from './requestCore.ts';

export interface GitStatusResponse {
  branch: string;
  dirty: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  hasConflicts: boolean;
}

export interface PublicationPreviewResponse {
  preflight: {
    ok: boolean;
    checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message: string }>;
    errors: string[];
    warnings: string[];
    validations?: {
      products: { ok: boolean; errors: string[] };
      categories: { ok: boolean; errors: string[] };
      storefront: { ok: boolean; errors: string[] };
    };
  };
  git: GitStatusResponse;
}

export interface JobResponse {
  id: string;
  type: string;
  status: string;
  progress: number;
  started_at?: string;
  completed_at?: string;
  scheduled_at?: string;
  result?: unknown;
  error?: string;
}

export async function getGitStatus(request: ApiRequestFn): Promise<GitStatusResponse> {
  return request<GitStatusResponse>('/git/status');
}

export async function gitPull(request: ApiRequestFn): Promise<{ job_id: string; status: string }> {
  return request<{ job_id: string; status: string }>('/git/pull', { method: 'POST' });
}

export async function previewPublication(
  request: ApiRequestFn
): Promise<PublicationPreviewResponse> {
  return request<PublicationPreviewResponse>('/publications/preview', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function publish(
  request: ApiRequestFn,
  commitMessage?: string,
  push?: boolean,
  publishAt?: string
): Promise<{ job_id: string; status: string }> {
  const payload: Record<string, unknown> = { commitMessage, push };
  if (publishAt) payload.publishAt = publishAt;
  return request<{ job_id: string; status: string }>('/publications', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getJob(request: ApiRequestFn, id: string): Promise<JobResponse> {
  return request<JobResponse>(`/jobs/${encodeURIComponent(id)}`);
}

export async function listJobs(request: ApiRequestFn): Promise<{ jobs: JobResponse[] }> {
  return request<{ jobs: JobResponse[] }>('/jobs');
}

export async function cancelJob(request: ApiRequestFn, id: string): Promise<JobResponse> {
  return request<JobResponse>(`/jobs/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  });
}

export interface PreviewBuildTrigger {
  job_id: string;
  status: string;
}

// Plan 211: trigger a flag-gated preview build (POST /preview/build is a
// mutation-class route — requires the launch credential like other writes).
export async function triggerPreviewBuild(request: ApiRequestFn): Promise<PreviewBuildTrigger> {
  return request<PreviewBuildTrigger>('/preview/build', { method: 'POST' });
}
