const DEFAULT_PRODUCT_DATA_PATH = '/data/product_data.json';
const META_BASE_URL_NAME = 'data-base-url';

const getWindowOrigin = () => {
  if (typeof window === 'undefined' || !window.location) {
    return null;
  }
  return window.location.origin || null;
};

const readMetaBaseUrl = () => {
  if (typeof document === 'undefined') {
    return null;
  }
  const meta = document.querySelector(`meta[name="${META_BASE_URL_NAME}"]`);
  const content = meta?.getAttribute('content');
  if (!content) {
    return null;
  }
  const trimmed = content.trim();
  return trimmed ? trimmed : null;
};

const normaliseAllowlist = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
};

const getCrossOriginAllowlist = () => {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw =
    window.__DATA_ORIGIN_ALLOWLIST__ ||
    window.__DATA_HOST_ALLOWLIST__ ||
    window.__DATA_ORIGIN_ALLOWLIST ||
    window.__DATA_HOST_ALLOWLIST ||
    '';
  return normaliseAllowlist(raw);
};

const isCrossOriginAllowed = (url) => {
  if (typeof window === 'undefined') {
    return false;
  }
  if (window.__ALLOW_CROSS_ORIGIN_DATA__ !== true) {
    return false;
  }
  const allowlist = getCrossOriginAllowlist();
  if (!allowlist.length) {
    return false;
  }
  return allowlist.some((entry) => {
    if (!entry) return false;
    if (entry.includes('://')) {
      return entry === url.origin;
    }
    return entry === url.hostname;
  });
};

const buildCandidateUrl = (baseUrl) => {
  if (!baseUrl) return DEFAULT_PRODUCT_DATA_PATH;
  const trimmed = String(baseUrl).trim();
  if (!trimmed) return DEFAULT_PRODUCT_DATA_PATH;
  const hasJson = /product_data\.json(?:[?#]|$)/i.test(trimmed);
  if (hasJson) {
    return trimmed;
  }
  const suffix = trimmed.endsWith('/') ? '' : '/';
  return `${trimmed}${suffix}data/product_data.json`;
};

export const validateProductDataUrl = (url) => {
  const origin = getWindowOrigin();
  if (!origin) {
    return String(url);
  }
  const parsed = new URL(url, origin);
  const sameOrigin = parsed.origin === origin;
  if (!sameOrigin && !isCrossOriginAllowed(parsed)) {
    throw new Error('Invalid request URL: only same-origin HTTPS requests are allowed');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Invalid request URL: only same-origin HTTPS requests are allowed');
  }
  return parsed.toString();
};

export const resolveProductDataUrl = ({ version, baseUrl } = {}) => {
  const origin = getWindowOrigin();
  const override =
    baseUrl ||
    (typeof window !== 'undefined' ? window.__DATA_BASE_URL__ : null) ||
    readMetaBaseUrl();
  const candidate = buildCandidateUrl(override);

  if (!origin) {
    if (!version) {
      return candidate;
    }
    const sep = candidate.includes('?') ? '&' : '?';
    return `${candidate}${sep}v=${encodeURIComponent(version)}`;
  }

  const resolved = new URL(candidate, origin);
  if (version) {
    resolved.searchParams.set('v', version);
  }
  return validateProductDataUrl(resolved.toString());
};
