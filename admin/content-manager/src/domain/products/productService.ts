import type { Product, ProductCatalog } from '../../shared/schemas/product.ts';
import { productSchema, productReadSchema } from '../../shared/schemas/product.ts';
import { generateProductId } from '../../shared/identity.ts';

export interface CreateProductInput {
  name: string;
  description?: string;
  price: number;
  discount?: number;
  stock?: boolean;
  category?: string;
  image_path?: string;
  image_avif_path?: string;
}

export interface EditProductInput {
  name?: string;
  description?: string;
  price?: number;
  discount?: number;
  stock?: boolean;
  category?: string;
  image_path?: string;
  image_avif_path?: string;
  is_archived?: boolean;
}

export interface EditProductParams {
  entityId: string;
  baseRevision: number;
  changes: EditProductInput;
}

export interface BulkOperation {
  action:
    | 'set_discount_percent'
    | 'set_discount_fixed'
    | 'set_stock'
    | 'set_price_delta_percent'
    | 'set_category';
  value: number | boolean | string;
  product_ids: string[];
}

export interface BulkPreviewResult {
  product_id: string;
  name: string;
  field: string;
  old_value: number | boolean | string;
  new_value: number | boolean | string;
}

export interface ProductServiceResult {
  ok: boolean;
  error?: string;
  statusCode: number;
  product?: Product;
  changedFields?: string[];
}

// Plan 194: the editable product fields in single-edit application order
// (price before discount — the guards below depend on it). Adding a product
// field means one row here (plus types/schemas), not a tenth copy of the
// rev/metadata block.
type EditableProductField =
  | 'name'
  | 'description'
  | 'price'
  | 'discount'
  | 'stock'
  | 'category'
  | 'image_path'
  | 'image_avif_path'
  | 'is_archived';

const EDITABLE_FIELDS: EditableProductField[] = [
  'name',
  'description',
  'price',
  'discount',
  'stock',
  'category',
  'image_path',
  'image_avif_path',
  'is_archived',
];

type EditableValue = NonNullable<EditProductInput[EditableProductField]>;

// Plan 194: per-field guards that can reject the whole edit. Runs in
// EDITABLE_FIELDS order against the partially-mutated product — exactly the
// old branch behavior (a simultaneous price-down + discount-down edit sees
// the new discount in the price guard and the new price in the discount
// guard). Returns the rejection message or null.
function validateEditField(
  field: EditableProductField,
  product: Product,
  changes: EditProductInput
): string | null {
  if (field === 'price') {
    const price = changes.price;
    // A discount also changing in this same request takes precedence over
    // the stale stored value — otherwise a valid simultaneous
    // price-down + discount-down edit would be rejected here even though
    // the discount branch below would accept it.
    const effectiveDiscount = changes.discount !== undefined ? changes.discount : product.discount;
    if (price !== undefined && effectiveDiscount > price) {
      return `Price (${price}) cannot be lower than discount (${effectiveDiscount})`;
    }
    return null;
  }
  if (field === 'discount') {
    const discount = changes.discount;
    if (discount !== undefined && discount > product.price) {
      return `Discount (${discount}) cannot exceed price (${product.price})`;
    }
    return null;
  }
  return null;
}

// Plan 194: bulk action → mutated scalar, shared by single-edit-adjacent
// bulkApply instead of a second switch-to-field mapping.
export const BULK_ACTION_FIELD: Record<
  BulkOperation['action'],
  'price' | 'discount' | 'stock' | 'category'
> = {
  set_stock: 'stock',
  set_category: 'category',
  set_discount_percent: 'discount',
  set_discount_fixed: 'discount',
  set_price_delta_percent: 'price',
};

export class ProductService {
  private enabled = false;

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  create(catalog: ProductCatalog, input: CreateProductInput): ProductServiceResult {
    if (!this.enabled) {
      return { ok: false, error: 'Write operations are disabled', statusCode: 403 };
    }

    const now = new Date().toISOString();

    const nextOrder =
      catalog.products.length > 0 ? Math.max(...catalog.products.map((p) => p.order)) + 1 : 0;

    const raw = {
      name: input.name,
      description: input.description ?? '',
      price: input.price,
      discount: input.discount ?? 0,
      stock: input.stock ?? false,
      category: input.category ?? '',
      image_path: input.image_path ?? '',
      image_avif_path: input.image_avif_path ?? '',
      order: nextOrder,
      is_archived: false,
      rev: 1,
      field_last_modified: {
        name: {
          ts: now,
          by: 'admin',
          rev: 1,
          base_rev: 0,
          changeset_id: null,
        },
      },
      id: generateProductId(),
    };

    const result = productSchema.safeParse(raw);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('; ');
      return { ok: false, error: messages, statusCode: 422 };
    }

    catalog.products.push(result.data);
    catalog.rev += 1;
    catalog.last_updated = now;

    return {
      ok: true,
      statusCode: 201,
      product: result.data,
      changedFields: [
        'name',
        'description',
        'price',
        'discount',
        'stock',
        'category',
        'image_path',
        'image_avif_path',
        'id',
      ],
    };
  }

  edit(catalog: ProductCatalog, params: EditProductParams): ProductServiceResult {
    if (!this.enabled) {
      return { ok: false, error: 'Write operations are disabled', statusCode: 403 };
    }

    const product = catalog.products.find(
      (p) => p.id === params.entityId || p.sku === params.entityId
    );

    if (!product) {
      return { ok: false, error: `Product "${params.entityId}" not found`, statusCode: 404 };
    }

    if (product.rev !== params.baseRevision) {
      return {
        ok: false,
        error: `Stale revision: expected ${product.rev}, got ${params.baseRevision}`,
        statusCode: 409,
      };
    }

    const now = new Date().toISOString();
    const changedFields: string[] = [];

    // Plan 100: validate field-level constraints on the prospective product
    // BEFORE mutating — a rejected edit must leave the (possibly shared)
    // catalog object untouched. Cross-field invariants (discount vs price)
    // stay in the bespoke guards below and the final productSchema check.
    const definedChanges = Object.fromEntries(
      Object.entries(params.changes).filter(([, value]) => value !== undefined)
    );
    const prospective = { ...product, ...definedChanges };
    const prospectiveValidation = productReadSchema.safeParse(prospective);
    if (!prospectiveValidation.success) {
      const messages = prospectiveValidation.error.issues.map((i) => i.message).join('; ');
      return { ok: false, error: messages, statusCode: 422 };
    }

    // Plan 194: table-driven application (EDITABLE_FIELDS order = the old
    // branch order). Guards run via validateEditField before each mutation.
    const editable = product as unknown as Record<EditableProductField, EditableValue>;
    for (const field of EDITABLE_FIELDS) {
      const next = params.changes[field] as EditableValue | undefined;
      if (next === undefined || next === editable[field]) {
        continue;
      }
      const violation = validateEditField(field, product, params.changes);
      if (violation !== null) {
        return { ok: false, error: violation, statusCode: 422 };
      }
      editable[field] = next;
      product.rev += 1;
      product.field_last_modified[field] = {
        ts: now,
        by: 'admin',
        rev: product.rev,
        base_rev: params.baseRevision,
        changeset_id: null,
      };
      changedFields.push(field);
    }

    const validation = productSchema.safeParse(product);
    if (!validation.success) {
      const messages = validation.error.issues.map((i) => i.message).join('; ');
      return { ok: false, error: messages, statusCode: 422 };
    }

    catalog.rev += 1;
    catalog.last_updated = now;

    return {
      ok: true,
      statusCode: 200,
      product,
      changedFields,
    };
  }

  reorder(
    catalog: ProductCatalog,
    orderedIds: string[]
  ): { ok: boolean; error?: string; reordered: number } {
    if (!this.enabled) {
      return { ok: false, error: 'Write operations are disabled', reordered: 0 };
    }

    const idSet = new Set(orderedIds);
    let reordered = 0;

    for (let i = 0; i < catalog.products.length; i++) {
      const product = catalog.products[i];
      if (!product.id || !idSet.has(product.id)) {
        continue;
      }
      const newOrder = orderedIds.indexOf(product.id);
      if (newOrder !== -1 && product.order !== newOrder) {
        product.order = newOrder;
        product.rev += 1;
        reordered += 1;
      }
    }

    if (reordered === 0) {
      return { ok: false, error: 'No products were reordered', reordered: 0 };
    }

    catalog.rev += 1;
    catalog.last_updated = new Date().toISOString();

    return { ok: true, reordered };
  }

  bulkPreview(
    catalog: ProductCatalog,
    operation: BulkOperation
  ): { ok: boolean; error?: string; changes: BulkPreviewResult[] } {
    const changes: BulkPreviewResult[] = [];
    const idSet = new Set(operation.product_ids);

    const targets = catalog.products.filter((p) => p.id && idSet.has(p.id));
    if (targets.length === 0) {
      return { ok: false, error: 'No matching products found', changes: [] };
    }

    for (const product of targets) {
      switch (operation.action) {
        case 'set_discount_percent': {
          const pct = operation.value as number;
          const newDiscount = Math.min(product.price, Math.round(product.price * (pct / 100)));
          if (newDiscount !== product.discount) {
            changes.push({
              product_id: product.id!,
              name: product.name,
              field: 'discount',
              old_value: product.discount,
              new_value: newDiscount,
            });
          }
          break;
        }
        case 'set_discount_fixed': {
          const val = operation.value as number;
          if (val !== product.discount) {
            if (val > product.price) {
              return {
                ok: false,
                error: `Discount ${val} exceeds price ${product.price} for "${product.name}"`,
                changes: [],
              };
            }
            changes.push({
              product_id: product.id!,
              name: product.name,
              field: 'discount',
              old_value: product.discount,
              new_value: val,
            });
          }
          break;
        }
        case 'set_stock': {
          const val = operation.value as boolean;
          if (val !== product.stock) {
            changes.push({
              product_id: product.id!,
              name: product.name,
              field: 'stock',
              old_value: product.stock,
              new_value: val,
            });
          }
          break;
        }
        case 'set_price_delta_percent': {
          const pct = operation.value as number;
          const newPrice = Math.round(product.price * (1 + pct / 100));
          if (newPrice !== product.price && newPrice > 0) {
            changes.push({
              product_id: product.id!,
              name: product.name,
              field: 'price',
              old_value: product.price,
              new_value: newPrice,
            });
          }
          break;
        }
        case 'set_category': {
          const val = (operation.value as string).trim();
          if (val && val !== product.category) {
            changes.push({
              product_id: product.id!,
              name: product.name,
              field: 'category',
              old_value: product.category,
              new_value: val,
            });
          }
          break;
        }
        default: {
          // Plan 172: unknown actions must fail loudly — falling through
          // would return a misleading ok:true with zero changes.
          return {
            ok: false,
            error: `Unknown bulk action "${String(operation.action)}"`,
            changes: [],
          };
        }
      }
    }

    return { ok: true, changes };
  }

  bulkApply(
    catalog: ProductCatalog,
    operation: BulkOperation
  ): {
    ok: boolean;
    error?: string;
    changed: number;
    skipped: number;
    changes: BulkPreviewResult[];
  } {
    if (!this.enabled) {
      return {
        ok: false,
        error: 'Write operations are disabled',
        changed: 0,
        skipped: 0,
        changes: [],
      };
    }

    const preview = this.bulkPreview(catalog, operation);
    if (!preview.ok) {
      return { ok: false, error: preview.error, changed: 0, skipped: 0, changes: [] };
    }

    if (preview.changes.length === 0) {
      return { ok: false, error: 'No changes to apply', changed: 0, skipped: 0, changes: [] };
    }

    const idSet = new Set(operation.product_ids);
    // Plan 102: apply only the products the preview actually changed — a
    // no-op (same discount %, same stock, delta 0) must not bump rev or
    // inflate the report; preview count and applied count stay identical.
    const changedIds = new Set(preview.changes.map((c) => c.product_id));
    const products = catalog.products.filter(
      (p) => p.id && idSet.has(p.id) && changedIds.has(p.id)
    );
    const now = new Date().toISOString();
    let changed = 0;
    let skipped = 0;

    // Plan 172: the mutated scalar per action — resolved up front so a
    // schema-rejected mutation can be reverted exactly (scalar + rev +
    // history metadata) instead of persisting catalog-bricking state.
    // Plan 194: shared BULK_ACTION_FIELD map (single source with edit's
    // field table) instead of a second switch-to-field mapping.
    const field = BULK_ACTION_FIELD[operation.action];

    for (const product of products) {
      const mutable = product as unknown as Record<typeof field, number | boolean | string>;
      const prevScalar = mutable[field];
      const prevRev = product.rev;
      const prevMeta = product.field_last_modified[field];
      switch (operation.action) {
        case 'set_discount_percent':
          product.discount = Math.min(
            product.price,
            Math.round(product.price * ((operation.value as number) / 100))
          );
          break;
        case 'set_discount_fixed': {
          const val = operation.value as number;
          if (val > product.price) continue;
          product.discount = val;
          break;
        }
        case 'set_stock':
          product.stock = operation.value as boolean;
          break;
        case 'set_price_delta_percent': {
          const newPrice = Math.round(product.price * (1 + (operation.value as number) / 100));
          if (newPrice <= 0) continue;
          product.price = newPrice;
          break;
        }
        case 'set_category': {
          const cat = (operation.value as string).trim();
          if (!cat) continue;
          product.category = cat;
          break;
        }
        default: {
          return {
            ok: false,
            error: `Unknown bulk action "${String(operation.action)}"`,
            changed,
            skipped,
            changes: [],
          };
        }
      }
      // Plan 172: never persist schema-invalid state (e.g. a NaN discount
      // serializes to null and bricks the next catalog load) — revert the
      // product exactly and report it as skipped instead of changed.
      if (!productSchema.safeParse(product).success) {
        mutable[field] = prevScalar;
        product.rev = prevRev;
        if (prevMeta === undefined) {
          delete product.field_last_modified[field];
        } else {
          product.field_last_modified[field] = prevMeta;
        }
        skipped += 1;
        continue;
      }
      product.rev += 1;
      // Plan 059: bulk mutations record the same revision metadata as
      // single edits so history/undo stay consistent across paths.
      product.field_last_modified[field] = {
        ts: now,
        by: 'bulk',
        rev: product.rev,
        base_rev: product.rev - 1,
        changeset_id: null,
      };
      // Plan 088: count only products actually mutated — skips (discount >
      // price, price <= 0, empty category) must not inflate the report.
      changed += 1;
    }

    catalog.rev += 1;
    catalog.last_updated = now;

    return { ok: true, changed, skipped, changes: preview.changes };
  }
}
