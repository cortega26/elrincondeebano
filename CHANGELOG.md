# Changelog

## [Unreleased]
### Changed
- Migrated CI workflows to Node.js 20 LTS and documented the new baseline.
- Added a test bootstrap (`test/setup-globals.js`) that polyfills Web APIs such as
  `File` when running unit tests on Node 18, keeping local development unblocked.
