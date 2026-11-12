'use strict';

const assert = require('node:assert/strict');
const { chooseBaseRef } = require('../tools/guardrails/_utils.mjs');

test('chooseBaseRef falls back to HEAD~1 without origin/main', () => {
  assert.equal(chooseBaseRef({ hasOriginMain: false }), 'HEAD~1');
});

test('chooseBaseRef uses origin/main when HEAD is ahead of it', () => {
  assert.equal(
    chooseBaseRef({ hasOriginMain: true, headSha: 'aaa111', originMainSha: 'bbb222' }),
    'origin/main'
  );
});

test('chooseBaseRef compares against the previous commit on a push to main', () => {
  assert.equal(
    chooseBaseRef({ hasOriginMain: true, headSha: 'same-sha', originMainSha: 'same-sha' }),
    'HEAD~1'
  );
});
