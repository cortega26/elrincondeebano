const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readPolicy(fileRelativePath) {
  const filePath = path.resolve(__dirname, '..', fileRelativePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const collapsed = content.replace(/\s+/g, ' ');
  const match = collapsed.match(/connect-src[^;]+;/);
  assert.ok(match, `connect-src directive must exist in ${fileRelativePath}`);
  return match[0];
}

function verifyPolicy(fileRelativePath) {
  const directive = readPolicy(fileRelativePath);
  const requiredHosts = [
    'https://cloudflareinsights.com'
  ];

  requiredHosts.forEach((host) => {
    assert.ok(
      directive.includes(host),
      `Expected ${host} in connect-src directive for ${fileRelativePath}`
    );
  });

  const forbiddenHosts = [
    'https://www.google-analytics.com',
    'https://analytics.google.com',
    'https://region1.google-analytics.com'
  ];

  forbiddenHosts.forEach((host) => {
    assert.ok(
      !directive.includes(host),
      `Did not expect ${host} in connect-src directive for ${fileRelativePath}`
    );
  });
}

verifyPolicy('src/js/csp.js');
verifyPolicy('dist/js/csp.js');
