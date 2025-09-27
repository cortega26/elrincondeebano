import { record as auditRecord } from '../utils/audit.mjs';

const CONSENT_KEYS = Object.freeze({ analytics: 'consent_analytics' });

export function getConsent(area = 'analytics') {
  const key = CONSENT_KEYS[area] || area;
  try { return globalThis.localStorage?.getItem(key) || null; } catch { return null; }
}

export function setConsent(area = 'analytics', value = 'denied') {
  const key = CONSENT_KEYS[area] || area;
  try { globalThis.localStorage?.setItem(key, String(value)); } catch {}
  auditRecord('consent_changed', { area, value: String(value) });
  try { globalThis.dispatchEvent?.(new Event('consentchange')); } catch {}
  return true;
}

export async function erasePersonalData(opts = {}) {
  const options = { invalidateCaches: true, ...opts };
  const cleared = [];
  try {
    if (globalThis.localStorage) {
      ['cart', CONSENT_KEYS.analytics, 'audit_log'].forEach(k => {
        try { if (globalThis.localStorage.getItem(k) != null) cleared.push(k); } catch {}
        try { globalThis.localStorage.removeItem(k); } catch {}
      });
    }
  } catch {}

  let swResult = null;
  if (options.invalidateCaches && typeof navigator !== 'undefined' && navigator.serviceWorker?.controller) {
    swResult = await postToServiceWorker('INVALIDATE_ALL_CACHES').catch(() => null);
  }
  auditRecord('data_erasure', { cleared, sw: Boolean(swResult) });
  return { cleared, sw: swResult };
}

function postToServiceWorker(type, payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      const msg = { type, ...payload };
      const channel = new MessageChannel();
      const timeout = setTimeout(() => reject(new Error('timeout')), 3000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        if (event.data && event.data.error) return reject(new Error(event.data.error));
        resolve(event.data || { ok: true });
      };
      navigator.serviceWorker.controller.postMessage(msg, [channel.port2]);
    } catch (e) { reject(e); }
  });
}

