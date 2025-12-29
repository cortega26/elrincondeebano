import { cfimg, CFIMG_THUMB } from './cfimg.mjs';

const PRODUCT_IMAGE_WIDTHS = Object.freeze([200, 320, 400]);
const STATIC_SRC_DESCRIPTOR_KEYS = Object.freeze(['descriptor', 'd']);

export const normaliseAssetPath = (value = '') => {
  if (!value) {
    return '';
  }
  const trimmed = value.startsWith('/') ? value.slice(1) : value;
  return `/${trimmed}`;
};

const encodeStaticPath = (path) => {
  if (!path) {
    return '';
  }
  try {
    return encodeURI(path);
  } catch (_err) {
    return path;
  }
};

export const buildCfSrc = (assetPath, extraOpts = {}) => {
  const normalised = normaliseAssetPath(assetPath);
  if (!normalised) {
    return '';
  }
  return cfimg(normalised, { ...CFIMG_THUMB, ...extraOpts });
};

export const buildCfSrcset = (assetPath, extraOpts = {}, widths = PRODUCT_IMAGE_WIDTHS) => {
  const normalised = normaliseAssetPath(assetPath);
  if (!normalised) {
    return '';
  }
  return widths
    .map((width) => `${cfimg(normalised, { ...CFIMG_THUMB, width, ...extraOpts })} ${width}w`)
    .join(', ');
};

export const buildStaticSrcset = (assetPath) => {
  if (!assetPath) {
    return '';
  }

  const normaliseDescriptor = (descriptorCandidate) => {
    if (typeof descriptorCandidate === 'string') {
      const trimmed = descriptorCandidate.trim();
      return trimmed ? trimmed : '';
    }
    if (typeof descriptorCandidate === 'number' && Number.isFinite(descriptorCandidate)) {
      return `${descriptorCandidate}w`;
    }
    return '';
  };

  const buildEntry = (entry) => {
    if (typeof entry === 'string') {
      const normalised = normaliseAssetPath(entry);
      return encodeStaticPath(normalised);
    }

    if (entry && typeof entry === 'object') {
      const srcCandidate = entry.src || entry.path || entry.url || '';
      const src = normaliseAssetPath(srcCandidate);
      if (!src) {
        return '';
      }

      const descriptorKey = STATIC_SRC_DESCRIPTOR_KEYS.find((key) => key in entry);
      const descriptor = descriptorKey
        ? normaliseDescriptor(entry[descriptorKey])
        : normaliseDescriptor(entry.width);
      const encodedSrc = encodeStaticPath(src);
      return descriptor ? `${encodedSrc} ${descriptor}` : encodedSrc;
    }

    return '';
  };

  if (Array.isArray(assetPath)) {
    return assetPath.map(buildEntry).filter(Boolean).join(', ');
  }

  if (assetPath && typeof assetPath === 'object') {
    if (typeof assetPath.srcset === 'string') {
      const trimmed = assetPath.srcset.trim();
      if (trimmed) {
        return trimmed;
      }
    }

    if (Array.isArray(assetPath.variants)) {
      return assetPath.variants.map(buildEntry).filter(Boolean).join(', ');
    }

    return buildEntry(assetPath);
  }

  const normalised = normaliseAssetPath(assetPath);
  return encodeStaticPath(normalised);
};

const isAvifAsset = (assetPath) => {
  if (typeof assetPath !== 'string') {
    return false;
  }
  const trimmed = assetPath.trim();
  if (!trimmed) {
    return false;
  }
  return /\.avif(?:[?#].*)?$/i.test(trimmed);
};

export const resolveAvifSrcset = (assetPath, widths = PRODUCT_IMAGE_WIDTHS) => {
  if (!assetPath) {
    return '';
  }

  if (Array.isArray(assetPath)) {
    const staticSrcset = buildStaticSrcset(assetPath);
    if (staticSrcset && /\.avif/i.test(staticSrcset)) {
      return staticSrcset;
    }
  }

  if (assetPath && typeof assetPath === 'object' && !Array.isArray(assetPath)) {
    const srcsetFromObject = buildStaticSrcset(assetPath);
    if (srcsetFromObject && /\.avif/i.test(srcsetFromObject)) {
      return srcsetFromObject;
    }

    const srcCandidate = assetPath.src || assetPath.path || assetPath.url || '';
    if (isAvifAsset(srcCandidate)) {
      return buildStaticSrcset(srcCandidate);
    }
  }

  if (isAvifAsset(assetPath)) {
    return buildStaticSrcset(assetPath);
  }

  return buildCfSrcset(assetPath, { format: 'avif' }, widths);
};
