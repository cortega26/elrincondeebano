// Plan 295 spike: dry-run catalog edit reused from ProductService. This is an
// experimental entry point, not wired to CI. Usage:
//   node --import tsx scripts/catalog-op.ts edit --id <id> --field price --value 3600 [--write]
//   node --import tsx scripts/catalog-op.ts --help
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonFileAtomic } from '../src/server/services/atomicFileWriter.ts';
import { ProductService } from '../src/domain/products/productService.ts';
import { productCatalogSchema } from '../src/shared/schemas/product.ts';

const ALLOWED_FIELDS = new Set(['price', 'discount', 'stock', 'description']);

const HELP = `Usage:
  node --import tsx scripts/catalog-op.ts edit --id <id> --field <field> --value <value> [--write]
  node --import tsx scripts/catalog-op.ts --help

Fields: price, discount, stock, description.
Without --write this is a dry run: it prints the before/after diff and does not
touch data/product_data.json.`;

export function resolveRepoRoot(): string {
  if (process.env.REPO_ROOT) return process.env.REPO_ROOT;
  const candidates = [process.cwd(), resolve(process.cwd(), '..', '..')];
  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'data', 'product_data.json'))) return candidate;
  }
  return candidates[1] ?? process.cwd();
}

interface ParsedArgs {
  command: 'help' | 'edit';
  id?: string;
  field?: string;
  value?: string;
  write: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  if (argv.includes('--help') || argv.length === 0) {
    return { command: 'help', write: false };
  }

  const [command, ...rest] = argv;
  if (command !== 'edit') {
    throw new Error(`Unknown command "${command}". Use --help.`);
  }

  const parsed: ParsedArgs = { command: 'edit', write: false };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    if (flag === '--write') {
      parsed.write = true;
      continue;
    }
    const value = rest[i + 1];
    if (flag === '--id' && value) {
      parsed.id = value;
      i += 1;
    } else if (flag === '--field' && value) {
      parsed.field = value;
      i += 1;
    } else if (flag === '--value' && value !== undefined) {
      parsed.value = value;
      i += 1;
    } else {
      throw new Error(`Unknown or incomplete argument "${flag}". Use --help.`);
    }
  }

  if (!parsed.id || !parsed.field || parsed.value === undefined) {
    throw new Error('Missing --id, --field or --value. Use --help.');
  }
  if (!ALLOWED_FIELDS.has(parsed.field)) {
    throw new Error(
      `Field "${parsed.field}" is not allowed in this prototype (${[...ALLOWED_FIELDS].join(', ')}).`
    );
  }

  return parsed;
}

function parseValue(field: string, raw: string): unknown {
  if (field === 'description') {
    return raw;
  }
  if (field === 'stock') {
    if (raw !== 'true' && raw !== 'false') {
      throw new Error('--value for stock must be true or false.');
    }
    return raw === 'true';
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--value for ${field} must be an integer.`);
  }
  return parsed;
}

export interface CatalogOpResult {
  exitCode: number;
  output: string;
  written: boolean;
}

export function runCatalogOp(
  argv: string[],
  { repoRoot = resolveRepoRoot() }: { repoRoot?: string } = {}
): CatalogOpResult {
  try {
    const args = parseArgs(argv);
    if (args.command === 'help') {
      return { exitCode: 0, output: HELP, written: false };
    }

    const catalogPath = resolve(repoRoot, 'data', 'product_data.json');
    const parsedCatalog = productCatalogSchema.safeParse(
      JSON.parse(readFileSync(catalogPath, 'utf8'))
    );
    if (!parsedCatalog.success) {
      return {
        exitCode: 1,
        output: `Invalid catalog: ${parsedCatalog.error.issues.map((issue) => issue.message).join('; ')}`,
        written: false,
      };
    }
    const catalog = parsedCatalog.data;

    const product = catalog.products.find((entry) => entry.id === args.id || entry.sku === args.id);
    if (!product) {
      return { exitCode: 1, output: `Product "${args.id}" not found`, written: false };
    }

    const before = { ...product };
    const service = new ProductService();
    service.enable();
    const result = service.edit(catalog, {
      entityId: args.id!,
      baseRevision: product.rev,
      changes: { [args.field!]: parseValue(args.field!, args.value!) } as never,
    });
    if (!result.ok) {
      return { exitCode: 1, output: result.error ?? 'Catalog edit failed', written: false };
    }

    const diff = {
      dry_run: !args.write,
      changed_fields: result.changedFields,
      before: {
        price: before.price,
        discount: before.discount,
        stock: before.stock,
        description: before.description,
        rev: before.rev,
      },
      after: {
        price: result.product?.price,
        discount: result.product?.discount,
        stock: result.product?.stock,
        description: result.product?.description,
        rev: result.product?.rev,
      },
      catalog: { rev: catalog.rev, last_updated: catalog.last_updated },
    };

    if (!args.write) {
      return { exitCode: 0, output: JSON.stringify(diff, null, 2), written: false };
    }

    writeJsonFileAtomic(catalogPath, catalog, { maxBackups: 10, filePrefix: 'product_data' });
    return { exitCode: 0, output: JSON.stringify(diff, null, 2), written: true };
  } catch (err) {
    return { exitCode: 1, output: (err as Error).message, written: false };
  }
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  const result = runCatalogOp(process.argv.slice(2));
  console.log(result.output);
  process.exit(result.exitCode);
}
