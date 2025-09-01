const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

async function build() {
  await esbuild.build({
    entryPoints: ['src/js/main.js'],
    bundle: true,
    minify: true,
    outfile: 'assets/js/script.min.js',
  });

  const staticJs = ['csp.js', 'gtag-init.js', 'sw-register.js'];
  for (const file of staticJs) {
    fs.copyFileSync(path.join('src/js', file), path.join('assets/js', file));
  }

  await esbuild.build({
    entryPoints: ['assets/css/style.css'],
    bundle: true,
    minify: true,
    outfile: 'assets/css/style.min.css',
    loader: { '.css': 'css' }
  });

  await esbuild.build({
    entryPoints: ['assets/css/critical.css'],
    bundle: true,
    minify: true,
    outfile: 'assets/css/critical.min.css',
    loader: { '.css': 'css' }
  });
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
