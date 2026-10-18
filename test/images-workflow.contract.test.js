'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');

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
