const fs = require('fs');
const path = require('path');

const { rootDir } = require('./output-dir');

const catalogPath = path.join(rootDir, 'data', 'categories.json');

function loadCategoryCatalog() {
  try {
    const raw = fs.readFileSync(catalogPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`No se pudo leer el catálogo de categorías en ${catalogPath}:`, err);
    return { categories: [], nav_groups: [] };
  }
}

function buildNavModel(catalog) {
  const navGroups = Array.isArray(catalog.nav_groups) ? catalog.nav_groups : [];
  const categories = Array.isArray(catalog.categories) ? catalog.categories : [];

  const groupMap = new Map();
  navGroups
    .filter((group) => group && group.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((group) => {
      groupMap.set(group.id, {
        id: group.id,
        label: group.label || group.id,
        order: group.order || 0,
        description: group.description || '',
        categories: [],
      });
    });

  categories
    .filter((category) => category && category.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .forEach((category) => {
      const groupId = category.group_id;
      const group = groupMap.get(groupId);
      if (!group) {
        return;
      }
      group.categories.push({
        id: category.id,
        title: category.title || category.product_key || category.id,
        slug: category.slug || category.id,
        productKey: category.product_key || category.id,
        description: category.description || '',
        order: category.order || 0,
        url: `/pages/${category.slug || category.id}.html`,
      });
    });

  return Array.from(groupMap.values()).map((group) => ({
    ...group,
    categories: group.categories.sort((a, b) => (a.order || 0) - (b.order || 0)),
  }));
}

function buildCategoryPages(catalog) {
  const categories = Array.isArray(catalog.categories) ? catalog.categories : [];
  return categories
    .filter((category) => category && category.enabled !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((category) => ({
      slug: category.slug || category.id,
      name: category.title || category.product_key || category.id,
      description: category.description
        || `Explora nuestra selección de ${category.title || category.id} en El Rincón de Ébano.`,
    }));
}

module.exports = {
  catalogPath,
  loadCategoryCatalog,
  buildNavModel,
  buildCategoryPages,
};
