// Lightweight performance hooks (migrated from csp.js)
export function setupPerformanceOptimizations() {
  try {
    // Native lazy-loading for images where missing
    if ('loading' in HTMLImageElement.prototype) {
      document.querySelectorAll('img:not([loading])').forEach((img) => {
        img.loading = 'lazy';
      });
    }
  } catch (e) {
    console.warn('[modules/perf] setupPerformanceOptimizations error:', e);
  }
}
