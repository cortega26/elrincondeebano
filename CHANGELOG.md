# Changelog

## [Unreleased]

### Changed

- Migrated all tooling hints and CI workflows to Node.js 22 LTS, documenting the
  new baseline across README, AGENTS and runtime config files.
- Added a test bootstrap (`test/setup-globals.js`) that polyfills Web APIs such as
  `File` when running unit tests on Node 20, keeping local development unblocked.
