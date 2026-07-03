// Validación de esquemas Zod para los datos del storefront.
// Se ejecuta en el build para detectar datos inválidos antes de publicar.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function loadJson(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

async function validate() {
  // Dynamic import porque config.ts usa ESM y zod
  const { productCatalogSchema, categoryRegistrySchema, storefrontExperienceSchema } =
    await import('../src/lib/data-schemas.ts');

  let errors = 0;

  // Validar catálogo de productos
  try {
    const products = loadJson('src/data/products.json');
    const result = productCatalogSchema.safeParse(products);
    if (!result.success) {
      console.error('❌ product_data.json tiene errores de esquema:');
      for (const issue of result.error.issues) {
        console.error(`  - ${issue.path.join(' > ')}: ${issue.message}`);
        errors += 1;
      }
    } else {
      console.log(
        `✅ product_data.json: ${result.data.products.length} productos validados correctamente`
      );
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('⚠️  src/data/products.json no encontrado — ejecuta data:sync primero');
    } else {
      throw err;
    }
  }

  // Validar registro de categorías
  try {
    const categories = loadJson('src/data/categories.json');
    const result = categoryRegistrySchema.safeParse(categories);
    if (!result.success) {
      console.error('❌ categories.json tiene errores de esquema:');
      for (const issue of result.error.issues) {
        console.error(`  - ${issue.path.join(' > ')}: ${issue.message}`);
        errors += 1;
      }
    } else {
      console.log(
        `✅ categories.json: ${result.data.categories.length} categorías, ${result.data.nav_groups.length} grupos`
      );
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('⚠️  src/data/categories.json no encontrado — ejecuta data:sync primero');
    } else {
      throw err;
    }
  }

  // Validar experiencia del storefront (bundles en archivo separado, igual que catalog.ts)
  try {
    const experience = loadJson('src/data/storefront-experience.json');
    let bundles = [];
    try {
      const bundlesData = loadJson('src/data/storefront-bundles.json');
      bundles = Array.isArray(bundlesData) ? bundlesData : [];
    } catch {
      // storefront-bundles.json es opcional
    }
    const merged = { ...experience, bundles };
    const result = storefrontExperienceSchema.safeParse(merged);
    if (!result.success) {
      console.error('❌ storefront-experience.json (+ bundles) tiene errores de esquema:');
      for (const issue of result.error.issues) {
        console.error(`  - ${issue.path.join(' > ')}: ${issue.message}`);
        errors += 1;
      }
    } else {
      console.log(`✅ storefront-experience.json validado (${bundles.length} bundles)`);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('⚠️  src/data/storefront-experience.json no encontrado');
    } else {
      throw err;
    }
  }

  if (errors > 0) {
    console.error(
      `\n❌ ${errors} error(es) de validación de datos. Corrige los datos antes de publicar.`
    );
    process.exit(1);
  }

  console.log('\n✅ Todos los datos del storefront pasaron la validación de esquema.');
}

validate().catch((err) => {
  console.error('Error al validar esquemas:', err);
  process.exit(1);
});
