// Plan 239: un solo primitivo de plegado de acentos (shared/text.ts) para el
// admin. Este contrato fija el primitivo y un caso de extremo a extremo por
// sitio que lo usa (búsqueda de comms y nombre de archivo de handoff); la
// regla de slug de CategoriesPage vive en test/web/categoriesPage.test.tsx.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { foldAccents } from '../../src/shared/text.ts';
import { searchTemplates, seedDocument } from '../../src/shared/comms.ts';
import { safeFileName } from '../../src/web/app/comms/handoff.ts';

describe('foldAccents', () => {
  it('pliega el juego acentuado español completo', () => {
    expect(foldAccents('ÁÉÍÓÚÜÑñáéíóúü')).toBe('AEIOUUNnaeiouu');
  });

  it('es idempotente', () => {
    const once = foldAccents('Café Órale');
    expect(once).toBe('Cafe Orale');
    expect(foldAccents(once)).toBe(once);
  });

  it('conserva el rango escapado en el código fuente', () => {
    // Los caracteres combinantes crudos son frágiles ante editores: la clase
    // debe seguir escrita como escape \u0300-\u036f.
    const source = readFileSync(new URL('../../src/shared/text.ts', import.meta.url), 'utf8');
    expect(source).toContain('[\\u0300-\\u036f]');
  });
});

describe('comportamientos que dependen del plegado (plan 239)', () => {
  it('la búsqueda de plantillas pliega tildes en consulta y contenido', () => {
    const ids = searchTemplates(seedDocument().templates, 'Últimos día').map((t) => t.id);
    expect(ids).toContain('ultimos-pedidos');
  });

  it('el nombre de archivo de handoff pliega acentos', () => {
    expect(safeFileName('Nova Clásica ✨', 'jpg')).toBe('nova-clasica.jpg');
    expect(safeFileName('Café Órale', 'png')).toBe('cafe-orale.png');
  });
});
