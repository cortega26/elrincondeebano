const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { PurgeCSS } = require('purgecss');
const { rootDir, prepareOutputRoot, resolveFromOutput, ensureDir } = require('./utils/output-dir');
const { getDeterministicTimestamp } = require('./utils/deterministic-time');

const DYNAMIC_CLASS_SAFELIST = {
  standard: [
    'active',
    'alert',
    'collapse',
    'collapsed',
    'collapsing',
    'disabled',
    'dropdown-menu-end',
    'dropdown-menu-start',
    'fade',
    'is-block',
    'is-flex',
    'is-hidden',
    'is-loaded',
    'is-loading',
    'keyboard-navigation',
    'lazyload',
    'modal-backdrop',
    'offcanvas-backdrop',
    'show',
  ],
  deep: [/^offcanvas/, /^dropdown/, /^navbar/],
  greedy: [/^btn-/, /^form-/],
};

function collectFilesByExtension(dirPath, extensions, out = []) {
  if (!fs.existsSync(dirPath)) {
    return out;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.forEach((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFilesByExtension(fullPath, extensions, out);
      return;
    }
    if (extensions.has(path.extname(entry.name).toLowerCase())) {
      out.push(fullPath);
    }
  });

  return out;
}

function uniqueFiles(files) {
  return Array.from(new Set(files.filter((filePath) => fs.existsSync(filePath))));
}

function toRawContentEntries(files) {
  return uniqueFiles(files).map((filePath) => {
    const extension = path.extname(filePath).replace('.', '').toLowerCase() || 'html';
    return {
      extension,
      raw: fs.readFileSync(filePath, 'utf8'),
    };
  });
}

async function writePurgedCssBundle({
  intermediateStylePath,
  contentFiles,
  outputCssPath,
  outputMapPath,
  bundleLabel,
}) {
  const cssRaw = fs.readFileSync(intermediateStylePath, 'utf8');
  const purgeResult = await new PurgeCSS().purge({
    content: toRawContentEntries(contentFiles),
    css: [{ raw: cssRaw, name: `${bundleLabel}.bundle.css` }],
    safelist: DYNAMIC_CLASS_SAFELIST,
    fontFace: false,
    keyframes: false,
    variables: false,
  });

  const purgedCss = purgeResult?.[0]?.css || '';
  if (!purgedCss.trim()) {
    throw new Error(`PurgeCSS produced an empty stylesheet for ${bundleLabel}, aborting for safety.`);
  }

  const minifiedCss = await esbuild.transform(purgedCss, {
    loader: 'css',
    minify: true,
    sourcemap: 'external',
    sourcefile: `${bundleLabel}.bundle.css`,
  });

  fs.writeFileSync(outputCssPath, minifiedCss.code, 'utf8');
  fs.writeFileSync(outputMapPath, minifiedCss.map || '', 'utf8');
}

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

  const staticJs = ['csp.js'];
  for (const file of staticJs) {
    fs.copyFileSync(path.join(rootDir, 'src/js', file), path.join(distJsDir, file));
    manifestFiles.add(`/dist/js/${file}`);
  }

  const distCssDir = resolveFromOutput('dist/css');
  ensureDir(distCssDir);

  const intermediateStylePath = path.join(distCssDir, 'style.bundle.css');
  const cssBuild = await esbuild.build({
    entryPoints: [path.join(rootDir, 'assets/css/app.css')],
    bundle: true,
    minify: false,
    outfile: intermediateStylePath,
    loader: { '.css': 'css', '.woff2': 'file', '.woff': 'file' },
    sourcemap: false,
    absWorkingDir: rootDir,
    sourceRoot: '',
    metafile: true,
  });
  const cssOutputs =
    cssBuild.metafile && cssBuild.metafile.outputs ? cssBuild.metafile.outputs : {};
  Object.keys(cssOutputs).forEach((outputPath) => {
    if (path.resolve(outputPath) === path.resolve(intermediateStylePath)) {
      return;
    }
    const rel = path.relative(outputRoot, outputPath).replace(/\\/g, '/');
    manifestFiles.add(`/${rel}`);
  });
  if (!fs.existsSync(intermediateStylePath)) {
    throw new Error(`Missing intermediate stylesheet: ${intermediateStylePath}`);
  }

  const templateFiles = collectFilesByExtension(path.join(rootDir, 'templates'), new Set(['.ejs']));
  const partialTemplateFiles = templateFiles.filter((filePath) =>
    filePath.includes(`${path.sep}partials${path.sep}`)
  );
  const srcJsFiles = collectFilesByExtension(path.join(rootDir, 'src/js'), new Set(['.js', '.mjs', '.mts']));

  const sharedCssContent = [...partialTemplateFiles, ...srcJsFiles];
  const homeCssContent = [...sharedCssContent, path.join(rootDir, 'templates', 'index.ejs')];
  const categoryCssContent = [...sharedCssContent, path.join(rootDir, 'templates', 'category.ejs')];

  const homeCssPath = path.join(distCssDir, 'style.min.css');
  const homeCssMapPath = path.join(distCssDir, 'style.min.css.map');
  await writePurgedCssBundle({
    intermediateStylePath,
    contentFiles: homeCssContent,
    outputCssPath: homeCssPath,
    outputMapPath: homeCssMapPath,
    bundleLabel: 'home',
  });

  const categoryCssPath = path.join(distCssDir, 'style.category.min.css');
  const categoryCssMapPath = path.join(distCssDir, 'style.category.min.css.map');
  await writePurgedCssBundle({
    intermediateStylePath,
    contentFiles: categoryCssContent,
    outputCssPath: categoryCssPath,
    outputMapPath: categoryCssMapPath,
    bundleLabel: 'category',
  });

  fs.rmSync(intermediateStylePath, { force: true });

  const cssManifestEntries = [
    '/dist/css/style.min.css',
    '/dist/css/style.min.css.map',
    '/dist/css/style.category.min.css',
    '/dist/css/style.category.min.css.map',
  ];
  cssManifestEntries.forEach((entry) => manifestFiles.add(entry));

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
