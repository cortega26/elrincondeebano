import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitResult {
  success: boolean;
  output?: string;
  error?: string;
  exitCode: number;
}

// Plan 181: decode git's C-style porcelain quoting (default core.quotepath
// quotes every non-ASCII path as "..." with \" \\ \t \n and \NNN octal UTF-8
// bytes). Exported for unit tests.
export function unquotePorcelainPath(quoted: string): string {
  if (quoted.length < 2 || !quoted.startsWith('"') || !quoted.endsWith('"')) {
    return quoted;
  }
  const inner = quoted.slice(1, -1);
  let out = '';
  let pendingBytes: number[] = [];
  const flushBytes = (): void => {
    if (pendingBytes.length > 0) {
      out += Buffer.from(pendingBytes).toString('utf8');
      pendingBytes = [];
    }
  };
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch !== '\\' || i + 1 >= inner.length) {
      flushBytes();
      out += ch;
      continue;
    }
    const next = inner[i + 1];
    if (next === '"' || next === '\\') {
      flushBytes();
      out += next;
      i += 1;
    } else if (next === 't') {
      flushBytes();
      out += '\t';
      i += 1;
    } else if (next === 'n') {
      flushBytes();
      out += '\n';
      i += 1;
    } else if (
      /[0-7]/.test(next) &&
      /[0-7]/.test(inner[i + 2] ?? '') &&
      /[0-7]/.test(inner[i + 3] ?? '')
    ) {
      pendingBytes.push(parseInt(inner.substring(i + 1, i + 4), 8));
      i += 3;
    } else {
      flushBytes();
      out += next;
      i += 1;
    }
  }
  flushBytes();
  return out;
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
    'pull',
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

  // Fixed-argument `git pull --rebase` (plan 061): the browser can never pass
  // remote/branch arguments; bounded by the execFile timeout (30s).
  async pull(): Promise<GitResult> {
    return this.run(['pull', '--rebase']);
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
    const parsed =
      statusResult.success && statusResult.output
        ? parsePorcelainStatus(statusResult.output)
        : { staged: [], unstaged: [], untracked: [], ahead: 0, behind: 0, hasConflicts: false };

    return {
      branch,
      dirty: parsed.staged.length > 0 || parsed.unstaged.length > 0 || parsed.untracked.length > 0,
      ...parsed,
    };
  }
}

// Plan 181: pure porcelain parser, extracted from getChanges for
// deterministic tests (a live-git round trip proved flaky under full-suite
// parallelism — reason undetermined after bisection; the recorded-sample
// tests below pin the same behavior byte-for-byte). Exported for tests.
export interface PorcelainStatus {
  staged: string[];
  unstaged: string[];
  untracked: string[];
  ahead: number;
  behind: number;
  hasConflicts: boolean;
}

export function parsePorcelainStatus(output: string): PorcelainStatus {
  const staged: string[] = [];
  const unstaged: string[] = [];
  const untracked: string[] = [];

  let ahead = 0;
  let behind = 0;
  let hasConflicts = false;

  for (const line of output.split('\n')) {
    if (!line) continue;
    if (line.startsWith('##')) {
      const aheadMatch = line.match(/ahead (\d+)/);
      if (aheadMatch?.[1]) ahead = Number.parseInt(aheadMatch[1], 10);
      const behindMatch = line.match(/behind (\d+)/);
      if (behindMatch?.[1]) behind = Number.parseInt(behindMatch[1], 10);
      continue;
    }
    if (!line.trim()) continue;
    const status = line.substring(0, 2);
    // Quotepath-aware: stock git quotes non-ASCII paths (core.quotepath),
    // which must be decoded before ownedPaths prefix-matching.
    const file = unquotePorcelainPath(line.substring(3).trim());
    if (/^[ADU][ADU] /.test(line)) hasConflicts = true;
    if (status.includes('M') || status.includes('A') || status.includes('D')) {
      if (status[0] !== ' ') staged.push(file);
      if (status[1] !== ' ') unstaged.push(file);
    }
    if (status.includes('?')) untracked.push(file);
  }

  return { staged, unstaged, untracked, ahead, behind, hasConflicts };
}
