# PR Execution Plan

## Quick Wins (≤2h)
1. **Contrast bump for muted text** *(completed 2025-10-13)*  
   - Darken `.text-muted` to `#4a4f55`.  
   - Regression: verify contrast on product cards & footer.
2. **HTTPS enforcement for external CTAs** *(completed)*  
   - Ensure all `wa.me` / social links use explicit `https://`.
3. **Navbar breakpoint adjustment**  
   - Add `.navbar-nav` utility to wrap at `lg` and collapse earlier.

## 1–2 Days
1. **Catalog filter debounce + memoization** *(completed 2025-10-13)*  
   - Debounce keyup by 150 ms; cache normalized product array.  
   - Measure INP before/after using DevTools.
2. **Cart offcanvas focus trap** *(completed 2025-10-13)*  
   - Add `role="dialog"`, manage focus on open/close, trap Tab.  
   - Add Cypress accessibility regression.
3. **Image optimization pass**  
   - Introduce AVIF variants for hero & top SKUs, inline LQIP placeholder.

## 1–2 Weeks
1. **Product card markup refactor** *(completed 2025-10-14)*  
   - Remove nested interactive elements; adopt semantic buttons.  
   - Requires reworking cart logic + tests.
2. **Critical CSS pruning**  
   - Audit `critical.min.css` for unused rules; integrate PurgeCSS step guarded by tests.
3. **Structured canonical overhaul**  
   - Parameterize canonical + breadcrumbs per locale; update sitemap generator.
