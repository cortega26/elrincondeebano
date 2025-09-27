// Minimal analytics module with consent and sampling (opt-in)
import { log, createCorrelationId } from '../utils/logger.mjs';

let enabled = false;
let consentRequired = true;
let sampleRate = 1.0;

export function initAnalytics(opts = {}) {
  enabled = Boolean(opts.enabled);
  consentRequired = opts.consentRequired !== false;
  sampleRate = Number.isFinite(opts.sampleRate) ? Math.max(0, Math.min(1, opts.sampleRate)) : 1.0;
}

function hasConsent() {
  try {
    const v = (localStorage && localStorage.getItem('consent_analytics')) || '';
    return String(v).toLowerCase() === 'granted';
  } catch { return false; }
}

function sampledIn() {
  if (sampleRate >= 1) return true;
  return Math.random() < sampleRate;
}

export function track(eventName, properties = {}) {
  if (!enabled) return false;
  if (consentRequired && !hasConsent()) return false;
  if (!sampledIn()) return false;
  const id = createCorrelationId();
  log('info', 'analytics_event', { id, event: eventName, props: properties });
  return true;
}

