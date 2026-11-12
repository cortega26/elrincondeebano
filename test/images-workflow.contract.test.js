'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const imagesWorkflow = fs.readFileSync(path.join(workflowsDir, 'images.yml'), 'utf8');

function runBlocks(contents) {
  const lines = contents.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(\s*)run:\s*(.*)$/);
    if (!match) continue;
    const indent = match[1].length;
    const inline = match[2];
    if (inline && !inline.startsWith('|') && !inline.startsWith('>')) {
      blocks.push(inline);
      continue;
    }
    const block = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (line.trim() === '') continue;
      if (line.match(/^\s*/)[0].length <= indent) break;
      block.push(line);
    }
    blocks.push(block.join('\n'));
  }
  return blocks;
}

const packageScripts = new Set(
  Object.keys(JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).scripts || {})
);

const workflowFiles = fs
  .readdirSync(workflowsDir)
  .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
  .sort();

test('every npm script referenced by a workflow exists in the root package.json', () => {
  assert.ok(
    workflowFiles.length > 0,
    'expected at least one workflow file under .github/workflows'
  );

  const missing = [];
  const seen = new Set();

  for (const file of workflowFiles) {
    const contents = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
    for (const match of contents.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
      const scriptName = match[1];
      seen.add(scriptName);
      if (!packageScripts.has(scriptName)) {
        missing.push(`${file}: npm run ${scriptName}`);
      }
    }
  }

  assert.ok(seen.size > 0, 'expected workflows to invoke at least one npm script');
  assert.deepEqual(
    [...new Set(missing)].sort(),
    [],
    `workflows reference npm scripts missing from package.json "scripts":\n${[...new Set(missing)]
      .sort()
      .join('\n')}`
  );
});

test('images workflow pushes a bot branch instead of main', () => {
  assert.match(imagesWorkflow, /persist-credentials: false/, 'checkout must not persist the token');
  assert.match(
    imagesWorkflow,
    /refs\/heads\/bot\/optimized-images-/,
    'the workflow must push a bot/optimized-images-* branch'
  );
  assert.doesNotMatch(
    imagesWorkflow,
    /\bpush\b[^\n]*refs\/heads\/\$\{GITHUB_REF_NAME\}/,
    'the workflow must not push to the triggering branch'
  );
  assert.doesNotMatch(
    imagesWorkflow,
    /\bpush\b[^\n]*refs\/heads\/main\b/,
    'the workflow must not push to main'
  );
});

test('images workflow passes expressions through env, never inside run blocks', () => {
  const interpolated = runBlocks(imagesWorkflow).filter((block) => block.includes('${{'));
  assert.deepEqual(
    interpolated,
    [],
    'workflow expressions (including secrets) must be passed through env, not run interpolation'
  );
  assert.match(
    imagesWorkflow,
    /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/,
    'the push token must be scoped to the commit step env'
  );
});
