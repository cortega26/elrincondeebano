# Changelog

All notable changes to this project will be documented in this file.
The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

- No unreleased changes.

## [1.3.0] - 2025-12-29

### Added

- Modular cart management with dynamic UI rendering and dedicated unit tests.
- Service worker runtime coverage plus expanded menu controller tests.
- Cart data normalization tests for storage IDs and stable ID generation.

### Changed

- Refactored cart logic across `cart.mjs` and `script.mjs`, including submit
  handling for multiple buttons.
- Updated README testing and coverage guidance.

### Fixed

- Empty-cart state now disables form elements to prevent invalid submissions.

## [1.2.1] - 2025-12-26

### Added

- Preview page (`preview.html`) and static copy support in the build step.
- Onboarding guide for local development setup.

### Changed

- CI workflows hardened with improved permissions, caching, concurrency, and
  diagnostics.
- Dependency upgrades across tooling (eslint 9, cypress 15, vitest 4,
  playwright 1.57, lighthouse 13, sharp 0.34, jsdom 27).
- Build determinism improvements and image pipeline tuning (sizes, srcset,
  thumbnail DPR alignment).
- Switched CSS/icon assets to local copies to remove external CDN reliance.
- Standardized Node 22 LTS across runtime configs and workflows.

### Fixed

- Codacy security scan now handles missing SARIF outputs and optional tokens
  gracefully.

## [1.2.0] - 2025-12-09

### Added

- Unified test runner combining legacy `node:test` and Vitest suites.
- Mutation testing via Stryker with coverage reporting.
- Expanded unit tests for cart helpers, product fetching, and product sync.
- Client-side utilities for logging, analytics, and image optimization.

### Changed

- PWA/service worker registration and build tooling updated alongside TypeScript
  config refinements.

## [1.1.0] - 2025-11-25

### Added

- Product manager module with admin panel UI, dialogs, and data storage support.
- Category catalog loading and navigation models integrated into build tooling.
- Font preloads and asset manifest generation for service worker precaching.

### Changed

- Product data versioning, pricing, and stock updates with inline data payloads.
- SEO metadata and image handling refactor, plus asset path normalization.
- Cloudflare image URL rewriting now gated by `CFIMG_DISABLE`/`CFIMG_ENABLE`.
- Dropdown navigation alignment tweaks and new menu entries.

### Fixed

- Validation and sanitization for product updates in the content manager.

## [1.0.3] - 2024-06-26

### Added

- Updated 404 page layout with responsive styling.
- New pricing typography and `.precio`/`.precio-descuento` styling.
- Product catalog refresh with new items, stock changes, and image updates.

### Changed

- Refactored `script.js` with strict mode and clearer product rendering/sorting.
- Cleaned up assets by removing unused scripts, styles, and legacy images.
- Adjusted product card spacing, margins, and description layout.

### Fixed

- Corrected 404 link targets for GitHub Pages paths.
- Removed line-clamp styles that truncated product titles/descriptions.

## [1.0.2] - 2024-06-22

### Added

- ARIA roles, meta descriptions, and favicon links across pages.
- Discount badge styling and price comparison visuals.
- New category pages (cervezas, vinos, piscos) and header refinements.

### Changed

- Migrated UI to Bootstrap 5.3.3, replacing jQuery/Popper with the bundle and
  updating form classes.
- Navbar and footer layout polish with updated typography and spacing.

### Fixed

- Price sorting now accounts for discounts when ordering products.

## [1.0.1] - 2024-06-10

### Added

- GitHub Pages deploy workflow (`.github/workflows/static.yml`) and removal of
  Netlify deployment paths.
- Initial routing cleanup for the new folder layout.

### Changed

- Restructured directories and updated asset paths after moving off `public/`.
- Normalized image routing for consistent path handling.

### Fixed

- Corrected broken image paths introduced by the hosting migration.

## [1.0.0] - 2024-06-08

### Added

- Initial static site with HTML, CSS, and client-side rendering.
- Product catalog data and basic filtering/sorting behavior.
