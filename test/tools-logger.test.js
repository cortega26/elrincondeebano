'use strict';

// Plan 206 slice 4: unit pins for the shared tools logger.
const assert = require('node:assert/strict');

async function loadLogger() {
  return import('../tools/utils/logger.mjs');
}

function capture() {
  const lines = { log: [], error: [] };
  const origLog = console.log;
  const origError = console.error;
  console.log = (line) => lines.log.push(String(line));
  console.error = (line) => lines.error.push(String(line));
  return {
    lines,
    restore() {
      console.log = origLog;
      console.error = origError;
    },
  };
}

test('tools logger emits timestamped JSON with level + message', async () => {
  const { logger } = await loadLogger();
  const cap = capture();
  try {
    logger.info('hello-tools', { step: 'x' });
  } finally {
    cap.restore();
  }
  assert.equal(cap.lines.log.length, 1);
  const entry = JSON.parse(cap.lines.log[0]);
  assert.equal(entry.level, 'info');
  assert.equal(entry.message, 'hello-tools');
  assert.equal(entry.step, 'x');
  assert.ok(!Number.isNaN(Date.parse(entry.timestamp)));
});

test('tools logger redacts sensitive keys and truncates long strings', async () => {
  const { logger } = await loadLogger();
  const cap = capture();
  try {
    logger.info('redact-me', { api_token: 'secret-123', note: `y`.repeat(600) });
  } finally {
    cap.restore();
  }
  const entry = JSON.parse(cap.lines.log[0]);
  assert.equal(entry.api_token, '[REDACTED]');
  assert.ok(entry.note.endsWith('...'));
  assert.ok(entry.note.length < 600);
});

test('tools logger respects LOG_LEVEL and routes warn/error to stderr', async () => {
  const { logger } = await loadLogger();
  const prev = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'warn';
  const cap = capture();
  try {
    logger.info('suppressed');
    logger.warn('shown-warn');
    logger.error('shown-error');
  } finally {
    cap.restore();
    if (prev === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = prev;
    }
  }
  assert.equal(cap.lines.log.length, 0);
  assert.equal(cap.lines.error.length, 2);
});
