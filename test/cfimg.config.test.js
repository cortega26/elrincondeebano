'use strict';

const assert = require('node:assert/strict');

const productMapper = require('../tools/utils/product-mapper.js');

test('cfimg defaults to raw asset paths without CF flags', async () => {
  delete process.env.CFIMG_DISABLE;
  delete process.env.CFIMG_ENABLE;
  const rawPath = '/assets/images/sample.webp';
  assert.equal(productMapper.cfimg(rawPath, {}), rawPath);
});

test('cfimg honors CFIMG_ENABLE', async () => {
  delete process.env.CFIMG_DISABLE;
  process.env.CFIMG_ENABLE = '1';
  const rawPath = '/assets/images/sample.webp';
  assert.ok(productMapper.cfimg(rawPath, {}).startsWith('/cdn-cgi/image/'));
  delete process.env.CFIMG_ENABLE;
});

test('cfimg honors CFIMG_DISABLE even when enable is set', async () => {
  process.env.CFIMG_ENABLE = '1';
  process.env.CFIMG_DISABLE = 'true';
  const rawPath = '/assets/images/sample.webp';
  assert.equal(productMapper.cfimg(rawPath, {}), rawPath);
  delete process.env.CFIMG_ENABLE;
  delete process.env.CFIMG_DISABLE;
});
