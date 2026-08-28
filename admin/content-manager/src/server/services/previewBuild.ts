import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { Job, JobRunner } from './jobRunner.ts';

export interface PreviewBuildResult {
  success: boolean;
  distPath: string;
  duration_ms: number;
  output?: string;
  error?: string;
}

export interface PreviewBuildOptions {
  onProgress?: (percent: number) => void;
  isCancelled?: () => boolean;
  timeoutMs?: number;
}

const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export function getPreviewDistRoot(repoRoot: string): string {
  return resolve(repoRoot, 'astro-poc', 'dist');
}

export async function runPreviewBuild(
  repoRoot: string,
  options: PreviewBuildOptions = {}
): Promise<PreviewBuildResult> {
  const start = Date.now();
  const distPath = getPreviewDistRoot(repoRoot);
  const timeoutMs = options.timeoutMs ?? 120_000;

  return new Promise<PreviewBuildResult>((resolvePromise) => {
    const child = spawn(NPM_CMD, ['run', 'build:fast'], {
      cwd: repoRoot,
      shell: false,
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = '';
    let stderrTruncated = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      if (stdout.length > 100_000) stdout = stdout.slice(-100_000);
      stdoutTruncated = stdout.slice(-2000);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      if (stderr.length > 100_000) stderr = stderr.slice(-100_000);
      stderrTruncated = stderr.slice(-2000);
    });

    let settled = false;
    const settle = (result: PreviewBuildResult): void => {
      if (settled) return;
      settled = true;
      clearInterval(cancelPoll);
      resolvePromise(result);
    };

    const cancelPoll = setInterval(() => {
      if (options.isCancelled?.()) {
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore kill errors
        }
        settle({
          success: false,
          distPath,
          duration_ms: Date.now() - start,
          error: 'Cancelled by operator',
        });
      }
    }, 200);

    child.on('close', (code) => {
      if (settled) return;
      clearInterval(cancelPoll);
      const duration = Date.now() - start;
      if (options.isCancelled?.()) {
        settle({
          success: false,
          distPath,
          duration_ms: duration,
          error: 'Cancelled by operator',
        });
        return;
      }
      if (code === 0) {
        options.onProgress?.(100);
        settle({
          success: true,
          distPath,
          duration_ms: duration,
          output: stdoutTruncated || stdout.slice(-2000),
        });
      } else {
        const msg = (
          stderrTruncated ||
          stderr ||
          stdoutTruncated ||
          `build:fast exited ${String(code)}`
        ).slice(0, 2000);
        settle({
          success: false,
          distPath,
          duration_ms: duration,
          error: msg,
        });
      }
    });

    child.on('error', (err) => {
      clearInterval(cancelPoll);
      settle({
        success: false,
        distPath,
        duration_ms: Date.now() - start,
        error: (err as Error).message.slice(0, 2000),
      });
    });
  });
}

export function schedulePreviewBuild(
  jobRunner: JobRunner,
  repoRoot: string
): Job<PreviewBuildResult> {
  // job is assigned synchronously via schedule(); the definite-assignment
  // assertion is required because jobFn closes over it — this matches the
  // publication route pattern. eslint's prefer-const cannot see the reassignment.
  // eslint-disable-next-line prefer-const
  let job!: Job<PreviewBuildResult>;

  const jobFn = async (): Promise<PreviewBuildResult> => {
    const jobId = job.id;
    jobRunner.updateProgress(jobId, 5);

    const checkCancel = (): void => {
      if (job.cancelRequested) throw new Error('Preview build cancelled by operator');
    };

    checkCancel();

    const result = await runPreviewBuild(repoRoot, {
      onProgress: (p) => {
        const mapped = Math.min(95, Math.max(5, p));
        jobRunner.updateProgress(jobId, mapped);
      },
      isCancelled: () => job.cancelRequested,
    });

    checkCancel();

    if (!result.success) {
      throw new Error(result.error ?? 'build:fast failed');
    }

    jobRunner.updateProgress(jobId, 100);
    return result;
  };

  job = jobRunner.schedule<PreviewBuildResult>('build-preview', jobFn);
  return job;
}
