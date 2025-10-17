const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const {
  rootDir,
  prepareOutputRoot,
  resolveFromOutput,
  ensureDir,
} = require('./utils/output-dir');

async function build() {
  const outputRoot = prepareOutputRoot();

  const distJsDir = resolveFromOutput('dist/js');
  ensureDir(distJsDir);

  await esbuild.build({
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
  });

  const staticJs = ['csp.js', 'sw-register.js'];
  for (const file of staticJs) {
    fs.copyFileSync(
      path.join(rootDir, 'src/js', file),
      path.join(distJsDir, file),
    );
  }

  const distCssDir = resolveFromOutput('dist/css');
  ensureDir(distCssDir);

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'assets/css/style.css')],
    bundle: true,
    minify: true,
    outfile: path.join(distCssDir, 'style.min.css'),
    loader: { '.css': 'css', '.woff2': 'file', '.woff': 'file' },
    sourcemap: true,
  });

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'assets/css/critical.css')],
    bundle: true,
    minify: true,
    outfile: path.join(distCssDir, 'critical.min.css'),
    loader: { '.css': 'css', '.woff2': 'file', '.woff': 'file' },
    sourcemap: true,
  });

  return outputRoot;
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
