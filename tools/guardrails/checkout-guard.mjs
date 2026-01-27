import { changedFiles, fail, ok, readFile } from './_utils.mjs';

const TARGET = 'src/js/modules/checkout.mjs';
const files = changedFiles();
if (!files.includes(TARGET)) {
  ok('checkout.mjs unchanged; popup guard check skipped.');
}

const content = readFile(TARGET);
const openPattern = /\b(const|let)\s+popup\s*=\s*window\.open\s*\(/;
const guardPattern = /if\s*\(\s*!popup\b|popup\s*===\s*null|popup\?\.closed/;
const fallbackName = 'showCheckoutFallback';

if (!openPattern.test(content)) {
  fail('checkout.mjs changed but no "const popup = window.open(...)" guard found.');
}

if (!guardPattern.test(content)) {
  fail('checkout.mjs changed but no popup guard conditional found (e.g., if (!popup)).');
}

if (!content.includes(fallbackName)) {
  fail(`checkout.mjs changed but fallback handler "${fallbackName}" not referenced.`);
}

ok('Checkout popup guard check passed.');
