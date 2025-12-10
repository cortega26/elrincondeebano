'use strict';

/**
 * Test-only bootstrap that fills in missing fetch/Web API globals when running
 * under Node.js versions that do not yet expose them by default (e.g. Node 20).
 *
 * The shim only installs each global if it is absent to preserve the runtime's
 * native implementations on modern Node LTS releases (Node 22+ today).
 */
try {
  const { fetch, Headers, Request, Response, FormData, File, Blob } = require('undici');

  const globalsToInstall = {
    fetch,
    Headers,
    Request,
    Response,
    FormData,
    File,
    Blob,
  };

  for (const [name, implementation] of Object.entries(globalsToInstall)) {
    if (!globalThis[name] && implementation) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: implementation,
      });
    }
  }
} catch (error) {
  process.emitWarning(`Failed to set up Web API test shims: ${error.message}`, {
    code: 'TEST_WEB_API_SHIM',
    detail: error.stack,
  });
}
