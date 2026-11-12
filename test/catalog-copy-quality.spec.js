import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/product_data.json'), 'utf8'));

// Minimal list, no false positives on the current catalog; "para" is not
// banned (there are factual uses: "Apta para impresoras").
const PROMOTIONAL_COPY =
  /\b(ideal|perfect[oa]s?|delicios[oa]s?|exquisit[oa]s?|irresistible|incre[ií]ble|disfrut\w*|sabros[oa]s?|el mejor|la mejor|de calidad|premium)\b/i;

describe('Product copy must convey verifiable information rather than boilerplate', () => {
  it('descriptions avoid promotional adjectives and value judgements (AGENTS.md catalog rule)', () => {
    for (const product of catalog.products) {
      if (product.is_archived) {
        continue;
      }
      expect(
        PROMOTIONAL_COPY.test(product.description || ''),
        `${product.id} ${product.name}: "${product.description}"`
      ).toBe(false);
    }
  });

  it('descriptions do not just repeat the product name', () => {
    for (const product of catalog.products) {
      if (product.is_archived) {
        continue;
      }
      const description = String(product.description || '').trim();
      if (!description) {
        continue;
      }
      expect(description.toLowerCase(), `${product.id} ${product.name}`).not.toBe(
        String(product.name || '')
          .trim()
          .toLowerCase()
      );
    }
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
});
