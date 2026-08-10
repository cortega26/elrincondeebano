import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode: number;
}

export class GitAdapter {
  private readonly repoRoot: string;
  private readonly allowedCommands = new Set([
    'status',
    'branch',
    'diff',
    'add',
    'commit',
    'push',
    'log',
  ]);

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  private async run(args: string[]): Promise<GitResult> {
    const command = args[0];
    if (!command || !this.allowedCommands.has(command)) {
      return { success: false, error: `Command "${command}" not in allowed list`, exitCode: -1 };
    }

    try {
      const { stdout } = await execFileAsync('git', args, {
        cwd: this.repoRoot,
        encoding: 'utf-8',
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
        shell: false,
      });
      return { success: true, output: stdout.trim(), exitCode: 0 };
    } catch (err) {
      const execErr = err as { stderr?: string; stdout?: string; code?: number; message?: string };
      return {
        success: false,
        error: execErr.stderr ?? execErr.message ?? 'Unknown error',
        exitCode: execErr.code ?? -1,
      };
    }
  }

  async status(): Promise<GitResult> {
    return this.run(['status', '--porcelain', '--branch']);
  }

  async branch(): Promise<GitResult> {
    return this.run(['branch', '--show-current']);
  }

  async diff(staged = false): Promise<GitResult> {
    return this.run(staged ? ['diff', '--staged', '--stat'] : ['diff', '--stat']);
  }

  async stage(paths: string[]): Promise<GitResult> {
    if (paths.length === 0) {
      return { success: false, error: 'stage requires at least one path', exitCode: -1 };
    }
    return this.run(['add', '--', ...paths]);
  }

  async commit(message: string): Promise<GitResult> {
    return this.run(['commit', '-m', message]);
  }

  async commitWithPaths(paths: string[], message: string): Promise<GitResult> {
    if (paths.length === 0) {
      return {
        success: false,
        error:
          'commitWithPaths requires at least one path (empty pathspec would commit all staged files)',
        exitCode: -1,
      };
    }
    return this.run(['commit', '-m', message, '--', ...paths]);
  }

  async push(remote = 'origin', branch?: string): Promise<GitResult> {
    const args = ['push'];
    if (remote) args.push(remote);
    if (branch) args.push(branch);
    return this.run(args);
  }

  async log(count = 5): Promise<GitResult> {
    return this.run(['log', `-${count}`, '--oneline']);
  }

  async getChanges(): Promise<{
    branch: string;
    dirty: boolean;
    staged: string[];
    unstaged: string[];
    untracked: string[];
    ahead: number;
    behind: number;
    hasConflicts: boolean;
  }> {
    const statusResult = await this.status();
    const branchResult = await this.branch();

    const branch = branchResult.success ? (branchResult.output ?? '').trim() : '?';

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    if (statusResult.success && statusResult.output) {
      for (const line of statusResult.output.split('\n')) {
        if (!line.trim()) continue;
        const status = line.substring(0, 2);
        const file = line.substring(3).trim();
        if (status.includes('M') || status.includes('A') || status.includes('D')) {
          if (status[0] !== ' ') staged.push(file);
          if (status[1] !== ' ') unstaged.push(file);
        }
        if (status.includes('?')) untracked.push(file);
      }
    }

    return {
      branch,
      dirty: staged.length > 0 || unstaged.length > 0 || untracked.length > 0,
      staged,
      unstaged,
      untracked,
      ahead: 0,
      behind: 0,
      hasConflicts:
        (statusResult.output ?? '').includes('UU') || (statusResult.output ?? '').includes('DD'),
    };
  }
}
