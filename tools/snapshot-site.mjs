import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'reports', 'snapshots');
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

/**
 * Sanitize a human provided tag so it can be used inside file names.
 * @param {string} rawTag - The user provided tag to sanitise.
 * @returns {string} a safe, lowercased identifier suitable for filenames.
 */
export function sanitizeTag(rawTag) {
  if (typeof rawTag !== 'string') {
    throw new TypeError('tag must be a string');
  }

  const trimmed = rawTag.trim();
  if (!trimmed) {
    throw new Error('tag cannot be empty');
  }

  const normalised = trimmed.normalize('NFKD');
  const cleaned = normalised
    .replace(/[^\p{Letter}\p{Number}\s_-]+/gu, '')
    .replace(/\s+/g, '-');
  const collapsed = cleaned.replace(/-+/g, '-').replace(/_+/g, '_');
  const result = collapsed.toLowerCase().replace(/^[-_]+|[-_]+$/g, '');

  if (!result) {
    throw new Error('tag sanitisation removed all characters');
  }

  if (result.length > 64) {
    return result.slice(0, 64);
  }

  return result;
}

/**
 * Ensure that the snapshot output directory exists.
 * @param {string} targetDir - Absolute path to the output directory.
 */
export async function ensureDirectory(targetDir) {
  await mkdir(targetDir, { recursive: true });
}

/**
 * Append a snapshot entry to the manifest file in a deterministic way.
 * @param {string} manifestPath - Path to the JSON manifest file.
 * @param {object} entry - Snapshot entry to record.
 */
export async function appendSnapshotMetadata(manifestPath, entry) {
  let data = { snapshots: [] };

  try {
    const file = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(file);
    if (Array.isArray(parsed.snapshots)) {
      data = parsed;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }

  data.snapshots.push(entry);
  data.snapshots.sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));

  await writeFile(manifestPath, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Capture a snapshot of the provided URL and persist a manifest entry.
 * @param {object} options - Snapshot configuration options.
 * @param {string} options.baseUrl - URL to capture.
 * @param {string} options.tag - Sanitised tag used for naming.
 * @param {string} [options.outputDir] - Directory where artifacts will live.
 * @returns {Promise<object>} snapshot metadata.
 */
export async function captureSnapshot({ baseUrl, tag, outputDir = DEFAULT_OUTPUT_DIR }) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `snapshot-${tag}-${timestamp}.png`;
  const manifestName = 'manifest.json';
  const filePath = path.join(outputDir, fileName);
  const manifestPath = path.join(outputDir, manifestName);

  await ensureDirectory(outputDir);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setViewportSize(DEFAULT_VIEWPORT);
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.screenshot({ path: filePath, fullPage: true });
  } finally {
    await browser.close();
  }

  const entry = {
    tag,
    url: baseUrl,
    file: path.relative(process.cwd(), filePath).split(path.sep).join('/'),
    capturedAt: new Date().toISOString(),
  };

  await appendSnapshotMetadata(manifestPath, entry);
  return entry;
}

async function runCli() {
  const { values } = parseArgs({
    options: {
      tag: {
        type: 'string',
      },
      url: {
        type: 'string',
        default: 'http://127.0.0.1:8080/',
      },
      outdir: {
        type: 'string',
      },
    },
    allowPositionals: true,
  });

  if (!values.tag) {
    throw new Error('Missing required option --tag');
  }

  const sanitized = sanitizeTag(values.tag);
  const targetDir = values.outdir
    ? path.resolve(process.cwd(), values.outdir)
    : DEFAULT_OUTPUT_DIR;

  let targetUrl;
  try {
    targetUrl = new URL(values.url);
  } catch {
    throw new Error('Invalid --url parameter, expected an absolute URL');
  }

  const entry = await captureSnapshot({
    baseUrl: targetUrl.toString(),
    tag: sanitized,
    outputDir: targetDir,
  });

  console.info(
    JSON.stringify({
      level: 'info',
      message: 'snapshot-created',
      snapshot: entry,
    })
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'snapshot-failed',
        error: {
          name: error.name,
          message: error.message,
        },
      })
    );
    process.exitCode = 1;
  });
}
