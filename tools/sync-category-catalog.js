const fs = require('fs');

const {
  legacyCatalogPath,
  categoryRegistryPath,
  loadCategoryRegistry,
  convertRegistryToLegacyCatalog,
} = require('./utils/category-registry');

function writeIfChanged(filePath, nextContent) {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (current === nextContent) {
    return false;
  }
  fs.writeFileSync(filePath, nextContent, 'utf8');
  return true;
}

function main() {
  const registry = loadCategoryRegistry({ preferRegistry: true });
  const legacyCatalog = convertRegistryToLegacyCatalog(registry, {
    version: registry.version || '',
    last_updated: registry.last_updated || '',
  });
  const nextContent = `${JSON.stringify(legacyCatalog, null, 2)}\n`;
  const changed = writeIfChanged(legacyCatalogPath, nextContent);

  if (changed) {
    console.log(`Legacy category catalog synced from registry: ${legacyCatalogPath}`);
  } else {
    console.log(`Legacy category catalog already in sync: ${legacyCatalogPath}`);
  }

  console.log(`Source registry: ${categoryRegistryPath}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
