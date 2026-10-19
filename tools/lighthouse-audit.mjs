import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import lighthouse from 'lighthouse';
import { launch as launchChrome } from 'chrome-launcher';
import deterministicTime from './utils/deterministic-time.js';
import { logger } from './utils/logger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const reportDir = path.join(rootDir, 'reports', 'lighthouse');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const DEFAULT_AUDIT_PATH = '/index.html';
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function runBuild() {
  logger.info('Ejecutando "npm run build"...');
  await new Promise((resolve, reject) => {
    const buildProcess = spawn(npmCmd, ['run', 'build'], {
      cwd: rootDir,
      stdio: 'inherit',
    });

    buildProcess.on('error', (err) => {
      reject(err);
    });

    buildProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`El proceso de build finalizó con código ${code}`));
      }
    });
  });
}

export function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function normalizeAuditPath(rawPath) {
  const trimmed = String(rawPath || '').trim();
  if (!trimmed) {
    return DEFAULT_AUDIT_PATH;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function getReportLabel(auditPath) {
  const segments = normalizeAuditPath(auditPath)
    .split('/')
    .filter((segment) => segment && segment !== 'index.html');
  if (segments.length === 0) {
    return null;
  }
  return segments
    .join('-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function parseAuditPath(argv = process.argv.slice(2)) {
  const equalsArg = argv.find((arg) => arg.startsWith('--path='));
  if (equalsArg) {
    return normalizeAuditPath(equalsArg.slice('--path='.length));
  }
  const flagIndex = argv.indexOf('--path');
  if (flagIndex === -1) {
    return DEFAULT_AUDIT_PATH;
  }
  const value = argv[flagIndex + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('--path requiere una ruta (por ejemplo: --path /impresiones/)');
  }
  return normalizeAuditPath(value);
}

function sanitizePath(pathname) {
  const normalizedSeparators = String(pathname || '').replace(/\\/g, '/');
  const parts = normalizedSeparators.split('/').filter(Boolean);
  if (parts.includes('..')) {
    return null;
  }
  // Normalize and strip leading slashes to avoid absolute path resets on Windows.
  return path.normalize(normalizedSeparators).replace(/^([/\\])+/, '');
}

export function createStaticServer(root) {
  return http.createServer(async (req, res) => {
    try {
      const rawUrl = typeof req.url === 'string' ? req.url : '/';
      const queryIndex = rawUrl.indexOf('?');
      const rawPathname = queryIndex >= 0 ? rawUrl.slice(0, queryIndex) : rawUrl;
      // Allow only GET/HEAD
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.end('Method Not Allowed');
        return;
      }

      let pathname = decodeURIComponent(rawPathname);
      if (pathname.endsWith('/')) {
        pathname = `${pathname}index.html`;
      }
      if (pathname === '/') {
        pathname = '/index.html';
      }

      // Sanitize to avoid absolute join behavior on Windows and path traversal
      const safeRel = sanitizePath(pathname);
      if (!safeRel) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }
      const filePath = path.join(root, safeRel);
      if (!filePath.startsWith(root)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
      }

      let finalPath = filePath;
      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.isDirectory()) {
          finalPath = path.join(filePath, 'index.html');
        }
      } catch (error) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }

      const stream = fs.createReadStream(finalPath);
      stream.on('error', (error) => {
        logger.error('Error al enviar el archivo:', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.headersSent) {
          res.statusCode = 500;
        }
        res.end('Internal Server Error');
      });

      res.setHeader('Content-Type', getMimeType(finalPath));
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      stream.pipe(res);
    } catch (error) {
      logger.error('Error en el servidor estático:', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });
}

async function runLighthouseAudit(targetUrl, preset, timestamp, label) {
  logger.info(`Iniciando auditoría Lighthouse (${preset}) sobre ${targetUrl}...`);
  const chrome = await launchChrome({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });

  try {
    const result = await lighthouse(targetUrl, {
      port: chrome.port,
      output: ['html', 'json'],
      logLevel: 'info',
      preset,
    });

    const [htmlReport, jsonReport] = result.report;
    const labelPart = label ? `${label}-` : '';
    const baseName = `lighthouse-${preset}-${labelPart}${timestamp}`;
    const htmlPath = path.join(reportDir, `${baseName}.html`);
    const jsonPath = path.join(reportDir, `${baseName}.json`);

    fs.writeFileSync(htmlPath, htmlReport, 'utf8');
    fs.writeFileSync(jsonPath, jsonReport, 'utf8');

    logger.info(
      `Auditoría ${preset} completada. Reportes guardados en:\n  - ${htmlPath}\n  - ${jsonPath}`
    );
  } finally {
    await chrome.kill();
  }
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true });
  if (!process.env.LH_SKIP_BUILD) {
    await runBuild();
  } else {
    logger.info('Omitiendo build (LH_SKIP_BUILD=1).');
  }

  const astroDistRoot = path.join(rootDir, 'astro-poc', 'dist');
  const server = createStaticServer(astroDistRoot);
  const port = 4173;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      logger.info(`Servidor estático iniciado en http://127.0.0.1:${port}`);
      resolve();
    });
  });

  const origin = `http://127.0.0.1:${port}`;
  const auditPath = parseAuditPath();
  const targetUrl = `${origin}${auditPath}`;
  const reportLabel = getReportLabel(auditPath);
  const { getDeterministicDate } = deterministicTime;
  const timestamp = getDeterministicDate().toISOString().replace(/[:.]/g, '-');

  logger.info(
    `Página objetivo: ${targetUrl}${reportLabel ? ` (label: ${reportLabel})` : ''}`
  );

  try {
    const presets = ['desktop', 'mobile'];
    for (const preset of presets) {
      await runLighthouseAudit(targetUrl, preset, timestamp, reportLabel);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await once(server, 'close');
    logger.info('Servidor estático detenido.');
  }
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  return path.resolve(process.argv[1]) === __filename;
}

if (isDirectExecution()) {
  main().catch((error) => {
    logger.error('Fallo en la auditoría Lighthouse:', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
