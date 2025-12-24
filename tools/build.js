const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { rootDir, prepareOutputRoot, resolveFromOutput, ensureDir } = require('./utils/output-dir');
const { getDeterministicTimestamp } = require('./utils/deterministic-time');

async function build() {
  const outputRoot = prepareOutputRoot();
  const manifestFiles = new Set();
  const addDirFiles = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        addDirFiles(fullPath);
      } else {
        const rel = path.relative(outputRoot, fullPath).replace(/\\/g, '/');
        manifestFiles.add(`/${rel}`);
      }
    });
  };

  const distJsDir = resolveFromOutput('dist/js');
  ensureDir(distJsDir);

  const jsBuild = await esbuild.build({
    entryPoints: [path.join(rootDir, 'src/js/main.js')],
    bundle: true,
    minify: true,
    splitting: true,
    format: 'esm',
    outdir: distJsDir,
    entryNames: 'script.min',
    chunkNames: 'chunks/[name]-[hash]',
    define: { 'process.env.NODE_ENV': '"production"' },
    treeShaking: true,
    target: 'es2018',
    platform: 'browser',
    sourcemap: true,
    absWorkingDir: rootDir,
    sourceRoot: '',
    metafile: true,
  });
  const jsOutputs = jsBuild.metafile && jsBuild.metafile.outputs ? jsBuild.metafile.outputs : {};
  Object.keys(jsOutputs).forEach((outputPath) => {
    const rel = path.relative(outputRoot, outputPath).replace(/\\/g, '/');
    manifestFiles.add(`/${rel}`);
  });
  if (Object.keys(jsOutputs).length === 0) {
    addDirFiles(distJsDir);
  }

  const staticJs = ['csp.js', 'sw-register.js'];
  for (const file of staticJs) {
    fs.copyFileSync(path.join(rootDir, 'src/js', file), path.join(distJsDir, file));
    manifestFiles.add(`/dist/js/${file}`);
  }

  const distCssDir = resolveFromOutput('dist/css');
  ensureDir(distCssDir);

  const cssBuild = await esbuild.build({
    entryPoints: [path.join(rootDir, 'assets/css/style.css')],
    bundle: true,
    minify: true,
    outfile: path.join(distCssDir, 'style.min.css'),
    loader: { '.css': 'css', '.woff2': 'file', '.woff': 'file' },
    sourcemap: true,
    absWorkingDir: rootDir,
    sourceRoot: '',
    metafile: true,
  });
  const cssOutputs =
    cssBuild.metafile && cssBuild.metafile.outputs ? cssBuild.metafile.outputs : {};
  Object.keys(cssOutputs).forEach((outputPath) => {
    const rel = path.relative(outputRoot, outputPath).replace(/\\/g, '/');
    manifestFiles.add(`/${rel}`);
  });
  if (Object.keys(cssOutputs).length === 0) {
    addDirFiles(distCssDir);
  }

  const criticalCssBuild = await esbuild.build({
    entryPoints: [path.join(rootDir, 'assets/css/critical.css')],
    bundle: true,
    minify: true,
    outfile: path.join(distCssDir, 'critical.min.css'),
    loader: { '.css': 'css', '.woff2': 'file', '.woff': 'file' },
    sourcemap: true,
    absWorkingDir: rootDir,
    sourceRoot: '',
  });
  const criticalOutputs =
    criticalCssBuild.metafile && criticalCssBuild.metafile.outputs
      ? criticalCssBuild.metafile.outputs
      : {};
  Object.keys(criticalOutputs).forEach((outputPath) => {
    const rel = path.relative(outputRoot, outputPath).replace(/\\/g, '/');
    manifestFiles.add(`/${rel}`);
  });
  if (Object.keys(criticalOutputs).length === 0) {
    addDirFiles(distCssDir);
  }

  const manifestPath = resolveFromOutput('asset-manifest.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: getDeterministicTimestamp(),
        files: Array.from(manifestFiles).sort(),
      },
      null,
      2
    )
  );

  return outputRoot;
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
