const fs = require('fs');
const path = require('path');

const { rootDir } = require('./output-dir');

const productDataPath = path.join(rootDir, 'data', 'product_data.json');

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isDateLikeString(value) {
  return hasText(value) && Number.isFinite(Date.parse(value));
}

function normalizeCategoryKey(value) {
  return hasText(value) ? value.trim().toLowerCase() : '';
}

function isSafeLocalAssetPath(value) {
  if (!hasText(value)) {
    return false;
  }
  const normalized = String(value).trim();
  if (/^https?:\/\//i.test(normalized)) {
    return false;
  }
  if (normalized.includes('..') || normalized.includes('\\')) {
    return false;
  }
  return true;
}

function getProductLabel(product, index) {
  if (hasText(product?.name)) {
    return `"${product.name.trim()}"`;
  }
  return `#${index}`;
}

function validateFieldLastModified(value, index, errors) {
  if (value === undefined || value === null) {
    return;
  }

  if (!isPlainObject(value)) {
    errors.push(`products[${index}].field_last_modified must be an object when present`);
    return;
  }

  Object.entries(value).forEach(([fieldName, metadata]) => {
    const prefix = `products[${index}].field_last_modified.${fieldName}`;
    if (!isPlainObject(metadata)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (!isDateLikeString(metadata.ts)) {
      errors.push(`${prefix}.ts must be an ISO date string`);
    }
    if (!hasText(metadata.by)) {
      errors.push(`${prefix}.by must be a non-empty string`);
    }
    if (!isNonNegativeInteger(metadata.rev)) {
      errors.push(`${prefix}.rev must be a non-negative integer`);
    }
    if (metadata.base_rev !== undefined && metadata.base_rev !== null) {
      if (!isNonNegativeInteger(metadata.base_rev)) {
        errors.push(`${prefix}.base_rev must be a non-negative integer or null`);
      }
    }
    if (metadata.changeset_id !== undefined && metadata.changeset_id !== null) {
      if (!hasText(metadata.changeset_id)) {
        errors.push(`${prefix}.changeset_id must be a non-empty string or null`);
      }
    }
  });
}

function validateProduct(product, index, { knownCategoryKeys } = {}) {
  const errors = [];
  const label = getProductLabel(product, index);
  const prefix = `products[${index}] ${label}`;

  if (!isPlainObject(product)) {
    errors.push(`products[${index}] must be an object`);
    return errors;
  }

  if (!hasText(product.name)) {
    errors.push(`${prefix} is missing name`);
  }

  if (typeof product.description !== 'string') {
    errors.push(`${prefix} description must be a string`);
  }

  if (!hasText(product.category)) {
    errors.push(`${prefix} is missing category`);
  } else if (knownCategoryKeys && knownCategoryKeys.size > 0) {
    const categoryKey = normalizeCategoryKey(product.category);
    if (!knownCategoryKeys.has(categoryKey)) {
      errors.push(`${prefix} references unknown category "${product.category}"`);
    }
  }

  if (!isNonNegativeNumber(product.price)) {
    errors.push(`${prefix} price must be a non-negative number`);
  }

  if (!isNonNegativeNumber(product.discount)) {
    errors.push(`${prefix} discount must be a non-negative number`);
  } else if (isNonNegativeNumber(product.price) && product.discount > product.price) {
    errors.push(`${prefix} discount cannot exceed price`);
  }

  if (typeof product.stock !== 'boolean') {
    errors.push(`${prefix} stock must be a boolean`);
  }

  if (typeof product.is_archived !== 'boolean') {
    errors.push(`${prefix} is_archived must be a boolean`);
  }

  if (!isNonNegativeInteger(product.order)) {
    errors.push(`${prefix} order must be a non-negative integer`);
  }

  if (!isNonNegativeInteger(product.rev)) {
    errors.push(`${prefix} rev must be a non-negative integer`);
  }

  if (!hasText(product.image_path)) {
    errors.push(`${prefix} image_path is required`);
  } else if (!isSafeLocalAssetPath(product.image_path)) {
    errors.push(`${prefix} image_path must be a safe local path`);
  }

  if (product.image_avif_path !== undefined && product.image_avif_path !== null) {
    if (typeof product.image_avif_path !== 'string') {
      errors.push(`${prefix} image_avif_path must be a string`);
    } else if (product.image_avif_path.trim() && !isSafeLocalAssetPath(product.image_avif_path)) {
      errors.push(`${prefix} image_avif_path must be a safe local path when provided`);
    }
  }

  validateFieldLastModified(product.field_last_modified, index, errors);

  return errors;
}

function validateProductDataContract(payload, options = {}) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return {
      isValid: false,
      errors: ['product_data root must be an object'],
    };
  }

  if (!hasText(payload.version)) {
    errors.push('product_data.version must be a non-empty string');
  }

  if (!isDateLikeString(payload.last_updated)) {
    errors.push('product_data.last_updated must be an ISO date string');
  }

  if (!isNonNegativeInteger(payload.rev)) {
    errors.push('product_data.rev must be a non-negative integer');
  }

  if (!Array.isArray(payload.products)) {
    errors.push('product_data.products must be an array');
  } else {
    payload.products.forEach((product, index) => {
      errors.push(...validateProduct(product, index, options));
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function loadProductData(dataPath = productDataPath) {
  const raw = fs.readFileSync(dataPath, 'utf8');
  return JSON.parse(raw);
}

module.exports = {
  productDataPath,
  loadProductData,
  normalizeCategoryKey,
  validateProductDataContract,
  validateProduct,
};
