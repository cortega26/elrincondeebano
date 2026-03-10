import { log } from '../utils/logger.mts';

// Lightweight performance hooks (migrated from csp.js)
export function setupPerformanceOptimizations() {
  try {
    // Native lazy-loading for images where missing
    if ('loading' in HTMLImageElement.prototype) {
      document.querySelectorAll('img:not([loading])').forEach((img) => {
        img.loading = 'lazy';
      });
    }
  } catch (error) {
    log('warn', 'performance_optimizations_setup_failed', { error });
  }
}
