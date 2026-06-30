/**
 * Verifica que los selectores de clase CSS usados en los tests E2E de Playwright
 * existan en los archivos fuente del proyecto. Esto evita que renombramientos
 * de clases CSS durante refactors de estilo rompan los tests silenciosamente.
 *
 * Ejecución: node tools/check-e2e-class-selectors.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const E2E_DIR = path.join(ROOT, 'test', 'e2e-astro');
const ASTRO_SRC = path.join(ROOT, 'astro-poc', 'src');

// Directorios donde buscar clases CSS en el código fuente
const SOURCE_DIRS = [
  path.join(ASTRO_SRC, 'pages'),
  path.join(ASTRO_SRC, 'components'),
  path.join(ASTRO_SRC, 'layouts'),
  path.join(ASTRO_SRC, 'styles'),
  path.join(ASTRO_SRC, 'scripts'),
];

// Clases y pseudo-clases que Playwright usa internamente (no son clases de usuario)
const BROWSER_PSEUDO_CLASSES = new Set([
  'visible',
  'hidden',
  'checked',
  'disabled',
  'enabled',
  'selected',
  'focus',
  'hover',
  'active',
  'first',
  'last',
  'first-child',
  'last-child',
  'first-of-type',
  'last-of-type',
]);

// Clases de utilidad que se espera que existan como parte de frameworks/base
const KNOWN_FRAMEWORK_CLASSES = new Set([
  'btn',
  'btn-primary',
  'btn-outline-primary',
  'btn-outline-dark',
  'btn-outline-secondary',
  'btn-sm',
  'd-none',
  'd-flex',
  'd-block',
  'd-inline-block',
  'd-grid',
  'mb-0',
  'mt-3',
  'my-4',
  'text-center',
  'text-muted',
  'alert',
  'alert-info',
  'me-1',
  'me-2',
  'me-3',
  'ms-1',
  'ms-2',
  'ms-3',
  'mt-1',
  'mt-2',
  'mt-3',
  'mb-1',
  'mb-2',
  'mb-3',
  'pe-2',
  'ps-3',
  'py-2',
  'p-2',
  'p-3',
  'gap-2',
  'gap-3',
  'fw-bold',
  'text-nowrap',
  'text-truncate',
  'align-items-center',
  'justify-content-between',
  'justify-content-center',
  'flex-column',
  'flex-wrap',
  'flex-shrink-0',
  'ratio',
  'ratio-1x1',
  'sticky-top',
  'position-relative',
  'position-absolute',
  'w-100',
  'h-100',
  'visually-hidden',
  'sr-only',
  'offcanvas',
  'offcanvas-backdrop',
  'offcanvas-header',
  'offcanvas-body',
  'offcanvas-start',
  'offcanvas-end',
  'navbar',
  'navbar-brand',
  'navbar-toggler',
  'navbar-toggler-icon',
  'navbar-collapse',
  'collapse',
  'container',
  'container-fluid',
  'row',
  'col',
  'col-12',
  'col-md-6',
  'dropdown',
  'dropdown-menu',
  'dropdown-toggle',
  'dropdown-item',
  'modal',
  'modal-dialog',
  'modal-content',
  'modal-header',
  'modal-body',
  'modal-footer',
  'fade',
  'show',
  'collapsing',
]);

/**
 * Extrae nombres de clases CSS de una cadena de selector de Playwright.
 * Soporta selectores simples ('.clase'), compuestos ('.clase1 .clase2'),
 * y combinados ('button.clase').
 */
function extractClassNames(selector) {
  const classes = [];
  // Busca patrones como '.nombre-clase' o 'tag.clase'
  const re = /\.([a-zA-Z_][\w-]*)/g;
  let match;
  while ((match = re.exec(selector)) !== null) {
    const className = match[1];
    if (
      !BROWSER_PSEUDO_CLASSES.has(className) &&
      !KNOWN_FRAMEWORK_CLASSES.has(className) &&
      !classes.includes(className)
    ) {
      classes.push(className);
    }
  }
  return classes;
}

/**
 * Extrae selectores CSS de los archivos de test E2E.
 * Busca patrones: .locator('...'), .locator("...")
 */
function extractClassSelectorsFromTestFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const selectors = [];

  // Busca .locator('...') y .locator("...")
  const locatorRe = /\.locator\(\s*(['"])(.+?)\1\s*[),]/gs;
  let match;
  while ((match = locatorRe.exec(content)) !== null) {
    const selector = match[2];
    // Solo procesa selectores que contengan clases CSS (empiezan con .)
    if (selector.includes('.')) {
      selectors.push({ selector, line: getLineNumber(content, match.index) });
    }
  }

  return selectors;
}

function getLineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

/**
 * Busca una clase CSS en los directorios fuente.
 * Retorna la primera ubicación encontrada o null.
 */
/**
 * Verifica si el contenido de un archivo contiene una clase CSS específica.
 * Busca en atributos HTML (class="..."), selectores CSS (.clase),
 * y strings literales (className: '...') considerando clases compuestas.
 */
function contentContainsClass(content, className) {
  // 1. Clase exacta como único valor del atributo: class="cart-empty-message"
  if (content.includes(`class="${className}"`) || content.includes(`class='${className}'`)) {
    return true;
  }

  // 2. Clase dentro de un atributo compuesto: class="alert mb-0 cart-empty-message"
  if (
    content.includes(` ${className}"`) ||
    content.includes(` ${className}'`) ||
    content.includes(`"${className} `) ||
    content.includes(`'${className} `) ||
    content.includes(` ${className} `)
  ) {
    return true;
  }

  // 3. Selector CSS: .cart-empty-message { ... } o combinado .parent .cart-empty-message
  if (content.includes(`.${className}`)) {
    return true;
  }

  // 4. Literales JS string que usan la clase (className: 'cart-empty-message', etc.)
  if (
    content.includes(`'${className}'`) ||
    content.includes(`"${className}"`) ||
    content.includes(`\`${className}\``)
  ) {
    return true;
  }

  return false;
}

function findClassInSource(className) {
  for (const dir of SOURCE_DIRS) {
    if (!fs.existsSync(dir)) continue;

    const files = walkDir(dir, ['.astro', '.css', '.js', '.ts', '.mjs']);
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (contentContainsClass(content, className)) {
        return path.relative(ROOT, file);
      }
    }
  }
  return null;
}

function walkDir(dir, extensions) {
  const results = [];
  const stack = [dir];
  const extSet = new Set(extensions);

  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        stack.push(fullPath);
      } else if (extSet.has(path.extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function getRelativePath(filePath) {
  return path.relative(ROOT, filePath);
}

function main() {
  if (!fs.existsSync(E2E_DIR)) {
    console.log('E2E test directory not found. Skipping class selector check.');
    process.exit(0);
  }

  const testFiles = fs
    .readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => path.join(E2E_DIR, f));

  if (testFiles.length === 0) {
    console.log('No E2E test files found. Skipping class selector check.');
    process.exit(0);
  }

  const violations = [];
  const validCounts = { total: 0, found: 0, framework: 0 };

  for (const testFile of testFiles) {
    const selectors = extractClassSelectorsFromTestFile(testFile);
    const relTestPath = getRelativePath(testFile);

    for (const { selector, line } of selectors) {
      const classNames = extractClassNames(selector);
      for (const className of classNames) {
        validCounts.total++;
        if (KNOWN_FRAMEWORK_CLASSES.has(className)) {
          validCounts.framework++;
          continue;
        }
        const foundIn = findClassInSource(className);
        if (foundIn) {
          validCounts.found++;
        } else {
          violations.push({
            testFile: relTestPath,
            line,
            selector,
            className,
          });
        }
      }
    }
  }

  // Mostrar resumen
  console.log(
    `Verificación de selectores CSS en E2E: ${validCounts.total} clases encontradas (${validCounts.found} del proyecto, ${validCounts.framework} de framework/base)`
  );

  if (violations.length > 0) {
    console.error('\n❌ Clases CSS no encontradas en el código fuente:\n');
    for (const v of violations) {
      console.error(`  ${v.testFile}:${v.line}  →  .${v.className}  (selector: "${v.selector}")`);
    }
    console.error(
      `\n${violations.length} clase(s) CSS usada(s) en tests E2E no existen en los archivos fuente.`
    );
    console.error('Esto puede indicar que una clase fue renombrada y el test no fue actualizado.');
    console.error(
      'Sugerencia: usa atributos data-* en lugar de clases CSS para selectores en tests E2E.'
    );
    process.exit(1);
  }

  console.log('✅ Todos los selectores de clase CSS en tests E2E existen en el código fuente.');
}

main();
