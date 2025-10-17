const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const {
  rootDir,
  resolveFromOutput,
  ensureDir,
} = require('./utils/output-dir');

function renderPartial(partialPath, context = {}) {
  const template = fs.readFileSync(partialPath, 'utf8');
  return ejs.render(template, context, { filename: partialPath });
}

function main() {
  const partialsDir = path.join(rootDir, 'templates', 'partials');
  if (!fs.existsSync(partialsDir)) {
    return;
  }

  const outputDir = resolveFromOutput('pages');
  ensureDir(outputDir);

  const entries = fs.readdirSync(partialsDir);
  entries
    .filter((file) => file.endsWith('.ejs'))
    .forEach((file) => {
      const baseName = path.basename(file, '.ejs');
      const html = renderPartial(path.join(partialsDir, file));
      const outputPath = path.join(outputDir, `${baseName}.html`);
      fs.writeFileSync(outputPath, html);
    });
}

main();
