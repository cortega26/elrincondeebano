# Category Registry Contract

`data/category_registry.json` is the versioned source of truth for storefront taxonomy identity.

## Identity vs Presentation

- Identity (stable): `id`, `key`
- Routing (stable in phases 1-3): `slug`
- Presentation (safe to change): `display_name`, `nav_group`, `sort_order`

## Invariants

1. `id`, `key`, and `slug` must be unique across categories.
2. Product records in `data/product_data.json` must reference existing category `key` values.
3. Storefront filtering must use category key (`data-category-key`) instead of visible labels.
4. `categories.json` remains as a legacy-compat catalog and is synchronized from the same source data.

## Validation

Run:

```bash
npm run validate:categories
```

The validator checks registry uniqueness and product-category references.

## Rollback

If taxonomy changes cause regressions:

1. Revert the commit that modified `data/category_registry.json` and taxonomy consumers.
2. Rebuild (`npm run build`) and re-run tests.
3. Confirm sitemap/category page snapshots return to baseline before redeploy.
