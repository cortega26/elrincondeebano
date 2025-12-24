import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import lighthouse from 'lighthouse';
import { launch as launchChrome } from 'chrome-launcher';
import deterministicTime from './utils/deterministic-time.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const reportDir = path.join(rootDir, 'reports', 'lighthouse');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
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
  console.log('Ejecutando "npm run build"...');
  await new Promise((resolve, reject) => {
    const buildProcess = spawn(npmCmd, ['run', 'build'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
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

function sanitizePath(pathname) {
  // Normalize and strip leading slashes to avoid absolute path resets on Windows
  const normalized = path.normalize(pathname).replace(/^([/\\])+/, '');
  return normalized;
}

export function createStaticServer(root) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      // Allow only GET/HEAD
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Allow', 'GET, HEAD');
        res.end('Method Not Allowed');
        return;
      }

      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith('/')) {
        pathname = `${pathname}index.html`;
      }
      if (pathname === '/') {
        pathname = '/index.html';
      }

      // Sanitize to avoid absolute join behavior on Windows and path traversal
      const safeRel = sanitizePath(pathname);
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
        console.error('Error al enviar el archivo:', error);
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
      console.error('Error en el servidor estático:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    }
  });
}

async function runLighthouseAudit(targetUrl, preset, timestamp) {
  console.log(`Iniciando auditoría Lighthouse (${preset})...`);
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
    const baseName = `lighthouse-${preset}-${timestamp}`;
    const htmlPath = path.join(reportDir, `${baseName}.html`);
    const jsonPath = path.join(reportDir, `${baseName}.json`);

    fs.writeFileSync(htmlPath, htmlReport, 'utf8');
    fs.writeFileSync(jsonPath, jsonReport, 'utf8');

    console.log(
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
    console.log('Omitiendo build (LH_SKIP_BUILD=1).');
  }

  const server = createStaticServer(rootDir);
  const port = 4173;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      console.log(`Servidor estático iniciado en http://127.0.0.1:${port}`);
      resolve();
    });
  });

  const origin = `http://127.0.0.1:${port}`;
  const targetUrl = `${origin}/index.html`;
  const { getDeterministicDate } = deterministicTime;
  const timestamp = getDeterministicDate().toISOString().replace(/[:.]/g, '-');

  try {
    const presets = ['desktop', 'mobile'];
    for (const preset of presets) {
      await runLighthouseAudit(targetUrl, preset, timestamp);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await once(server, 'close');
    console.log('Servidor estático detenido.');
  }
}

main().catch((error) => {
  console.error('Fallo en la auditoría Lighthouse:', error);
  process.exit(1);
});
