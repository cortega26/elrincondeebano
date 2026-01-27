import {
  extractDeclaration,
  fail,
  findSelectorBlock,
  ok,
  readFile,
} from './_utils.mjs';

const CRITICAL = 'assets/css/critical.css';
const MAIN = 'assets/css/style.css';

const criticalCss = readFile(CRITICAL);
const mainCss = readFile(MAIN);

const selectors = [
  'body',
  '.navbar',
  '.navbar-brand img',
  '.product-thumb',
  '#cart-count',
  '#footer-container',
];

for (const selector of selectors) {
  const criticalBlock = findSelectorBlock(criticalCss, selector);
  const mainBlock = findSelectorBlock(mainCss, selector);
  if (!criticalBlock) {
    fail(`Missing selector "${selector}" in ${CRITICAL}.`);
  }
  if (!mainBlock) {
    fail(`Missing selector "${selector}" in ${MAIN}.`);
  }
}

const criticalBody = findSelectorBlock(criticalCss, 'body');
const mainBody = findSelectorBlock(mainCss, 'body');
const criticalPadding = extractDeclaration(criticalBody, 'padding-top');
const mainPadding = extractDeclaration(mainBody, 'padding-top');

if (!criticalPadding || !mainPadding) {
  fail('Unable to extract body padding-top from critical or main CSS.');
}

if (criticalPadding !== mainPadding) {
  fail(
    `body padding-top mismatch: ${CRITICAL}=${criticalPadding} vs ${MAIN}=${mainPadding}`
  );
}

const criticalNavbar = findSelectorBlock(criticalCss, '.navbar');
const mainNavbar = findSelectorBlock(mainCss, '.navbar');
const criticalMinHeight = extractDeclaration(criticalNavbar, 'min-height');
const mainMinHeight = extractDeclaration(mainNavbar, 'min-height');

if (!criticalMinHeight || !mainMinHeight) {
  fail('Unable to extract .navbar min-height from critical or main CSS.');
}

if (criticalMinHeight !== mainMinHeight) {
  fail(
    `.navbar min-height mismatch: ${CRITICAL}=${criticalMinHeight} vs ${MAIN}=${mainMinHeight}`
  );
}

ok('Critical CSS guardrails passed.');
