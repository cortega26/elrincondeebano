# Streamlit/SQLite Admin Archive Notice

- Date: 2026-07-16
- Decision: ADR 0009 (Catalog Data Authority)

## What is retired

The Streamlit-based web admin (`admin/web/app.py`) and its SQLite store
(`data/storefront.db`) are retired as active components.

## Why

ADR 0009 named `data/product_data.json` as the single authoritative product catalog
and declared `data/storefront.db` a non-authoritative prototype artifact.

The TypeScript Content Manager (`admin/content-manager/`) now serves as the
replacement for all admin workflows.

## Files affected

| File/Dir                              | Action                  | Rationale                                                    |
| ------------------------------------- | ----------------------- | ------------------------------------------------------------ |
| `admin/web/`                          | Archive                 | Streamlit prototype, replaced by Content Manager             |
| `data/storefront.db`                  | Delete from active tree | Non-authoritative prototype store                            |
| `admin/product_manager/data_store.py` | Keep (archived)         | SKU-based model, no active consumers; retained for reference |

## What remains active

The Python Tkinter Content Manager (`admin/product_manager/`) remains active as
the fallback during the transition window. It will be retired in Phase 12.2 after
the agreed fallback window expires and maintainer approval is recorded.

## Rollback

To undo the Streamlit retirement:

1. Restore `admin/web/` from archive
2. Re-install Streamlit requirements
3. Remove the TypeScript manager workspace

No data migration is required.
