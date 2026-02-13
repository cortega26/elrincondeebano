import { log } from '../utils/logger.mts';

const DEFAULT_SLOW_ENDPOINT_MS = 1200;
const MAX_SLOW_ENDPOINT_ENTRIES = 50;

const state = {
  initialized: false,
  enabled: false,
  slowEndpointMs: DEFAULT_SLOW_ENDPOINT_MS,
  webVitals: {
    lcp: null,
    cls: 0,
    inp: null,
  },
  errors: {
    total: 0,
    runtime: 0,
    unhandledRejection: 0,
  },
  endpoints: {
    total: 0,
    slow: [],
  },
};

let cleanupHandlers = [];

function sanitizeUrlPath(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return 'unknown';
  }
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
    return parsed.pathname || '/';
  } catch {
    return 'unknown';
  }
}

function cleanup() {
  cleanupHandlers.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore cleanup failures
    }
  });
  cleanupHandlers = [];
}

function pushSlowEndpoint(entry) {
  state.endpoints.slow.push(entry);
  if (state.endpoints.slow.length > MAX_SLOW_ENDPOINT_ENTRIES) {
    state.endpoints.slow.splice(0, state.endpoints.slow.length - MAX_SLOW_ENDPOINT_ENTRIES);
  }
}

function snapshotVitals() {
  if (!state.enabled) {
    return;
  }
  log('info', 'web_vitals_snapshot', {
    lcp: state.webVitals.lcp,
    cls: Number(state.webVitals.cls.toFixed(4)),
    inp: state.webVitals.inp,
  });
}

function observeWebVitals() {
  if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') {
    return;
  }

  const observers = [];
  const registerObserver = (type, onEntry) => {
    try {
      const observer = new PerformanceObserver((entryList) => {
        const entries = entryList.getEntries();
        entries.forEach(onEntry);
      });
      observer.observe({ type, buffered: true });
      observers.push(observer);
    } catch {
      // Ignore unsupported metric types on older browsers.
    }
  };

  registerObserver('largest-contentful-paint', (entry) => {
    if (!entry || typeof entry.startTime !== 'number') {
      return;
    }
    state.webVitals.lcp = Math.round(entry.startTime);
  });

  registerObserver('layout-shift', (entry) => {
    if (!entry || entry.hadRecentInput || typeof entry.value !== 'number') {
      return;
    }
    state.webVitals.cls += entry.value;
  });

  registerObserver('event', (entry) => {
    if (!entry || typeof entry.duration !== 'number') {
      return;
    }
    if (entry.interactionId === 0) {
      return;
    }
    const rounded = Math.round(entry.duration);
    if (state.webVitals.inp === null || rounded > state.webVitals.inp) {
      state.webVitals.inp = rounded;
    }
  });

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      snapshotVitals();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  cleanupHandlers.push(() => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    observers.forEach((observer) => {
      try {
        observer.disconnect();
      } catch {
        // ignore disconnect failures
      }
    });
  });
}

function observeErrorRate() {
  if (typeof window === 'undefined') {
    return;
  }

  const onRuntimeError = () => {
    if (!state.enabled) {
      return;
    }
    state.errors.total += 1;
    state.errors.runtime += 1;
  };

  const onUnhandledRejection = () => {
    if (!state.enabled) {
      return;
    }
    state.errors.total += 1;
    state.errors.unhandledRejection += 1;
  };

  window.addEventListener('error', onRuntimeError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);
  cleanupHandlers.push(() => {
    window.removeEventListener('error', onRuntimeError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  });
}

function isDisabledByFlag() {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const value = window.localStorage?.getItem('ebano-observability-disabled');
    return String(value).toLowerCase() === 'true';
  } catch {
    return false;
  }
}

export function initObservability(options = {}) {
  const enabledByOption = options.enabled !== false;
  const enabled = enabledByOption && !isDisabledByFlag();
  const threshold = Number.isFinite(options.slowEndpointMs)
    ? Math.max(100, Math.floor(options.slowEndpointMs))
    : DEFAULT_SLOW_ENDPOINT_MS;

  state.enabled = enabled;
  state.slowEndpointMs = threshold;

  if (state.initialized) {
    return getObservabilitySnapshot();
  }

  state.initialized = true;
  if (!enabled) {
    return getObservabilitySnapshot();
  }

  observeWebVitals();
  observeErrorRate();
  log('info', 'observability_initialized', {
    slowEndpointMs: state.slowEndpointMs,
    webVitals: true,
    errorRate: true,
    endpointLatency: true,
  });
  return getObservabilitySnapshot();
}

export function recordEndpointMetric({
  name = 'endpoint',
  url = '',
  method = 'GET',
  status = null,
  durationMs = 0,
} = {}) {
  if (!state.enabled) {
    return;
  }

  const numericDuration = Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0;
  state.endpoints.total += 1;

  if (numericDuration < state.slowEndpointMs) {
    return;
  }

  const entry = {
    name,
    method: String(method || 'GET').toUpperCase(),
    path: sanitizeUrlPath(url),
    status: Number.isFinite(status) ? status : null,
    durationMs: numericDuration,
    timestamp: new Date().toISOString(),
  };
  pushSlowEndpoint(entry);
  log('warn', 'slow_endpoint_detected', {
    thresholdMs: state.slowEndpointMs,
    ...entry,
  });
}

export function getObservabilitySnapshot() {
  return {
    initialized: state.initialized,
    enabled: state.enabled,
    slowEndpointMs: state.slowEndpointMs,
    webVitals: {
      lcp: state.webVitals.lcp,
      cls: state.webVitals.cls,
      inp: state.webVitals.inp,
    },
    errors: {
      total: state.errors.total,
      runtime: state.errors.runtime,
      unhandledRejection: state.errors.unhandledRejection,
    },
    endpoints: {
      total: state.endpoints.total,
      slow: [...state.endpoints.slow],
    },
  };
}

export function __resetObservabilityForTest() {
  cleanup();
  state.initialized = false;
  state.enabled = false;
  state.slowEndpointMs = DEFAULT_SLOW_ENDPOINT_MS;
  state.webVitals.lcp = null;
  state.webVitals.cls = 0;
  state.webVitals.inp = null;
  state.errors.total = 0;
  state.errors.runtime = 0;
  state.errors.unhandledRejection = 0;
  state.endpoints.total = 0;
  state.endpoints.slow = [];
}
