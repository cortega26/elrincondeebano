# Engineering Priorities

Reference guide for the repository's non-functional expectations. Use this file
when a change is primarily about performance, scalability, maintainability, or
documentation quality rather than a single feature.

## Scope

These priorities apply to:

- storefront runtime changes in `astro-poc/` and `src/js/`;
- build and asset-pipeline work in `tools/` and `config/`;
- data-shape and taxonomy changes in `data/`;
- CI, release-gating, and doc-structure changes in `.github/`, `docs/`, and
  `package.json`.

## Performance

### Goals

1. Keep shopper-critical routes fast enough to preserve Core Web Vitals
   confidence.
2. Prefer build-time work over browser-time work.
3. Avoid shipping JavaScript, CSS, or image variants that the page does not
   need.

### Rules

- Prefer Astro/static rendering and island boundaries over adding new global
  browser runtime work.
- Treat image optimization, OG generation, and category normalization as
  preflight/build responsibilities, not runtime responsibilities.
- Reuse existing fetch, logging, and observability utilities instead of adding
  parallel client-side instrumentation paths.
- Any change that touches rendering, bundle composition, navigation, service
  worker behavior, or critical data fetches should be validated with
  `npm run lighthouse:audit` or documented equivalent evidence in the PR.

### Triage signals

- `LCP > 2.5s`, `INP > 200ms`, or `CLS > 0.1` should be treated as a
  performance regression signal, even before a formal incident.
- `slow_endpoint_detected` events and share-preview/build-time regressions
  should be investigated before release if they are introduced by the change.

## Scalability

### Goals

1. Keep the repo workable as the product catalog, image set, and test suite
   continue to grow.
2. Preserve deterministic builds and predictable CI even when input volume
   increases.

### Rules

- `data/` and `assets/` are source-of-truth inputs; new tooling must not create
  shadow copies or alternate write paths.
- Build and maintenance scripts should be idempotent, deterministic, and safe to
  rerun after interruption.
- Avoid algorithms that repeatedly scan the full catalog or image tree when a
  cached, indexed, or batched approach is practical.
- New checks added to CI should have a clear local reproduction path and should
  fit either the fast baseline (`npm run validate`) or the release gate
  (`npm run validate:release`).

### Scaling hotspots

Pay extra attention to:

- `data/product_data.json` growth and any code that loads or transforms the full
  catalog;
- `assets/images/` variant generation and orphan-asset detection;
- browser-test scope growth in `test/e2e-astro/` and `cypress/e2e/`;
- scheduled live monitors that depend on network or third-party edge behavior.

## Maintainability

### Goals

1. Make the default change path obvious and reversible.
2. Keep responsibilities narrow enough that future agents can modify one layer
   without relearning the entire repo.

### Rules

- Keep runtime, build-time, operational, and archival code paths clearly
  separated.
- Prefer extending existing commands and modules over creating near-duplicate
  entry points.
- New scripts must document their owner surface, validation expectations, and
  whether they are canonical, supplemental, or manual-only.
- Long-lived architectural constraints belong in ADRs and architecture docs, not
  only in PR descriptions or audit notes.
- Keep PRs small enough to preserve rollback clarity; if the change mixes
  behavior, tooling, and docs, split it unless the coupling is unavoidable.

## Documentation Quality

### Goals

1. Keep docs aligned with executable truth.
2. Make it easy for a new agent to find the right command and right owner path
   quickly.

### Required updates by change type

| Change type                              | Minimum doc updates                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| New canonical command or validation gate | `README.md`, `docs/START_HERE.md`, `docs/operations/VALIDATION_MATRIX.md`, and any affected runbook |
| New architectural constraint or boundary | ADR update plus `docs/architecture/CODEBASE_MAP.md` or `docs/repo/STRUCTURE.md`                     |
| New operational workflow                 | Relevant runbook in `docs/operations/` plus `docs/README.md` index                                  |
| Deprecated path or archived surface      | Archive/reference doc and all entry-point docs that still mention it                                |
| New script/tooling surface               | `package.json` or owning doc, `docs/repo/STRUCTURE.md`, and usage/validation guidance               |

### Doc-gardening rules

- Update docs in the same PR when changing behavior, commands, file ownership,
  or release expectations.
- Keep index docs short; move detail into focused docs and link back.
- Remove stale examples and obsolete command sequences instead of layering new
  text on top of them.
- If a decision is durable enough to surprise a future maintainer, capture it in
  an ADR or architecture doc.
