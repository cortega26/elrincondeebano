'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');
const autoMergeWorkflow = fs.readFileSync(
  path.join(workflowsDir, 'dependabot-auto-merge.yml'),
  'utf8'
);
const guardWorkflow = fs.readFileSync(path.join(workflowsDir, 'product-data-guard.yml'), 'utf8');

test('dependabot auto-merge pins fetch-metadata to a full commit SHA', () => {
  assert.match(
    autoMergeWorkflow,
    /dependabot\/fetch-metadata@[0-9a-f]{40} # v\d+\.\d+\.\d+/,
    'fetch-metadata must be pinned to a 40-char commit SHA with a version comment'
  );
  assert.doesNotMatch(
    autoMergeWorkflow,
    /dependabot\/fetch-metadata@v\d/,
    'fetch-metadata must not float on a major-version tag'
  );
});

test('product-data-guard gates the auto-commit on the diff provenance, not the trigger actor', () => {
  assert.ok(
    guardWorkflow.includes(
      "(github.event_name == 'pull_request' && github.event.pull_request.user.login == 'dependabot[bot]' && startsWith(github.head_ref, 'dependabot/'))"
    ),
    'expected the auto-commit gate to require a Dependabot-authored dependency PR branch'
  );
  assert.match(
    guardWorkflow,
    /provenance of the diff/,
    'expected a comment explaining the provenance gate'
  );
  assert.doesNotMatch(
    guardWorkflow,
    /github\.actor == 'dependabot\[bot\]'/,
    'the actor-only gate identifies the trigger, not the diff provenance'
  );
});
