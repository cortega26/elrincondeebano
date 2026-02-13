const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';

const lines = [
  'Manual Smoke Checklist - El Rincon de Ebano',
  `Base URL: ${baseUrl}`,
  '',
  '1. Homepage',
  `   - Open ${baseUrl}/`,
  '   - Verify initial catalog, navbar, and footer render correctly.',
  '',
  '2. Category navigation',
  '   - Open at least 3 category pages from navbar.',
  '   - Verify title/category match and no visible UI glitches.',
  '',
  '3. Search/filter',
  '   - Apply keyword filter and confirm narrowed results.',
  '   - Clear filters and confirm full list returns.',
  '',
  '4. Product interaction',
  '   - Trigger one product card interaction path.',
  '   - Verify name, price, and stock label are correct.',
  '',
  '5. Cart flow',
  '   - Add product, adjust quantity, remove item.',
  '   - Verify totals and empty state behavior.',
  '',
  '6. Checkout/contact',
  '   - Trigger checkout/contact CTA (WhatsApp path if present).',
  '   - Verify https URL and graceful fallback when popup is blocked.',
  '',
  'Record results in docs/operations/SMOKE_TEST.md evidence block.',
];

console.log(lines.join('\n'));
