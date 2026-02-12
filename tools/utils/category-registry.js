const fs = require('fs');
const path = require('path');

const { rootDir } = require('./output-dir');

const legacyCatalogPath = path.join(rootDir, 'data', 'categories.json');
const categoryRegistryPath = path.join(rootDir, 'data', 'category_registry.json');

const REGISTRY_SCHEMA_VERSION = '1.0';

function asString(value, fallback = '') {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return fallback;
}

function asInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function isActive(value) {
  return value !== false;
}

function normalizeDisplayName(displayName, fallback = '') {
  if (displayName && typeof displayName === 'object' && !Array.isArray(displayName)) {
    const defaultLabel = asString(displayName.default, fallback);
    const normalized = { ...displayName, default: defaultLabel };
    if (!normalized.default) {
      normalized.default = fallback;
    }
    return normalized;
  }
  if (typeof displayName === 'string') {
    return { default: asString(displayName, fallback) };
  }
  return { default: fallback };
}

function readJsonFile(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

function loadLegacyCategoryCatalog() {
  return readJsonFile(legacyCatalogPath, { version: '', last_updated: '', nav_groups: [], categories: [] });
}

function convertLegacyCatalogToRegistry(catalog = {}) {
  const navGroups = Array.isArray(catalog.nav_groups) ? catalog.nav_groups : [];
  const categories = Array.isArray(catalog.categories) ? catalog.categories : [];

  return {
    schema_version: REGISTRY_SCHEMA_VERSION,
    source: 'categories.json',
    version: asString(catalog.version, ''),
    last_updated: asString(catalog.last_updated, ''),
    nav_groups: navGroups.map((group) => {
      const id = asString(group && group.id, '');
      const label = asString(group && group.label, id);
      return {
        id,
        display_name: normalizeDisplayName(group && group.display_name, label),
        active: isActive(group && group.enabled),
        sort_order: asInt(group && group.order, 0),
        description: asString(group && group.description, ''),
      };
    }),
    categories: categories.map((category) => {
      const id = asString(category && category.id, '');
      const key = asString(category && category.product_key, id);
      const title = asString(category && category.title, key || id);
      const rawSubcategories =
        category && Array.isArray(category.subcategories) ? category.subcategories : [];
      return {
        id,
        key,
        slug: asString(category && category.slug, id),
        display_name: normalizeDisplayName(category && category.display_name, title),
        nav_group: asString(category && category.group_id, ''),
        active: isActive(category && category.enabled),
        sort_order: asInt(category && category.order, 0),
        description: asString(category && category.description, ''),
        subcategories: rawSubcategories.map((subcategory) => {
          const subId = asString(subcategory && subcategory.id, '');
          const subKey = asString(subcategory && subcategory.product_key, subId);
          const subTitle = asString(subcategory && subcategory.title, subKey || subId);
          return {
            id: subId,
            key: subKey,
            slug: asString(subcategory && subcategory.slug, subId),
            display_name: normalizeDisplayName(subcategory && subcategory.display_name, subTitle),
            active: isActive(subcategory && subcategory.enabled),
            sort_order: asInt(subcategory && subcategory.order, 0),
            description: asString(subcategory && subcategory.description, ''),
          };
        }),
      };
    }),
  };
}

function convertRegistryToLegacyCatalog(registry = {}, metadata = {}) {
  const navGroups = Array.isArray(registry.nav_groups) ? registry.nav_groups : [];
  const categories = Array.isArray(registry.categories) ? registry.categories : [];

  return {
    version: asString(metadata.version, asString(registry.version, '')),
    last_updated: asString(metadata.last_updated, asString(registry.last_updated, '')),
    nav_groups: navGroups.map((group) => {
      const id = asString(group && group.id, '');
      const label = asString(group && group.label, asString(group?.display_name?.default, id));
      return {
        id,
        label,
        order: asInt(group && (group.order ?? group.sort_order), 0),
        description: asString(group && group.description, ''),
        enabled: isActive(group && (group.enabled ?? group.active)),
      };
    }),
    categories: categories.map((category) => {
      const id = asString(category && category.id, '');
      const key = asString(category && (category.product_key ?? category.key), id);
      const title = asString(category && category.title, asString(category?.display_name?.default, key || id));
      const rawSubcategories =
        category && Array.isArray(category.subcategories) ? category.subcategories : [];
      return {
        id,
        title,
        product_key: key,
        slug: asString(category && category.slug, id),
        description: asString(category && category.description, ''),
        group_id: asString(category && (category.group_id ?? category.nav_group), ''),
        order: asInt(category && (category.order ?? category.sort_order), 0),
        enabled: isActive(category && (category.enabled ?? category.active)),
        subcategories: rawSubcategories.map((subcategory) => {
          const subId = asString(subcategory && subcategory.id, '');
          const subKey = asString(subcategory && (subcategory.product_key ?? subcategory.key), subId);
          const subTitle = asString(
            subcategory && subcategory.title,
            asString(subcategory?.display_name?.default, subKey || subId)
          );
          return {
            id: subId,
            title: subTitle,
            product_key: subKey,
            slug: asString(subcategory && subcategory.slug, subId),
            description: asString(subcategory && subcategory.description, ''),
            order: asInt(subcategory && (subcategory.order ?? subcategory.sort_order), 0),
            enabled: isActive(subcategory && (subcategory.enabled ?? subcategory.active)),
          };
        }),
      };
    }),
  };
}

function validateCategoryRegistry(registry = {}) {
  const errors = [];
  const categories = Array.isArray(registry.categories) ? registry.categories : [];
  const navGroups = Array.isArray(registry.nav_groups) ? registry.nav_groups : [];

  if (asString(registry.schema_version, '') !== REGISTRY_SCHEMA_VERSION) {
    errors.push(`schema_version must be "${REGISTRY_SCHEMA_VERSION}"`);
  }

  const navGroupIds = new Set();
  navGroups.forEach((group, index) => {
    const id = asString(group && group.id, '');
    const label = asString(group?.display_name?.default, '');
    if (!id) {
      errors.push(`nav_groups[${index}].id is required`);
      return;
    }
    if (!label) {
      errors.push(`nav_groups[${index}].display_name.default is required`);
    }
    if (navGroupIds.has(id)) {
      errors.push(`Duplicate nav_group id: ${id}`);
    }
    navGroupIds.add(id);
  });

  const ids = new Set();
  const keys = new Set();
  const slugs = new Set();
  categories.forEach((category, index) => {
    const id = asString(category && category.id, '');
    const key = asString(category && category.key, '');
    const slug = asString(category && category.slug, '');
    const groupId = asString(category && category.nav_group, '');
    const defaultDisplayName = asString(category?.display_name?.default, '');

    if (!id) errors.push(`categories[${index}].id is required`);
    if (!key) errors.push(`categories[${index}].key is required`);
    if (!slug) errors.push(`categories[${index}].slug is required`);
    if (!defaultDisplayName) {
      errors.push(`categories[${index}].display_name.default is required`);
    }

    if (id) {
      if (ids.has(id)) errors.push(`Duplicate category id: ${id}`);
      ids.add(id);
    }
    if (key) {
      if (keys.has(key)) errors.push(`Duplicate category key: ${key}`);
      keys.add(key);
    }
    if (slug) {
      if (slugs.has(slug)) errors.push(`Duplicate category slug: ${slug}`);
      slugs.add(slug);
    }

    if (groupId && !navGroupIds.has(groupId)) {
      errors.push(`Category "${id || `#${index}`}" references unknown nav_group "${groupId}"`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function loadCategoryRegistry({ preferRegistry = true } = {}) {
  if (preferRegistry && fs.existsSync(categoryRegistryPath)) {
    const parsed = readJsonFile(categoryRegistryPath, null);
    if (parsed) {
      return parsed;
    }
  }
  return convertLegacyCatalogToRegistry(loadLegacyCategoryCatalog());
}

function loadCategoryCatalogFromRegistry({ preferRegistry = true } = {}) {
  const registry = loadCategoryRegistry({ preferRegistry });
  const metadata = {
    version: asString(registry && registry.version, ''),
    last_updated: asString(registry && registry.last_updated, ''),
  };
  return convertRegistryToLegacyCatalog(registry, metadata);
}

module.exports = {
  REGISTRY_SCHEMA_VERSION,
  legacyCatalogPath,
  categoryRegistryPath,
  loadLegacyCategoryCatalog,
  loadCategoryRegistry,
  loadCategoryCatalogFromRegistry,
  convertLegacyCatalogToRegistry,
  convertRegistryToLegacyCatalog,
  validateCategoryRegistry,
};
