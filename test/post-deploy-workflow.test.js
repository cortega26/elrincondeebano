'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'post-deploy-canary.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('post-deploy live probe runs a browser contract before the fetch-based canary', () => {
  const liveProbeIndex = workflow.indexOf('live-probe:');
  const installDepsIndex = workflow.indexOf('- name: Install dependencies', liveProbeIndex);
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
  assert.notEqual(installDepsIndex, -1, 'expected the live-probe job to install dependencies');
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
    installChromiumIndex > installDepsIndex,
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
