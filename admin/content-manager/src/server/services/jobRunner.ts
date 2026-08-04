export interface Job<T = unknown> {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  started_at?: string;
  completed_at?: string;
  error?: string;
  result?: T;
  cancelRequested: boolean;
}

export class JobRunner {
  private jobs = new Map<string, Job>();
  private queue: Array<{ job: Job; fn: () => Promise<unknown> }> = [];
  private processing = false;
  private shutdownRequested = false;

  schedule<T>(type: string, fn: () => Promise<T>): Job<T> {
    const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const job: Job<T> = {
      id,
      type,
      status: 'pending',
      progress: 0,
      cancelRequested: false,
    };

    this.jobs.set(id, job);
    this.queue.push({ job, fn: async () => fn() });

    // Start processing asynchronously to avoid blocking the caller
    setImmediate(() => {
      void this.processQueue();
    });

    return job;
  }

  getJob<T>(id: string): Job<T> | undefined {
    return this.jobs.get(id) as Job<T> | undefined;
  }

  cancelJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status === 'completed' || job.status === 'cancelled') return false;

    job.cancelRequested = true;

    if (job.status === 'pending') {
      job.status = 'cancelled';
      job.completed_at = new Date().toISOString();
    }

    return true;
  }

  updateProgress(id: string, progress: number): void {
    const job = this.jobs.get(id);
    if (job) {
      job.progress = Math.max(0, Math.min(100, progress));
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.shutdownRequested) return;
    if (this.queue.length === 0) return;

    this.processing = true;
    const next = this.queue.shift()!;
    const { job, fn } = next;

    try {
      if (job.cancelRequested) {
        job.status = 'cancelled';
        job.completed_at = new Date().toISOString();
        this.processing = false;
        setImmediate(() => {
          void this.processQueue();
        });
        return;
      }

      job.status = 'running';
      job.started_at = new Date().toISOString();

      const result = await fn();

      if (job.cancelRequested) {
        job.status = 'cancelled';
      } else {
        job.status = 'completed';
        job.result = result;
      }
    } catch (err) {
      if (job.cancelRequested) {
        job.status = 'cancelled';
      } else {
        job.status = 'failed';
        job.error = (err as Error).message;
      }
    } finally {
      job.completed_at = new Date().toISOString();
      job.progress = 100;
      this.processing = false;
      // Process next job asynchronously
      setImmediate(() => {
        void this.processQueue();
      });
    }
  }

  async shutdown(): Promise<void> {
    this.shutdownRequested = true;

    for (const [, job] of this.jobs) {
      if (job.status === 'pending') {
        job.status = 'cancelled';
        job.completed_at = new Date().toISOString();
      } else if (job.status === 'running') {
        job.cancelRequested = true;
      }
    }
  }

  getPendingCount(): number {
    return this.queue.length;
  }
}
