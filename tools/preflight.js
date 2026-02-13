const fs = require('fs');
const path = require('path');
const { getDeterministicTimestamp } = require('./utils/deterministic-time');

const rootDir = path.resolve(__dirname, '..');
const pkg = require(path.join(rootDir, 'package.json'));

function parseSemver(version) {
  if (typeof version !== 'string') {
    return null;
  }

  const match = version.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2] || 0),
    patch: Number(match[3] || 0),
    prerelease: match[4] || '',
  };
}

function comparePrerelease(left, right) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const leftParts = left.split('.');
  const rightParts = right.split('.');
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const a = leftParts[index];
    const b = rightParts[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;

    const aIsNum = /^\d+$/.test(a);
    const bIsNum = /^\d+$/.test(b);
    if (aIsNum && bIsNum) {
      const delta = Number(a) - Number(b);
      if (delta !== 0) return delta > 0 ? 1 : -1;
      continue;
    }
    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;
    if (a !== b) return a > b ? 1 : -1;
  }

  return 0;
}

function compareSemver(left, right) {
  const deltas = [left.major - right.major, left.minor - right.minor, left.patch - right.patch];
  for (const delta of deltas) {
    if (delta !== 0) {
      return delta > 0 ? 1 : -1;
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function parseRangeComparators(range) {
  if (typeof range !== 'string' || !range.trim()) {
    return [];
  }

  const comparators = [];
  const tokens = range.trim().split(/\s+/);
  for (const token of tokens) {
    const match = token.match(/^(<=|>=|<|>|=)?(.+)$/);
    if (!match) {
      return null;
    }
    const operator = match[1] || '=';
    const version = parseSemver(match[2]);
    if (!version) {
      return null;
    }
    comparators.push({ operator, version });
  }
  return comparators;
}

function satisfiesComparator(current, comparator) {
  const diff = compareSemver(current, comparator.version);
  switch (comparator.operator) {
    case '<':
      return diff < 0;
    case '<=':
      return diff <= 0;
    case '>':
      return diff > 0;
    case '>=':
      return diff >= 0;
    case '=':
      return diff === 0;
    default:
      return false;
  }
}

function validateNodeVersion(currentVersion, requiredRange) {
  const parsedCurrent = parseSemver(currentVersion);
  if (!parsedCurrent) {
    return {
      ok: false,
      reason: 'invalid-current',
      currentVersion,
      requiredRange,
    };
  }

  const comparators = parseRangeComparators(requiredRange);
  if (!comparators || comparators.length === 0) {
    return {
      ok: false,
      reason: 'invalid-range',
      currentVersion,
      requiredRange,
    };
  }

  const ok = comparators.every((comparator) => satisfiesComparator(parsedCurrent, comparator));
  return {
    ok,
    reason: ok ? 'ok' : 'out-of-range',
    currentVersion,
    requiredRange,
  };
}

function buildNodeVersionErrorMessage(requiredRange, currentVersion, reason) {
  const reasonDetail =
    reason === 'invalid-range'
      ? 'The configured engines.node range is invalid and cannot be evaluated.'
      : reason === 'invalid-current'
        ? 'Detected Node version is invalid and cannot be evaluated.'
        : 'Detected Node version does not satisfy the configured semver range.';
  return [
    'Node version check failed.',
    `- Required range: ${requiredRange}`,
    `- Detected version: ${currentVersion}`,
    `- Reason: ${reasonDetail}`,
    '- Fix: switch to a compatible runtime (recommended: Node 22.x).',
    '- Quick fixes: `nvm use 22` or `volta install node@22`.',
    '- Windows fallback (if `node` is not in PATH):',
    '  "C:\\Program Files\\nodejs\\node.exe" "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js" run <script>',
  ].join('\n');
}

function ensureNodeVersion() {
  const required = pkg.engines && pkg.engines.node;
  if (!required) return;
  const current = process.versions.node;
  const result = validateNodeVersion(current, required);
  if (!result.ok) {
    throw new Error(buildNodeVersionErrorMessage(required, current, result.reason));
  }
}

function logCfimgMode() {
  const enable = process.env.CFIMG_ENABLE;
  const disable = process.env.CFIMG_DISABLE;
  if (disable && ['1', 'true', 'yes'].includes(disable.toLowerCase())) {
    console.log('CFIMG: rewrite disabled via CFIMG_DISABLE');
    return;
  }
  if (enable && ['1', 'true', 'yes'].includes(enable.toLowerCase())) {
    console.log('CFIMG: rewrite enabled via CFIMG_ENABLE');
    return;
  }
  console.log(
    'CFIMG: rewrite disabled by default; set CFIMG_ENABLE=1 when building behind Cloudflare'
  );
}

function ensureManifestExists() {
  const manifestPath = path.join(rootDir, 'build', 'asset-manifest.json');
  if (fs.existsSync(manifestPath)) {
    return;
  }
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ generatedAt: getDeterministicTimestamp(), files: [] }, null, 2)
  );
}

function main() {
  ensureNodeVersion();
  logCfimgMode();
  ensureManifestExists();
}

if (require.main === module) {
  main();
}

module.exports = {
  parseSemver,
  compareSemver,
  parseRangeComparators,
  validateNodeVersion,
  buildNodeVersionErrorMessage,
  ensureNodeVersion,
  logCfimgMode,
  ensureManifestExists,
  main,
};
