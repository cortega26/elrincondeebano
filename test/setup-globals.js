'use strict';

/**
 * Test-only bootstrap asserting the fetch/Web API globals exist natively.
 *
 * Node 24+ (the repo's only supported runtime, engines >=24 <25) ships
 * fetch/Headers/Request/Response/FormData/File/Blob as globals, so the old
 * third-party shim was dead code there (plan 201 retired the dependency). This
 * file stays as the explicit contract point: if a global ever goes missing
 * (exotic runner), the failure names it instead of surfacing as a cryptic
 * ReferenceError deep in a test.
 */
const REQUIRED_WEB_GLOBALS = [
  'fetch',
  'Headers',
  'Request',
  'Response',
  'FormData',
  'File',
  'Blob',
];

for (const name of REQUIRED_WEB_GLOBALS) {
  if (!globalThis[name]) {
    process.emitWarning(`Web API global '${name}' is missing; tests expect the Node 24 native.`, {
      code: 'TEST_WEB_API_MISSING',
    });
  }
}
