// Plan 215: el prune de imágenes debe conservar lo referenciado por
// app.webmanifest y service-worker.js (icon-192/512), no solo por HTML.
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { collectManifestAndWorkerReferencedAssets } from '../astro-poc/scripts/postbuild-prune-unreferenced-images.mjs';

function fakeReader(files) {
  return (filePath) => {
    if (Object.hasOwn(files, filePath)) return files[filePath];
    const err = new Error(`ENOENT: ${filePath}`);
    err.code = 'ENOENT';
    throw err;
  };
}

describe('collectManifestAndWorkerReferencedAssets', () => {
  it('keeps PWA icons referenced by the manifest and the service worker', () => {
    const distRoot = '/fake/dist';
    const files = {
      [join(distRoot, 'app.webmanifest')]: JSON.stringify({
        icons: [
          { src: '/assets/images/web/icon-192.png' },
          { src: '/assets/images/web/icon-512.png' },
        ],
      }),
      [join(distRoot, 'service-worker.js')]:
        "precache(['/assets/images/web/icon-192.png','/assets/images/web/icon-512.png']);",
    };
    const refs = collectManifestAndWorkerReferencedAssets(fakeReader(files), distRoot);
    expect(refs.has('assets/images/web/icon-192.png')).toBe(true);
    expect(refs.has('assets/images/web/icon-512.png')).toBe(true);
  });

  it('tolerates missing manifest or worker files', () => {
    const refs = collectManifestAndWorkerReferencedAssets(fakeReader({}), '/fake/dist');
    expect(refs.size).toBe(0);
  });

  it('ignores non-image asset paths', () => {
    const distRoot = '/fake/dist';
    const files = {
      [join(distRoot, 'app.webmanifest')]: JSON.stringify({
        src: '/assets/data/catalog.json',
        icons: [{ src: '/assets/images/web/icon-192.png' }],
      }),
    };
    const refs = collectManifestAndWorkerReferencedAssets(fakeReader(files), distRoot);
    expect(refs.has('assets/images/web/icon-192.png')).toBe(true);
    expect(refs.size).toBe(1);
  });
});
