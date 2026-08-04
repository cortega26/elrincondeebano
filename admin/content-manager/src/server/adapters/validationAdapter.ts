import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProductRepository } from '../repositories/productRepository.ts';
import { CategoryRepository } from '../repositories/categoryRepository.ts';
import { StorefrontRepository } from '../repositories/storefrontRepository.ts';

const execFileAsync = promisify(execFile);

export interface ValidationResult {
  step: string;
  status: 'pass' | 'fail' | 'skipped';
  output?: string;
  error?: string;
  duration_ms: number;
}

export class ValidationAdapter {
  validateProducts(repoRoot: string): ValidationResult {
    const start = Date.now();
    try {
      const repo = new ProductRepository({ repoRoot });
      const issues = repo.validate();
      const errors = issues.filter((i) => i.severity === 'error');
      return {
        step: 'products-schema',
        status: errors.length === 0 ? 'pass' : 'fail',
        output: `${issues.length} issues (${errors.length} errors)`,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        step: 'products-schema',
        status: 'fail',
        error: (err as Error).message,
        duration_ms: Date.now() - start,
      };
    }
  }

  validateCategories(repoRoot: string): ValidationResult {
    const start = Date.now();
    try {
      const repo = new CategoryRepository({ repoRoot });
      const issues = repo.validate();
      const errors = issues.filter((i) => i.severity === 'error');
      return {
        step: 'categories-schema',
        status: errors.length === 0 ? 'pass' : 'fail',
        output: `${issues.length} issues (${errors.length} errors)`,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        step: 'categories-schema',
        status: 'fail',
        error: (err as Error).message,
        duration_ms: Date.now() - start,
      };
    }
  }

  validateStorefront(repoRoot: string): ValidationResult {
    const start = Date.now();
    try {
      const repo = new StorefrontRepository({ repoRoot });
      const issues = repo.validate();
      const errors = issues.filter((i) => i.severity === 'error');
      return {
        step: 'storefront-schema',
        status: errors.length === 0 ? 'pass' : 'fail',
        output: `${issues.length} issues (${errors.length} errors)`,
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      return {
        step: 'storefront-schema',
        status: 'fail',
        error: (err as Error).message,
        duration_ms: Date.now() - start,
      };
    }
  }

  async runTool(repoRoot: string, command: string, args: string[]): Promise<ValidationResult> {
    const start = Date.now();
    try {
      const { stdout } = await execFileAsync(command, args, {
        cwd: repoRoot,
        encoding: 'utf-8',
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
        shell: false,
      });
      return {
        step: command,
        status: 'pass',
        output: stdout.trim().slice(0, 500),
        duration_ms: Date.now() - start,
      };
    } catch (err) {
      const execErr = err as { stderr?: string; code?: number; message?: string };
      return {
        step: command,
        status: 'fail',
        error: execErr.stderr ?? execErr.message,
        duration_ms: Date.now() - start,
      };
    }
  }

  async runAllValidations(repoRoot: string): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    results.push(this.validateProducts(repoRoot));
    results.push(this.validateCategories(repoRoot));
    results.push(this.validateStorefront(repoRoot));

    const packageJson = resolve(repoRoot, 'package.json');
    if (existsSync(packageJson)) {
      results.push(await this.runTool(repoRoot, 'npm', ['run', 'categories:sync']));
      results.push(await this.runTool(repoRoot, 'npm', ['run', 'images:avif']));
    }

    return results;
  }
}
