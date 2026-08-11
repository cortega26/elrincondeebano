import type { StorefrontExperience } from '../../shared/schemas/storefront.ts';
import type { Product } from '../../shared/schemas/product.ts';

export interface CurationIssue {
  path: string;
  message: string;
}

// Storefront curation invariants (plan 066 step 1). The read schema stays
// permissive (legacy files must load); this strict validation guards every
// write boundary. Python parity: non-empty/unique bundles (storefront_service).
export function validateStorefrontCuration(
  experience: StorefrontExperience,
  products: Product[]
): { ok: true } | { ok: false; issues: CurationIssue[] } {
  const issues: CurationIssue[] = [];
  const seenBundleIds = new Set<string>();

  experience.bundles.forEach((bundle, index) => {
    const at = `bundles[${index}]`;

    if (!bundle.id?.trim()) issues.push({ path: `${at}.id`, message: 'Bundle id vacío' });
    if (!bundle.title?.trim()) issues.push({ path: `${at}.title`, message: 'Bundle title vacío' });
    if (!bundle.description?.trim()) {
      issues.push({ path: `${at}.description`, message: 'Bundle description vacía' });
    }
    if (!Array.isArray(bundle.items) || bundle.items.length === 0) {
      issues.push({ path: `${at}.items`, message: 'Bundle sin items' });
    }
    if (bundle.id && seenBundleIds.has(bundle.id)) {
      issues.push({ path: `${at}.id`, message: `Bundle id duplicado: "${bundle.id}"` });
    }
    if (bundle.id) seenBundleIds.add(bundle.id);

    const seenRefs = new Set<string>();
    (bundle.items ?? []).forEach((item, itemIndex) => {
      const refKey = `${item.category}::${item.name}`;
      if (seenRefs.has(refKey)) {
        issues.push({
          path: `${at}.items[${itemIndex}]`,
          message: `Referencia duplicada: "${refKey}"`,
        });
      }
      seenRefs.add(refKey);
      validateProductRef(item.category, item.name, products, `${at}.items[${itemIndex}]`, issues);
    });
  });

  experience.home.featuredStaples.forEach((item, index) => {
    validateProductRef(
      item.category,
      item.name,
      products,
      `home.featuredStaples[${index}]`,
      issues
    );
  });

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function validateProductRef(
  category: string,
  name: string,
  products: Product[],
  path: string,
  issues: CurationIssue[]
): void {
  const product = products.find(
    (p) =>
      p.category.toLowerCase().trim() === category.toLowerCase().trim() &&
      p.name.toLowerCase().trim() === name.toLowerCase().trim()
  );
  if (!product) {
    issues.push({
      path,
      message: `Producto no encontrado: "${name}" (categoría "${category}")`,
    });
    return;
  }
  // Explicit archived policy: archived products cannot be merchandised.
  if (product.is_archived) {
    issues.push({
      path,
      message: `Producto archivado no se puede mostrar: "${name}" (categoría "${category}")`,
    });
  }
}
