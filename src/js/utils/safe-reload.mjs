export function safeReload() {
  try {
    if (typeof window === 'undefined') return;
    const ua = window.navigator?.userAgent || '';
    if (/jsdom/i.test(ua)) return;
    const reloadFn = window.location && window.location.reload;
    if (typeof reloadFn === 'function') {
      reloadFn.call(window.location);
    }
  } catch (error) {
    // Ignore reload failures in restricted environments.
  }
}
