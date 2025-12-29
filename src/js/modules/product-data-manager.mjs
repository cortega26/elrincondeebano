import { log, createCorrelationId } from '../utils/logger.mts';
import { resolveProductDataUrl } from '../utils/data-endpoint.mjs';

import {
    fetchWithRetry,
    normalizeProductVersion,
    getStoredProductVersion,
    setStoredProductVersion,
    ProductDataError,
} from '../utils/product-data.mjs';
import { showErrorMessage } from './ui-components.mjs';

const PRODUCT_DATA_GLOBAL_KEY = '__PRODUCT_DATA__';
let sharedProductData = null;

const DEFAULT_CATEGORY = 'General';
const DEFAULT_PRODUCT_NAME_PREFIX = 'Producto';

// Normalize strings for robust comparisons (remove accents, spaces, punctuation, lowercased)
export const normalizeString = (str) => {
    if (!str) return '';
    try {
        return String(str)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase();
    } catch {
        return String(str).toLowerCase();
    }
};

export function getSharedProductData() {
    if (typeof window !== 'undefined') {
        const payload = window[PRODUCT_DATA_GLOBAL_KEY];
        if (payload && Array.isArray(payload.products)) {
            return payload;
        }
    }
    if (sharedProductData && Array.isArray(sharedProductData.products)) {
        return sharedProductData;
    }
    return null;
}

export function writeSharedProductData(products, metadata = {}, { force = false } = {}) {
    if (!Array.isArray(products)) {
        return null;
    }
    const payload = {
        products,
        version: metadata.version || null,
        source: metadata.source || null,
        updatedAt: metadata.updatedAt || Date.now(),
        isPartial: Boolean(metadata.isPartial),
        total: typeof metadata.total === 'number' ? metadata.total : null,
    };
    const existing = getSharedProductData();
    if (existing && !force) {
        const existingVersion = existing.version || null;
        const payloadVersion = payload.version || null;
        const shouldKeepExisting =
            (!payloadVersion && existingVersion) ||
            (!payloadVersion && !existingVersion) ||
            (payloadVersion && existingVersion === payloadVersion);
        if (shouldKeepExisting) {
            return existing;
        }
    }
    sharedProductData = payload;
    if (typeof window !== 'undefined') {
        window[PRODUCT_DATA_GLOBAL_KEY] = { ...payload };
    }
    return payload;
}

export function ensureSharedProductData(products, metadata = {}) {
    return writeSharedProductData(products, metadata, { force: false });
}

export function overwriteSharedProductData(products, metadata = {}) {
    return writeSharedProductData(products, metadata, { force: true });
}

export const generateStableId = (product, index = 0) => {
    const hasValidShape = product && typeof product === 'object';
    const rawName = hasValidShape && typeof product.name === 'string' ? product.name.trim() : '';
    const rawCategory =
        hasValidShape && typeof product.category === 'string' ? product.category.trim() : '';

    const safeName = rawName.length > 0 ? rawName : `${DEFAULT_PRODUCT_NAME_PREFIX}-${index + 1}`;
    const safeCategory = rawCategory.length > 0 ? rawCategory : DEFAULT_CATEGORY;

    const baseString = `${safeName}-${safeCategory}`.toLowerCase();

    let hash = 0;
    for (let i = 0; i < baseString.length; i += 1) {
        const charCode = baseString.charCodeAt(i);
        hash = (hash << 5) - hash + charCode;
        hash &= hash; // Convert to 32-bit integer
    }

    const needsFallbackSuffix = rawName.length === 0 || rawCategory.length === 0;
    const suffix = needsFallbackSuffix ? `-${index}` : '';

    return `pid-${Math.abs(hash)}${suffix}`;
};

const sanitizeHTML = (unsafe) => {
    if (typeof document === 'undefined') return unsafe;
    const element = document.createElement('div');
    element.textContent = unsafe;
    return element.innerHTML;
};

export const transformProduct = (product, index) => {
    if (!product || typeof product !== 'object') {
        return null;
    }

    const id =
        typeof product.id === 'string' && product.id.trim().length > 0
            ? product.id.trim()
            : generateStableId(product, index);

    const originalIndex =
        typeof product.originalIndex === 'number'
            ? product.originalIndex
            : typeof product.order === 'number'
                ? product.order
                : index;

    const safeName =
        typeof product.name === 'string' && product.name.trim().length > 0
            ? product.name
            : `${DEFAULT_PRODUCT_NAME_PREFIX} ${index + 1}`;

    const safeDescription = typeof product.description === 'string' ? product.description : '';
    const safeCategory =
        typeof product.category === 'string' && product.category.trim().length > 0
            ? product.category
            : DEFAULT_CATEGORY;
    const safeImagePath = typeof product.image_path === 'string' ? product.image_path : '';
    const safeImageAvifPath =
        typeof product.image_avif_path === 'string' ? product.image_avif_path : '';

    return {
        ...product,
        id,
        name: sanitizeHTML(safeName),
        description: sanitizeHTML(safeDescription),
        category: sanitizeHTML(safeCategory),
        categoryKey: product.categoryKey || normalizeString(safeCategory),
        image_path: safeImagePath,
        image_avif_path: safeImageAvifPath,
        originalIndex,
    };
};

export const transformProducts = (products = []) =>
    products.map((product, index) => transformProduct(product, index)).filter(Boolean);

const INLINE_PRODUCT_SCRIPT_ID = 'product-data';

export const parseInlineProductData = () => {
    if (typeof document === 'undefined') {
        return null;
    }
    try {
        const script = document.getElementById(INLINE_PRODUCT_SCRIPT_ID);
        if (!script || !script.textContent) {
            return null;
        }
        const payload = script.textContent.trim();
        if (!payload) {
            return null;
        }
        const parsed = JSON.parse(payload);
        if (!parsed) {
            return null;
        }
        if (Array.isArray(parsed.initialProducts)) {
            return parsed;
        }
        if (Array.isArray(parsed.products)) {
            return { ...parsed, initialProducts: parsed.products };
        }
        return null;
    } catch (error) {
        log('warn', 'inline_product_parse_failure', { error: error.message });
        return null;
    }
};

export function hydrateSharedProductDataFromInline() {
    const existing = getSharedProductData();
    if (existing) {
        return existing;
    }
    const inlineData = parseInlineProductData();
    if (!inlineData || !Array.isArray(inlineData.initialProducts)) {
        return null;
    }
    const transformed = transformProducts(inlineData.initialProducts);
    return ensureSharedProductData(transformed, {
        version: inlineData.version || null,
        source: 'inline',
        isPartial: true,
        total:
            typeof inlineData.totalProducts === 'number' ? inlineData.totalProducts : transformed.length,
    });
}

// Modify the fetchProducts function
export const fetchProducts = async () => {
    const correlationId = createCorrelationId();
    const inlineData = parseInlineProductData();
    const inlineSource = inlineData?.initialProducts || null;
    const inlineVersion = normalizeProductVersion(inlineData?.version);
    const inlineTotal =
        typeof inlineData?.totalProducts === 'number' ? inlineData.totalProducts : null;
    const inlineProducts = Array.isArray(inlineSource) ? transformProducts(inlineSource) : null;
    const hasInlineProducts = Array.isArray(inlineProducts);
    const storedVersion = getStoredProductVersion();

    if (hasInlineProducts) {
        if (inlineVersion) {
            if (typeof window === 'undefined' || window.__ENABLE_TEST_HOOKS__ !== true) {
                setStoredProductVersion(inlineVersion);
            }
        }
        ensureSharedProductData(inlineProducts, {
            version: inlineVersion || null,
            source: 'inline',
            isPartial: true,
            total: inlineTotal ?? inlineProducts.length,
        });
        log('info', 'fetch_products_inline_bootstrap', { correlationId, count: inlineProducts.length });
    }

    try {
        const versionForUrl = storedVersion || inlineVersion || null;
        const url = resolveProductDataUrl({ version: versionForUrl });
        const response = await fetchWithRetry(
            url,
            { cache: 'no-store', headers: { Accept: 'application/json' } },
            2,
            300,
            correlationId
        );
        const data = await response.json();
        const transformed = transformProducts(data.products || []);
        const networkVersion = normalizeProductVersion(data.version);
        overwriteSharedProductData(transformed, {
            version: networkVersion,
            source: 'network',
            isPartial: false,
            total: transformed.length,
        });
        if (networkVersion) {
            const latestStoredVersion = getStoredProductVersion();
            const shouldPersistNetworkVersion =
                !latestStoredVersion ||
                latestStoredVersion === storedVersion ||
                latestStoredVersion === networkVersion;
            if (shouldPersistNetworkVersion) {
                if (typeof window === 'undefined' || window.__ENABLE_TEST_HOOKS__ !== true) {
                    setStoredProductVersion(networkVersion);
                }
            }
        }
        log('info', 'fetch_products_success', {
            correlationId,
            count: transformed.length,
            source: 'network',
        });
        return transformed;
    } catch (error) {
        if (hasInlineProducts) {
            ensureSharedProductData(inlineProducts, {
                version: inlineVersion || null,
                source: 'inline-fallback',
                isPartial: true,
                total: inlineTotal ?? inlineProducts.length,
            });
            log('warn', 'fetch_products_network_fallback_inline', {
                correlationId,
                error: error.message,
                runbook: 'docs/operations/RUNBOOK.md#product-data',
            });
            return inlineProducts;
        }
        log('error', 'fetch_products_failure', {
            correlationId,
            error: error.message,
            runbook: 'docs/operations/RUNBOOK.md#product-data',
        });
        showErrorMessage(
            `Error al cargar los productos. Por favor, verifique su conexión a internet e inténtelo de nuevo. (Error: ${error.message})`
        );
        if (error instanceof ProductDataError) {
            throw error;
        }
        throw new ProductDataError(error.message, { cause: error, correlationId });
    }
};
