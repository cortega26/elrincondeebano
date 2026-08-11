import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

// Allowlisted media jobs (plan 063 step 3): fixed arguments only, never
// browser-controlled flags. Diagnostics are captured and sanitized; the
// canonical assets are never touched until apply.

export type MediaJobInput = {
  repoRoot: string;
  stagingRoot: string;
  sourcePath: string; // absolute path of the staged file
  targetRelativePath: string; // canonical relative path under assets/images/
  categorySlug?: string;
  onProgress: (percent: number) => void;
  isCancelled: () => boolean;
};

export interface MediaJobResult {
  ok: boolean;
  outputs: string[]; // staged output paths (absolute)
  // Plan 089: 'canonical' jobs (category OG) write the canonical asset at
  // run time — apply verifies the canonical state instead of promoting
  // staged files. Default is 'staged'.
  output_kind?: 'staged' | 'canonical';
  error?: string;
}

async function hashFile(path: string): Promise<string> {
  const data = await readFileSync(path);
  return createHash('sha256').update(data).digest('hex');
}

async function writeOutput(
  input: MediaJobInput,
  fileName: string,
  buffer: Buffer
): Promise<string> {
  const outPath = resolve(input.stagingRoot, `${input.sourcePath.split('/').pop()}-${fileName}`);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, buffer, { flush: true });
  return outPath;
}

export async function runAvifJob(input: MediaJobInput): Promise<MediaJobResult> {
  if (!existsSync(input.sourcePath)) {
    return { ok: false, outputs: [], error: `Staged file not found: ${input.sourcePath}` };
  }
  input.onProgress(10);
  if (input.isCancelled()) return { ok: false, outputs: [], error: 'Cancelled' };

  try {
    const buffer = await sharp(input.sourcePath).avif({ quality: 60 }).toBuffer();
    if (input.isCancelled()) return { ok: false, outputs: [], error: 'Cancelled' };
    input.onProgress(80);

    const output = await writeOutput(input, 'avif.avif', buffer);
    const expected = input.targetRelativePath.replace(/\.(png|jpe?g|webp)$/i, '.avif');
    input.onProgress(95);
    void expected;
    return { ok: true, outputs: [output] };
  } catch (err) {
    return { ok: false, outputs: [], error: `AVIF conversion failed: ${(err as Error).message}` };
  }
}

export async function runVariantJob(input: MediaJobInput): Promise<MediaJobResult> {
  if (!existsSync(input.sourcePath)) {
    return { ok: false, outputs: [], error: `Staged file not found: ${input.sourcePath}` };
  }
  input.onProgress(10);
  if (input.isCancelled()) return { ok: false, outputs: [], error: 'Cancelled' };

  try {
    const buffer = await sharp(input.sourcePath)
      .resize({ width: 480, withoutEnlargement: true })
      .toBuffer();
    if (input.isCancelled()) return { ok: false, outputs: [], error: 'Cancelled' };
    input.onProgress(80);

    const output = await writeOutput(input, 'variant-480.webp', buffer);
    input.onProgress(95);
    return { ok: true, outputs: [output] };
  } catch (err) {
    return {
      ok: false,
      outputs: [],
      error: `Variant generation failed: ${(err as Error).message}`,
    };
  }
}

function runOgTool(
  repoRoot: string,
  slug: string,
  operation: 'generate' | 'delete'
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolvePromise) => {
    const args =
      operation === 'generate'
        ? ['-m', 'tools.category_og', '--one', slug, '--repo-root', repoRoot]
        : ['-m', 'tools.category_og', '--delete', slug, '--repo-root', repoRoot];
    const child = spawn('python3', args, {
      cwd: repoRoot,
      shell: false,
      timeout: 60_000,
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolvePromise({ code: code ?? -1, stderr: stderr.slice(0, 2000) });
    });
    child.on('error', (err) => {
      resolvePromise({ code: -1, stderr: err.message });
    });
  });
}

export async function runCategoryOgJob(
  input: MediaJobInput,
  operation: 'generate' | 'delete'
): Promise<MediaJobResult> {
  const slug = input.categorySlug;
  if (!slug) {
    return { ok: false, outputs: [], error: 'Missing category slug for OG job' };
  }
  input.onProgress(20);
  const { code, stderr } = await runOgTool(input.repoRoot, slug, operation);
  if (input.isCancelled()) return { ok: false, outputs: [], error: 'Cancelled' };
  input.onProgress(90);
  if (code !== 0) {
    return {
      ok: false,
      outputs: [],
      error: `Category OG ${operation} failed (exit ${code}): ${sanitizeDiagnostics(stderr)}`,
    };
  }
  return {
    ok: true,
    output_kind: 'canonical',
    outputs: [resolve(input.repoRoot, 'assets', 'images', 'og', 'categories', `${slug}.png`)],
  };
}

function sanitizeDiagnostics(text: string): string {
  return text
    .replace(/\/[^\s]*\/home[^\s]*/g, '[REDACTED]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[REDACTED]')
    .trim()
    .slice(0, 500);
}

export { hashFile };
