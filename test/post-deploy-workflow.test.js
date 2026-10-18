'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowsDir = path.join(__dirname, '..', '.github', 'workflows');
const workflowPath = path.join(workflowsDir, 'post-deploy-canary.yml');
const rollbackWorkflowPath = path.join(workflowsDir, 'rollback.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const rollbackWorkflow = fs.readFileSync(rollbackWorkflowPath, 'utf8');

// Extracts the text of every `run:` body (block scalars and single-line runs).
function extractRunBodies(yamlText) {
  const bodies = [];
  let current = null;
  let blockIndent = 0;
  for (const line of yamlText.split('\n')) {
    if (current) {
      const indent = line.length - line.trimStart().length;
      if (line.trim() === '' || indent > blockIndent) {
        current.push(line);
        continue;
      }
      current = null;
    }
    const blockStart = line.match(/^(\s*)run:\s*\|[-+]?\s*$/);
    if (blockStart) {
      current = [];
      blockIndent = blockStart[1].length;
      bodies.push(current);
      continue;
    }
    const singleLine = line.match(/^\s*run:\s*(\S.*)$/);
    if (singleLine) {
      bodies.push([singleLine[1]]);
    }
  }
  return bodies.map((body) => body.join('\n'));
}

test('post-deploy live probe runs a browser contract before the fetch-based canary', () => {
  const liveProbeIndex = workflow.indexOf('live-probe:');
  const setupDepsIndex = workflow.indexOf(
    '- uses: ./.github/actions/setup-node-and-deps',
    liveProbeIndex
  );
  const installChromiumIndex = workflow.indexOf(
    '- name: Install Playwright Chromium',
    liveProbeIndex
  );
  const browserProbeIndex = workflow.indexOf(
    '- name: Run live browser contract probe',
    liveProbeIndex
  );
  const liveCanaryIndex = workflow.indexOf(
    '- name: Run live canary probes (allowed network)',
    liveProbeIndex
  );

  assert.notEqual(
    liveProbeIndex,
    -1,
    'expected the post-deploy workflow to define the live-probe job'
  );
  assert.notEqual(
    setupDepsIndex,
    -1,
    'expected the live-probe job to set up Node and install dependencies'
  );
  assert.notEqual(
    installChromiumIndex,
    -1,
    'expected the live-probe job to install Playwright Chromium'
  );
  assert.notEqual(
    browserProbeIndex,
    -1,
    'expected the live-probe job to run the browser contract probe'
  );
  assert.notEqual(
    liveCanaryIndex,
    -1,
    'expected the live-probe job to keep the fetch-based live canary'
  );
  assert.ok(
    installChromiumIndex > setupDepsIndex,
    'Playwright Chromium install should happen after dependency install'
  );
  assert.ok(
    browserProbeIndex > installChromiumIndex,
    'browser contract probe should happen after Playwright Chromium is installed'
  );
  assert.ok(
    liveCanaryIndex > browserProbeIndex,
    'fetch-based live canary should run after the browser contract probe'
  );
  assert.match(
    workflow,
    /node tools\/live-browser-contract\.mjs[\s\S]*reports\/canary\/live-browser\.json/,
    'expected the live-probe job to persist a browser contract report'
  );
});

test('post-deploy workflow_run derives artifact canary metadata from the triggering deploy run head SHA', () => {
  assert.match(
    workflow,
    /github\.event\.workflow_run\.head_sha/,
    'expected workflow_run metadata to be tied to the triggering deploy run SHA'
  );
});

test('post-deploy canary maps dispatch inputs through env instead of interpolating them into scripts', () => {
  const runBodies = extractRunBodies(workflow);
  assert.ok(runBodies.length > 0, 'expected the canary workflow to define run: bodies');
  assert.deepEqual(
    runBodies.filter((body) => body.includes('${{ inputs.')),
    [],
    'run: bodies must not interpolate ${{ inputs.* }} — pass dispatch inputs via env:'
  );
  assert.doesNotMatch(
    workflow,
    /^\s+[A-Za-z_][A-Za-z0-9_]*=.*\$\{\{ inputs\./m,
    'no shell assignment may interpolate ${{ inputs.* }} directly'
  );
  for (const mapping of [
    'BASE_URL: ${{ inputs.base_url }}',
    'CATEGORY_PATH: ${{ inputs.category_path }}',
    'TIMEOUT_MS: ${{ inputs.timeout_ms }}',
    'DEPLOY_SHA: ${{ inputs.deploy_sha }}',
  ]) {
    assert.ok(workflow.includes(mapping), `expected env mapping ${mapping}`);
  }
  assert.ok(
    workflow.includes('if ! [[ "$DEPLOY_SHA" =~ ^[A-Za-z0-9._/-]{1,128}$ ]]'),
    'expected deploy_sha format validation before use'
  );
});

test('rollback workflow maps rollback_ref through env and validates its format before use', () => {
  const runBodies = extractRunBodies(rollbackWorkflow);
  assert.ok(runBodies.length > 0, 'expected the rollback workflow to define run: bodies');
  assert.deepEqual(
    runBodies.filter((body) => body.includes('${{ inputs.')),
    [],
    'run: bodies must not interpolate ${{ inputs.* }} — pass dispatch inputs via env:'
  );
  assert.doesNotMatch(
    rollbackWorkflow,
    /^\s+[A-Za-z_][A-Za-z0-9_]*=.*\$\{\{ inputs\./m,
    'no shell assignment may interpolate ${{ inputs.* }} directly'
  );
  assert.match(
    rollbackWorkflow,
    /env:\n\s+ROLLBACK_REF: \$\{\{ inputs\.rollback_ref \}\}/,
    'expected rollback_ref to be mapped through an env block'
  );
  assert.ok(
    rollbackWorkflow.includes('if ! [[ "$ROLLBACK_REF" =~ ^[A-Za-z0-9._/-]{1,128}$ ]]'),
    'expected rollback_ref format validation before use'
  );
  assert.match(
    rollbackWorkflow,
    /ref: \$\{\{ env\.ROLLBACK_REF \}\}/,
    'expected the checkout to consume the env-mapped value'
  );
});
