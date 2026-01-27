import { extractBlock, fail, ok, readFile } from './_utils.mjs';

const content = readFile('service-worker.js');
const staticAssetsBlock = extractBlock(content, 'staticAssets', 'array');
if (!staticAssetsBlock) {
  fail('CACHE_CONFIG.staticAssets block not found in service-worker.js.');
}

const forbidden = [
  { label: '/admin', regex: /\/admin(\/|['"])/ },
  { label: '/admin-panel', regex: /\/admin-panel(\/|['"])/ },
  { label: '/cdn-cgi/image/', regex: /\/cdn-cgi\/image\// },
  { label: '/service-worker.js', regex: /\/service-worker\.js/ },
];

for (const item of forbidden) {
  if (item.regex.test(staticAssetsBlock)) {
    fail(`Forbidden path ${item.label} found in CACHE_CONFIG.staticAssets.`);
  }
}

const hasBypass = (regex) => {
  const shouldBypassMatch = content.match(/shouldBypass[\s\S]*?(?=\n\s*const|\n\s*function|$)/);
  const shouldSkipMatch = content.match(/shouldSkipCache[\s\S]*?(?=\n\s*const|\n\s*function|$)/);
  return Boolean(
    (shouldBypassMatch && regex.test(shouldBypassMatch[0])) ||
      (shouldSkipMatch && regex.test(shouldSkipMatch[0]))
  );
};

for (const item of forbidden) {
  if (!hasBypass(item.regex)) {
    fail(`Missing bypass rule for ${item.label} (shouldBypass/shouldSkipCache).`);
  }
}

ok('SW forbidden route guardrails passed.');
