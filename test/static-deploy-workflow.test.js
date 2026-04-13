'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'static.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('static deploy workflow gates Pages publish behind the browser canary', () => {
  const buildIndex = workflow.indexOf('- name: Build storefront');
  const browserInstallIndex = workflow.indexOf('- name: Install Playwright browsers', buildIndex);
  const canaryIndex = workflow.indexOf(
    '- name: Run blocking browser canary against the shipped artifact',
    buildIndex
  );
  const deployIndex = workflow.indexOf('- name: Deploy to GitHub Pages', buildIndex);

  assert.notEqual(buildIndex, -1, 'expected deploy workflow to build the storefront');
  assert.notEqual(browserInstallIndex, -1, 'expected deploy workflow to install Playwright');
  assert.notEqual(canaryIndex, -1, 'expected deploy workflow to run the blocking browser canary');
  assert.notEqual(deployIndex, -1, 'expected deploy workflow to publish to Pages');
  assert.ok(browserInstallIndex > buildIndex, 'Playwright install should happen after the build');
  assert.ok(
    canaryIndex > browserInstallIndex,
    'browser canary should run after Playwright install'
  );
  assert.ok(deployIndex > canaryIndex, 'Pages deploy should happen only after the browser canary');
  assert.match(
    workflow,
    /PLAYWRIGHT_SKIP_BUILD: '1'[\s\S]*deploy-canary\.spec\.ts/,
    'expected the blocking browser canary to reuse the built artifact'
  );
});
