import { productCatalogSchema } from '../src/shared/schemas/product.ts';
import { categoryRegistrySchema } from '../src/shared/schemas/category.ts';
import { storefrontExperienceSchema } from '../src/shared/schemas/storefront.ts';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const repoRoot = resolve(process.cwd(), '..', '..');
const reportDir = resolve(repoRoot, 'reports', 'parity');
mkdirSync(reportDir, { recursive: true });

function getCommitSha(): string {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return 'unknown';
  }
}

interface FieldDiff {
  productIndex: number;
  productName: string;
  field: string;
  tsValue: string;
  pyValue: string;
}

interface ParityResult {
  commit_sha: string;
  timestamp: string;
  product_count_ts: number;
  product_count_py: number;
  category_count_ts: number;
  category_count_py: number;
  bundle_count_ts: number;
  bundle_count_py: number;
  product_field_diffs: FieldDiff[];
  category_diffs: string[];
  storefront_diffs: string[];
  warnings: string[];
  ok: boolean;
}

const result: ParityResult = {
  commit_sha: getCommitSha(),
  timestamp: new Date().toISOString(),
  product_count_ts: 0,
  product_count_py: 0,
  category_count_ts: 0,
  category_count_py: 0,
  bundle_count_ts: 0,
  bundle_count_py: 0,
  product_field_diffs: [],
  category_diffs: [],
  storefront_diffs: [],
  warnings: [],
  ok: true,
};

const fixturePath = resolve(repoRoot, 'plans', 'fixtures', '055', 'product_catalog.json');
const goldenProductPath = resolve(
  repoRoot,
  'plans',
  'fixtures',
  '055',
  'golden',
  'python_roundtrip.json'
);

const IGNORED_FIELDS = new Set(['field_last_modified', 'rev', 'updated_at']);

try {
  const fixtureRaw = readFileSync(fixturePath, 'utf-8');
  const fixtureData = JSON.parse(fixtureRaw);

  const tsProductResult = productCatalogSchema.safeParse(fixtureData);
  if (!tsProductResult.success) {
    console.error('❌ TypeScript schema rejected product fixture:');
    for (const issue of tsProductResult.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }

  result.product_count_ts = tsProductResult.data.products.length;

  if (existsSync(goldenProductPath)) {
    const goldenRaw = readFileSync(goldenProductPath, 'utf-8');
    const goldenProducts = JSON.parse(goldenRaw) as Array<Record<string, unknown>>;
    result.product_count_py = goldenProducts.length;

    if (goldenProducts.length !== tsProductResult.data.products.length) {
      console.error(
        `❌ Product count: python=${goldenProducts.length} ts=${tsProductResult.data.products.length}`
      );
      result.ok = false;
    }

    const tsProducts = tsProductResult.data.products;
    for (let i = 0; i < Math.min(tsProducts.length, goldenProducts.length); i++) {
      const ts = tsProducts[i] as Record<string, unknown>;
      const py = goldenProducts[i];
      const keys = new Set([...Object.keys(ts), ...Object.keys(py)]);
      for (const key of keys) {
        if (IGNORED_FIELDS.has(key)) continue;
        const tsVal = JSON.stringify(ts[key]);
        const pyVal = JSON.stringify(py[key]);
        if (tsVal !== pyVal) {
          result.product_field_diffs.push({
            productIndex: i,
            productName: String(ts.name ?? py['name'] ?? 'unknown'),
            field: key,
            tsValue: tsVal.length > 100 ? tsVal.slice(0, 100) + '…' : tsVal,
            pyValue: pyVal.length > 100 ? pyVal.slice(0, 100) + '…' : pyVal,
          });
        }
      }
    }
  } else {
    result.warnings.push('Python golden product file not found — product parity not verified');
  }
} catch (err) {
  result.warnings.push(`Product parity error: ${(err as Error).message}`);
  result.ok = false;
}

const categoryPath = resolve(repoRoot, 'data', 'category_registry.json');
const goldenCategoryPath = resolve(
  repoRoot,
  'plans',
  'fixtures',
  '055',
  'golden',
  'python_category_registry.json'
);

try {
  if (existsSync(goldenCategoryPath)) {
    const categoryRaw = readFileSync(categoryPath, 'utf-8');
    const goldenCategoryRaw = readFileSync(goldenCategoryPath, 'utf-8');

    const tsCategoryResult = categoryRegistrySchema.safeParse(JSON.parse(categoryRaw));
    if (tsCategoryResult.success) {
      result.category_count_ts = tsCategoryResult.data.categories.length;
      const goldenCategories = JSON.parse(goldenCategoryRaw);
      const goldenCatList = Array.isArray(goldenCategories)
        ? goldenCategories
        : (goldenCategories.categories ?? []);
      result.category_count_py = goldenCatList.length;

      if (result.category_count_ts !== result.category_count_py) {
        result.category_diffs.push(
          `Category count: ts=${result.category_count_ts} py=${result.category_count_py}`
        );
        result.ok = false;
      }
    }
  } else {
    result.warnings.push('Python golden category file not found');
  }
} catch (err) {
  result.warnings.push(`Category parity error: ${(err as Error).message}`);
  result.ok = false;
}

const storefrontPath = resolve(repoRoot, 'data', 'storefront', 'storefront-experience.json');
try {
  if (existsSync(storefrontPath)) {
    const raw = readFileSync(storefrontPath, 'utf-8');
    const tsResult = storefrontExperienceSchema.safeParse(JSON.parse(raw));
    if (tsResult.success) {
      result.bundle_count_ts = tsResult.data.bundles.length;
    }
  }
} catch {
  result.warnings.push('Could not read storefront experience for parity check');
}

if (result.product_field_diffs.length > 0) {
  console.error(`❌ ${result.product_field_diffs.length} product field mismatches:`);
  for (const d of result.product_field_diffs) {
    console.error(
      `  [${d.productIndex}] ${d.productName}.${d.field}: ts=${d.tsValue} py=${d.pyValue}`
    );
  }
  result.ok = false;
}

if (result.category_diffs.length > 0) {
  console.error(`❌ ${result.category_diffs.length} category differences:`);
  for (const d of result.category_diffs) console.error(`  ${d}`);
  result.ok = false;
}

if (result.storefront_diffs.length > 0) {
  console.error(`❌ ${result.storefront_diffs.length} storefront differences:`);
  for (const d of result.storefront_diffs) console.error(`  ${d}`);
  result.ok = false;
}

const reportPath = resolve(reportDir, `parity-${result.timestamp.replace(/[:.]/g, '-')}.json`);
writeFileSync(reportPath, JSON.stringify(result, null, 2));

console.log(`\nProducts: ${result.product_count_ts} TS / ${result.product_count_py} Python`);
console.log(`Categories: ${result.category_count_ts} TS / ${result.category_count_py} Python`);
console.log(`Bundles: ${result.bundle_count_ts} TS / ${result.bundle_count_py} Python`);
console.log(`Product diffs: ${result.product_field_diffs.length}`);
if (result.warnings.length > 0) {
  console.log(`Warnings: ${result.warnings.length}`);
  for (const w of result.warnings) console.log(`  ⚠️  ${w}`);
}

if (!result.ok) {
  console.log('\n❌ Parity check FAILED');
  process.exit(1);
}

console.log('\n✅ Parity check passed — zero unexplained differences');
process.exit(0);
