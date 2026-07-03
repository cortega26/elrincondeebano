import { defineCollection } from 'astro:content';
import { file } from 'astro/loaders';
import { productSchema, categoryRecordSchema } from './lib/data-schemas';

export const collections = {
  products: defineCollection({
    loader: file('src/data/products.json', {
      parser: (text) => {
        const data = JSON.parse(text);
        const seen = new Map<string, number>();
        return (data.products || []).map((product: Record<string, unknown>, index: number) => {
          // Garantizar IDs únicos: usar sku, nombre, o índice como fallback.
          // Si hay duplicados, se agrega sufijo para evitar colisiones.
          let id = String(product.sku || product.name || index);
          const count = seen.get(id) || 0;
          if (count > 0) {
            id = `${id}-${count}`;
          }
          seen.set(id, count + 1);
          return { id, ...product };
        });
      },
    }),
    schema: productSchema,
  }),
  categories: defineCollection({
    loader: file('src/data/categories.json', {
      parser: (text) => {
        const data = JSON.parse(text);
        return (data.categories || []).map((category: Record<string, unknown>) => ({
          id: String(category.id || category.key || ''),
          ...category,
        }));
      },
    }),
    schema: categoryRecordSchema,
  }),
};
