import type { Product, ProductCatalog } from '../../shared/schemas/product.ts';
import { productSchema } from '../../shared/schemas/product.ts';
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

    if (params.changes.name !== undefined && params.changes.name !== product.name) {
      product.name = params.changes.name;
      product.rev += 1;
      product.field_last_modified.name = {
        ts: now,
        by: 'admin',
        rev: product.rev,
        base_rev: params.baseRevision,
        changeset_id: null,
      };
      changedFields.push('name');
    }

    if (
      params.changes.description !== undefined &&
      params.changes.description !== product.description
    ) {
      product.description = params.changes.description;
      changedFields.push('description');
    }

    if (params.changes.price !== undefined && params.changes.price !== product.price) {
      product.price = params.changes.price;
      product.rev += 1;
      product.field_last_modified.price = {
        ts: now,
        by: 'admin',
        rev: product.rev,
        base_rev: params.baseRevision,
        changeset_id: null,
      };
      changedFields.push('price');
    }

    if (params.changes.discount !== undefined && params.changes.discount !== product.discount) {
      if (params.changes.discount > product.price) {
        return {
          ok: false,
          error: `Discount (${params.changes.discount}) cannot exceed price (${product.price})`,
          statusCode: 422,
        };
      }
      product.discount = params.changes.discount;
      changedFields.push('discount');
    }

    if (params.changes.stock !== undefined && params.changes.stock !== product.stock) {
      product.stock = params.changes.stock;
      changedFields.push('stock');
    }

    if (params.changes.category !== undefined && params.changes.category !== product.category) {
      product.category = params.changes.category;
      changedFields.push('category');
    }

    if (
      params.changes.image_path !== undefined &&
      params.changes.image_path !== product.image_path
    ) {
      product.image_path = params.changes.image_path;
      changedFields.push('image_path');
    }

    if (
      params.changes.image_avif_path !== undefined &&
      params.changes.image_avif_path !== product.image_avif_path
    ) {
      product.image_avif_path = params.changes.image_avif_path;
      changedFields.push('image_avif_path');
    }

    if (
      params.changes.is_archived !== undefined &&
      params.changes.is_archived !== product.is_archived
    ) {
      product.is_archived = params.changes.is_archived;
      product.rev += 1;
      changedFields.push('is_archived');
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
          const newDiscount = Math.round(product.price * (pct / 100));
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
      }
    }

    return { ok: true, changes };
  }

  bulkApply(
    catalog: ProductCatalog,
    operation: BulkOperation
  ): { ok: boolean; error?: string; changed: number; changes: BulkPreviewResult[] } {
    if (!this.enabled) {
      return { ok: false, error: 'Write operations are disabled', changed: 0, changes: [] };
    }

    const preview = this.bulkPreview(catalog, operation);
    if (!preview.ok) {
      return { ok: false, error: preview.error, changed: 0, changes: [] };
    }

    if (preview.changes.length === 0) {
      return { ok: false, error: 'No changes to apply', changed: 0, changes: [] };
    }

    const idSet = new Set(operation.product_ids);
    const products = catalog.products.filter((p) => p.id && idSet.has(p.id));
    const now = new Date().toISOString();

    for (const product of products) {
      switch (operation.action) {
        case 'set_discount_percent':
          product.discount = Math.round(product.price * ((operation.value as number) / 100));
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
      }
      product.rev += 1;
    }

    catalog.rev += 1;
    catalog.last_updated = now;

    return { ok: true, changed: products.length, changes: preview.changes };
  }
}
