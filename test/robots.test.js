const fs = require('fs');
const path = require('path');
const assert = require('assert');

const robotsPath = path.join(__dirname, '..', 'robots.txt');
const contents = fs.readFileSync(robotsPath, 'utf8');

const allowedDirectives = new Set([
  'user-agent',
  'allow',
  'disallow',
  'crawl-delay',
  'sitemap',
  'host'
]);

const lines = contents.split(/\r?\n/);
lines.forEach((line, index) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return;
  }

  const separatorIndex = trimmed.indexOf(':');
  assert(
    separatorIndex !== -1,
    `Line ${index + 1} must contain a colon separating directive and value`
  );

  const directive = trimmed.slice(0, separatorIndex).toLowerCase();
  assert(
    allowedDirectives.has(directive),
    `Invalid robots.txt directive "${directive}" on line ${index + 1}`
  );

  const value = trimmed.slice(separatorIndex + 1).trim();
  assert(value.length > 0, `Directive on line ${index + 1} must include a value`);
});

console.log('robots.test.js passed');
