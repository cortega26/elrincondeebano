// Plan 127 F3.6: benchmark of the catalog snapshot path (plan 105 clones the
// catalog on every loadCatalog cache hit). Measures the real catalog and
// records the result under reports/ so the budget is documented before any
// optimization.
'use strict';

import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const REPORT_PATH = resolve(REPO_ROOT, 'reports', 'bench-catalog-snapshot.json');

async function run() {
  const { ProductRepository } = await import('../src/server/repositories/productRepository.ts');

  const repo = new ProductRepository({ repoRoot: REPO_ROOT });
  // Warm the cache.
  repo.loadCatalog();

  const samples = [];
  for (let i = 0; i < 100; i += 1) {
    const t0 = performance.now();
    const catalog = repo.loadCatalog();
    const t1 = performance.now();
    samples.push(t1 - t0);
    if (i === 0) {
      console.log(`[bench] catalog: ${catalog.products.length} products`);
    }
  }
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)];
  const p95 = samples[Math.floor(samples.length * 0.95)];
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;

  const report = {
    products: repo.loadCatalog().products.length,
    samples: 100,
    median_ms: Number(median.toFixed(3)),
    p95_ms: Number(p95.toFixed(3)),
    mean_ms: Number(mean.toFixed(3)),
    generated_at: new Date().toISOString(),
  };
  mkdirSync(resolve(REPO_ROOT, 'reports'), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf-8');
  console.log(
    `[bench] median ${report.median_ms}ms · p95 ${report.p95_ms}ms · mean ${report.mean_ms}ms`
  );
  console.log(`[bench] report: ${REPORT_PATH}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
