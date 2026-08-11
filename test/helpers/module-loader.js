const fs = require('node:fs');
const path = require('node:path');

function createModuleLoader(baseDir, options = {}) {
  const transform = options.transform || null;
  const importMap = options.importMap || null;

  function loadModule(relPath) {
    const filePath = path.join(baseDir, relPath);
    let code = fs.readFileSync(filePath, 'utf8');
    if (transform) {
      code = transform(code);
    }
    const functionExports = [];
    code = code.replace(/export\s+(async\s+)?function\s+(\w+)/g, (_match, asyncKw, name) => {
      functionExports.push(name);
      return `${asyncKw ?? ''}function ${name}`;
    });
    code = code.replace(/export\s+\{([^}]+)\};?/g, (_match, names) => {
      return names
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => `exports.${name} = ${name};`)
        .join('\n');
    });
    if (functionExports.length > 0) {
      code += `\n${functionExports.map((name) => `exports.${name} = ${name};`).join('\n')}\n`;
    }
    const exports = {};
    if (importMap) {
      const wrapper = new Function(
        'exports',
        '__imports',
        'loadModule',
        code + '\nreturn exports;'
      );
      return wrapper(exports, importMap, loadModule);
    }
    const wrapper = new Function('exports', 'loadModule', code + '\nreturn exports;');
    return wrapper(exports, loadModule);
  }

  return loadModule;
}

module.exports = { createModuleLoader };
