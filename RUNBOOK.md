# Runbook

## Product data fetch failures
- **Severity:** warning
- **Logs:** `fetch_products_failure` with a `correlationId`.
- **Steps:**
  1. Verify network connectivity to `/data/product_data.json`.
  2. Check recent deployments for schema changes.
  3. Retry after backoff; persistent failures escalate to infrastructure.
  4. Remember that only the first catalog batch is inlined in `#product-data`; the rest streams from `/data/product_data.json`. Confirm the JSON endpoint is cached by the service worker (`ebano-products-*` cache) for offline support.
