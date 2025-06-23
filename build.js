const esbuild = require('esbuild');

async function build() {
  await esbuild.build({
    entryPoints: ['assets/js/script.js'],
    bundle: true,
    minify: true,
    outfile: 'assets/js/script.min.js',
  });

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
