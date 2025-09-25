const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  const rootDir = path.join(__dirname, '..');

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'src/js/main.js')],
    bundle: true,
    minify: true,
    splitting: true,
    format: 'esm',
    outdir: path.join(rootDir, 'dist/js'),
    entryNames: 'script.min',
    chunkNames: 'chunks/[name]-[hash]',
    define: { 'process.env.NODE_ENV': '"production"' },
    treeShaking: true,
    target: 'es2018',
    platform: 'browser'
  });

  const staticJs = ['csp.js', 'sw-register.js'];
  const distJsDir = path.join(rootDir, 'dist/js');
  fs.mkdirSync(distJsDir, { recursive: true });
  for (const file of staticJs) {
    fs.copyFileSync(path.join(rootDir, 'src/js', file), path.join(distJsDir, file));
  }

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'assets/css/style.css')],
    bundle: true,
    minify: true,
    outfile: path.join(rootDir, 'dist/css/style.min.css'),
    loader: { '.css': 'css' }
  });

  await esbuild.build({
    entryPoints: [path.join(rootDir, 'assets/css/critical.css')],
    bundle: true,
    minify: true,
    outfile: path.join(rootDir, 'dist/css/critical.min.css'),
    loader: { '.css': 'css' }
  });
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
