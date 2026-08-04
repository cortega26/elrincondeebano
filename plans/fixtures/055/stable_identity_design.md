# Plan 055 Phase 0.4: Stable content identity design

- Date: 2026-07-15
- Status: **Accepted**
- Part of: Plan 055 Phase 0 deliverables
- Carries forward: Plan 053 requirements

## Decision: UUIDv7 as stable identity

Each product receives an opaque immutable `id` field containing a time-sortable
UUIDv7 value. The ID is:

1. **Opaque**: it carries no semantic meaning (not a slug, not name-derived).
2. **Immutable**: once assigned, it never changes — not on rename, reorder, category
   change, import, or sync.
3. **Deterministic on first assignment**: generated once on creation; a deterministic
   dry-run can preview assignments but the real assignment is one-shot.
4. **Collision-safe**: UUIDv7 space is vast enough that collisions are not a
   practical concern; a dry-run report validates this before production.

### Why UUIDv7

- **Time-sortable**: coarse time ordering simplifies history views and partial sync
  without requiring a separate timestamp sort.
- **No central registry required**: each machine generates unique IDs independently.
- **Widely supported**: `crypto.randomUUID()` in Node 24, `uuid7` npm package,
  Python `uuid6` library.
- **Not a SKU, slug, or display label**: avoids confusing stable identity with
  business-facing identifiers.

## Identity migration

### Legacy identity compatibility

The existing identity mechanism (`normalize(name)::normalize(description)`) becomes a
**lookup alias**, not a primary key. The migration preserves:

- A read adapter that resolves legacy references to stable IDs.
- Existing bundle/item references, which use `{category, name}` pairs.
- Sync change history and conflict records keyed by legacy identity.

### Migration aliases

Each product gains an optional `legacy_aliases: string[]` field containing past
identity keys. The repository can resolve a legacy key to the current product
when the key is present in the aliases array. Aliases are:

- **Appended only** on identity-affecting changes (rename, desc change).
- **Never removed** during the migration window.
- **Retired** in a separate phase after all consumers are verified to use stable IDs.

### Collision handling

#### Dry-run collision report

Before any real ID assignment, a dry-run command generates:

1. All `normalize(name)::normalize(description)` pairs in the catalog.
2. Every pair mapped to a provisional UUIDv7.
3. A collision report showing duplicate normalized keys.

If the dry run finds two distinct products with identical normalized
name+description, the migration prompts for manual disambiguation. The report
indicates which fields differ (category, price, images) to aid the decision.

#### Production backfill

A controlled command assigns stable IDs to every product without an `id` field.
The operation:

1. Generates a UUIDv7 for each unassigned product.
2. Writes a migration record (`data/migration_001_stable_ids.json`) containing
   `{legacy_key, stable_id, product_name}` for every assignment.
3. Updates `data/product_data.json` with `id` fields and `legacy_aliases`.
4. Creates a pre-migration backup automatically.
5. Validates that no identity collision exists after assignment.

### Identity consumers update plan

| Consumer                        | Reference type                 | Migration action                                           |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------- |
| `models.py` Product             | `identity_key()` via name+desc | Add `id` field; `identity_key()` returns `id` if present   |
| `services.py` lookups           | name-based index               | Add `by_id` index; keep `by_legacy` for lookup             |
| `sync.py` queue/conflicts       | legacy identity string         | Migrate to `id`; accept both during transition             |
| `storefront_service.py` bundles | `{category, name}` pairs       | Resolve to `id` on load; store `id` in new bundles         |
| `productStore.js` (Node)        | `id` > `slug` > legacy         | Accept Python-assigned UUIDv7 as `id`                      |
| `catalog.ts` (Astro)            | `sku` > `id` > hash            | Accept `id` as `sku`-equivalent                            |
| `repositories.py`               | index by identity              | Dual index: `by_id` (primary) + `by_legacy_key` (fallback) |
| `history_store.py`              | per-product by legacy key      | Migrate existing entries; new entries use `id`             |

## Rollback

The migration record (`data/migration_001_stable_ids.json`) enables rollback:

1. Restore `data/product_data.json` from the pre-migration backup.
2. Bundles and sync entries written during the migration window may contain
   new-style IDs; these are discarded or reverted manually.
3. If the TypeScript manager was already writing with IDs, revert to the
   Python manager and re-export from the backup.

The `id` field is additive. Removing it from the model and reverting to
`identity_key()` as primary is a code-only rollback — no data migration needed —
as long as no dependent consumer was deployed.

## Verification gates

- [x] Identity format named and documented.
- [x] Migration aliases defined (legacy_aliases array).
- [x] Collision handling specified (dry-run + manual disambiguation).
- [x] Consumer update plan covers all managers, sync, Astro, and storefront.
- [x] Rollback path documented.
- [ ] Dry-run implementation (Phase 3 deliverable).
- [ ] Production backfill command (Phase 3 deliverable).
- [ ] All manager references migrated (Phase 3–6 deliverables).
