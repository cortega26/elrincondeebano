// Plan 215: el prune de imágenes debe conservar lo referenciado por
// app.webmanifest y service-worker.js (icon-192/512), no solo por HTML.
// Plan 235: además debe recorrer recursivamente assets/images — los árboles
// anidados variants/w<ancho>/... antes se saltaban por completo.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  collectManifestAndWorkerReferencedAssets,
  pruneUnreferencedImages,
} from '../astro-poc/scripts/postbuild-prune-unreferenced-images.mjs';

const tempRoots = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

function writeFixtureFile(root, relativePath, contents) {
  const full = join(root, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, contents);
  return full;
}

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

describe('pruneUnreferencedImages', () => {
  it('deletes nested unreferenced variant files and keeps the referenced ones', () => {
    const distRoot = mkdtempSync(join(tmpdir(), 'prune-images-'));
    tempRoots.push(distRoot);
    const imagesRoot = join(distRoot, 'assets', 'images');
    const keepTop = writeFixtureFile(imagesRoot, 'bebidas/keep.webp', 'keep-top');
    const keepNested = writeFixtureFile(
      imagesRoot,
      'bebidas/variants/w200/images/bebidas/keep.webp',
      'keep-w200'
    );
    const dropNested = writeFixtureFile(
      imagesRoot,
      'bebidas/variants/w1200/images/bebidas/keep.webp',
      'drop-w1200'
    );
    const referenced = new Set([
      'assets/images/bebidas/keep.webp',
      'assets/images/bebidas/variants/w200/images/bebidas/keep.webp',
    ]);

    const { removed, freed } = pruneUnreferencedImages(imagesRoot, referenced);

    expect(removed).toBe(1);
    expect(freed).toBe(Buffer.byteLength('drop-w1200'));
    expect(existsSync(keepTop)).toBe(true);
    expect(existsSync(keepNested)).toBe(true);
    expect(existsSync(dropNested)).toBe(false);
  });

  it('reports zero when every file is referenced', () => {
    const distRoot = mkdtempSync(join(tmpdir(), 'prune-images-'));
    tempRoots.push(distRoot);
    const imagesRoot = join(distRoot, 'assets', 'images');
    writeFixtureFile(imagesRoot, 'web/logo.webp', 'logo');
    const referenced = new Set(['assets/images/web/logo.webp']);

    const { removed, freed } = pruneUnreferencedImages(imagesRoot, referenced);

    expect(removed).toBe(0);
    expect(freed).toBe(0);
  });
});
