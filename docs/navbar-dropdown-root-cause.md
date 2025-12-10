# Navbar dropdown root cause

- `src/js/modules/bootstrap.mjs` (pre-fix lines 95-120) bound `[data-bs-toggle="dropdown"]` clicks to `instance.toggle()` without the originating event and without halting propagation, so Bootstrap's outside-click handler processed the same first tap as a close and collapsed the menu instantly.
- Category pages (e.g., `pages/energeticaseisotonicas.html` lines 193-195) loaded `@popperjs/core` plus `bootstrap.min.js` alongside our bundle, registering a second dropdown listener that retriggered the close on that first click across home and sub-pages.
