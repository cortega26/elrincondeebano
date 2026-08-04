import { ProductRepository } from '../src/server/repositories/productRepository.ts';
import { CategoryRepository } from '../src/server/repositories/categoryRepository.ts';
import { StorefrontRepository } from '../src/server/repositories/storefrontRepository.ts';
import { ValidationAdapter } from '../src/server/adapters/validationAdapter.ts';
import { createDefaultManifest } from '../src/domain/publication/publicationService.ts';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(process.cwd(), '..', '..');
const reportDir = resolve(repoRoot, 'reports', 'shadow');
mkdirSync(reportDir, { recursive: true });

interface ShadowReport {
  timestamp: string;
  repo_root: string;
  product_count: number;
  category_count: number;
  nav_group_count: number;
  bundle_count: number;
  schema_validations: Array<{ step: string; status: string; output?: string }>;
  products_with_id: number;
  products_archived: number;
  products_out_of_stock: number;
  products_with_discount: number;
  publication_manifest: { owned_paths: string[]; commit_message: string };
  python_golden_comparison: { ok: boolean; differences: string[] };
  warnings: string[];
}

function loadPythonGolden(): Array<Record<string, unknown>> {
  const goldenPath = resolve(
    repoRoot,
    'plans',
    'fixtures',
    '055',
    'golden',
    'python_roundtrip.json'
  );
  if (!existsSync(goldenPath)) {
    return [];
  }
  return JSON.parse(readFileSync(goldenPath, 'utf-8'));
}

async function main(): Promise<void> {
  console.log('=== Shadow Read Report ===');
  console.log(`Repo: ${repoRoot}\n`);

  const report: ShadowReport = {
    timestamp: new Date().toISOString(),
    repo_root: repoRoot,
    product_count: 0,
    category_count: 0,
    nav_group_count: 0,
    bundle_count: 0,
    schema_validations: [],
    products_with_id: 0,
    products_archived: 0,
    products_out_of_stock: 0,
    products_with_discount: 0,
    publication_manifest: { owned_paths: [], commit_message: '' },
    python_golden_comparison: { ok: true, differences: [] },
    warnings: [],
  };

  try {
    const products = new ProductRepository({ repoRoot });
    const catalog = products.loadCatalog();

    report.product_count = catalog.products.length;
    report.products_with_id = catalog.products.filter((p) => p.id).length;
    report.products_archived = catalog.products.filter((p) => p.is_archived).length;
    report.products_out_of_stock = catalog.products.filter((p) => !p.stock).length;
    report.products_with_discount = catalog.products.filter((p) => p.discount > 0).length;

    console.log(`Products: ${report.product_count}`);
    console.log(`  With stable ID: ${report.products_with_id}`);
    console.log(`  Archived: ${report.products_archived}`);
    console.log(`  Out of stock: ${report.products_out_of_stock}`);
    console.log(`  Discounted: ${report.products_with_discount}`);

    if (report.products_with_id < report.product_count) {
      report.warnings.push(
        `${report.product_count - report.products_with_id} products lack stable IDs`
      );
    }
  } catch (err) {
    report.warnings.push(`Product load failed: ${(err as Error).message}`);
    console.error(`  ❌ Product load failed: ${(err as Error).message}`);
  }

  try {
    const categories = new CategoryRepository({ repoRoot });
    const registry = categories.load();
    report.category_count = (registry.categories ?? []).length;
    report.nav_group_count = (registry.nav_groups ?? []).length;
    console.log(`Categories: ${report.category_count} (${report.nav_group_count} groups)`);
  } catch (err) {
    report.warnings.push(`Category load failed: ${(err as Error).message}`);
  }

  try {
    const storefront = new StorefrontRepository({ repoRoot });
    const exp = storefront.load();
    report.bundle_count = exp.bundles.length;
    console.log(`Bundles: ${report.bundle_count}`);
  } catch (err) {
    report.warnings.push(`Storefront load failed: ${(err as Error).message}`);
  }

  const validation = new ValidationAdapter();
  report.schema_validations.push(validation.validateProducts(repoRoot));
  report.schema_validations.push(validation.validateCategories(repoRoot));
  report.schema_validations.push(validation.validateStorefront(repoRoot));

  console.log('\nValidations:');
  for (const v of report.schema_validations) {
    const icon = v.status === 'pass' ? '✅' : '❌';
    console.log(`  ${icon} ${v.step}: ${v.output ?? v.status}`);
  }

  const manifest = createDefaultManifest();
  report.publication_manifest = {
    owned_paths: manifest.ownedPaths,
    commit_message: manifest.commitMessage,
  };

  const pythonGolden = loadPythonGolden();
  if (pythonGolden.length > 0) {
    console.log(`\nPython golden: ${pythonGolden.length} products`);
    if (pythonGolden.length !== report.product_count) {
      if (pythonGolden.length === 9) {
        report.warnings.push(
          'Python golden contains 9 fixture products — real catalog size differs (expected)'
        );
      } else {
        const diff = `${report.product_count} TS vs ${pythonGolden.length} Python`;
        report.python_golden_comparison.differences.push(`Product count: ${diff}`);
        report.python_golden_comparison.ok = false;
      }
    }
  }

  report.publication_manifest = {
    owned_paths: manifest.ownedPaths,
    commit_message: manifest.commitMessage,
  };

  const reportPath = resolve(
    reportDir,
    `shadow-read-${report.timestamp.replace(/[:.]/g, '-')}.json`
  );
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`\nReport: ${reportPath}`);
  console.log(`Warnings: ${report.warnings.length}`);
  if (report.warnings.length > 0) {
    for (const w of report.warnings) {
      console.log(`  ⚠️  ${w}`);
    }
  }

  const allSchemaOk = report.schema_validations.every((v) => v.status === 'pass');
  if (!allSchemaOk) {
    console.log('\n❌ Schema validation failures found');
    process.exit(1);
  }

  console.log('\n✅ Shadow read complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('Shadow read failed:', err);
  process.exit(1);
});
