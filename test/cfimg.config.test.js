'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const productMapper = require('../tools/utils/product-mapper.js');

const runtimeCfimgUrl = pathToFileURL(
  path.resolve(__dirname, '..', 'src', 'js', 'utils', 'cfimg.mjs')
).href;

test('cfimg defaults to raw asset paths without CF flags', async () => {
  delete process.env.CFIMG_DISABLE;
  delete process.env.CFIMG_ENABLE;
  const { cfimg: runtimeCfimg } = await import(runtimeCfimgUrl);
  const rawPath = '/assets/images/sample.webp';
  assert.equal(productMapper.cfimg(rawPath, {}), rawPath);
  assert.equal(runtimeCfimg(rawPath, {}), rawPath);
});

test('cfimg honors CFIMG_ENABLE', async () => {
  delete process.env.CFIMG_DISABLE;
  process.env.CFIMG_ENABLE = '1';
  const { cfimg: runtimeCfimg } = await import(runtimeCfimgUrl);
  const rawPath = '/assets/images/sample.webp';
  assert.ok(productMapper.cfimg(rawPath, {}).startsWith('/cdn-cgi/image/'));
  assert.ok(runtimeCfimg(rawPath, {}).startsWith('/cdn-cgi/image/'));
  delete process.env.CFIMG_ENABLE;
});

test('cfimg honors CFIMG_DISABLE even when enable is set', async () => {
  process.env.CFIMG_ENABLE = '1';
  process.env.CFIMG_DISABLE = 'true';
  const { cfimg: runtimeCfimg } = await import(runtimeCfimgUrl);
  const rawPath = '/assets/images/sample.webp';
  assert.equal(productMapper.cfimg(rawPath, {}), rawPath);
  assert.equal(runtimeCfimg(rawPath, {}), rawPath);
  delete process.env.CFIMG_ENABLE;
  delete process.env.CFIMG_DISABLE;
});
