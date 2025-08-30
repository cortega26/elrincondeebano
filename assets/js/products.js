import { generateStableId, sanitizeHTML, normalizeString, showErrorMessage } from './utils.js';

export const fetchProducts = async () => {
  try {
    const version = localStorage.getItem('productDataVersion');
    const url = version ? `/_products/product_data.json?v=${encodeURIComponent(version)}` : '/_products/product_data.json';
    const response = await fetch(url, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    if (!response.ok) {
      throw new Error(`HTTP error. Status: ${response.status}`);
    }
    const data = await response.json();
    return data.products.map(product => ({
      ...product,
      id: generateStableId(product),
      name: sanitizeHTML(product.name),
      description: sanitizeHTML(product.description),
      category: sanitizeHTML(product.category),
      categoryKey: normalizeString(product.category)
    }));
  } catch (error) {
    console.error('Error al obtener productos:', error);
    showErrorMessage(`Error al cargar los productos. Por favor, verifique su conexión a internet e inténtelo de nuevo. (Error: ${error.message})`);
    throw error;
  }
};
