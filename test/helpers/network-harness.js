'use strict';

function withMockedFetch(mockImpl, fn) {
  const original = global.fetch;
  global.fetch = mockImpl;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      global.fetch = original;
    });
}

function withMockedConsoleLog(mockImpl, fn) {
  const original = console.log;
  console.log = mockImpl;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      console.log = original;
    });
}

function expectAsyncReject(assert, action, pattern) {
  return assert.rejects(action, pattern);
}

module.exports = {
  expectAsyncReject,
  withMockedConsoleLog,
  withMockedFetch,
};
