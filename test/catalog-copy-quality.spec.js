import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/product_data.json'), 'utf8'));
const mirror = JSON.parse(fs.readFileSync(path.join(root, 'astro-poc/src/data/products.json'), 'utf8'));
const publicData = JSON.parse(fs.readFileSync(path.join(root, 'astro-poc/public/data/product_data.json'), 'utf8'));

describe('Product copy must convey verifiable information rather than boilerplate', () => {
  it('keeps the three catalog projections consistent', () => {
    expect(mirror).toEqual(catalog);
    expect(publicData.products.map((product) => product.description))
      .toEqual(catalog.products.map((product) => product.description));
  });

  it('does not repeat the generic sentences removed in the editorial audit', () => {
    const weakCopy = [
      'agua para tener a mano en casa',
      'bebida gaseosa para acompañar comidas o compartir',
      'cerveza para servir fría o compartir en encuentros',
      'espumante para servir en celebraciones o encuentros',
      'chocolate en barra para disfrutar por porciones',
      'galletas para acompañar café, té o una colación',
      'papas para picotear entre comidas o compartir',
      'para preparar cócteles o servir según preferencia',
      'juego de cartas para disfrutar partidas en grupo',
      'para sándwiches, tablas y picoteos',
    ];
    for (const product of catalog.products) {
      for (const phrase of weakCopy) {
        expect(product.description.toLowerCase(), product.name).not.toContain(phrase);
      }
    }
  });

  it('uses concise factual copy for affected products', () => {
    const find = (name) => catalog.products.find((product) => product.name === name)?.description;
    expect(find('Benedictino • Agua gasificada 2L')).toBe('Envase desechable');
    expect(find('Confort • Papel Sanitario')).toBe('4 rollos de 20 m c/u • Doble hoja');
    expect(find('Papas Caseras Marco Polo 200g')).toBe('Bolsa de 200 g.');
    expect(find('Mario Bros')).toBe('Llavero de PVC.');
    expect(find('Van Camp\'s • Atún Lomitos en Agua')).toContain('92 g de peso drenado');
  });
});
