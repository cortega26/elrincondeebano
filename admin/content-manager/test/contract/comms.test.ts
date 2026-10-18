import { describe, it, expect } from 'vitest';
import {
  buildBackup,
  buildWhatsAppUrl,
  extractVariables,
  findRecentRepeat,
  formatPhone,
  integrityErrors,
  normalizePhone,
  parseBackup,
  parseCommsDocument,
  productSku,
  productUrl,
  productVariables,
  renderTemplate,
  searchTemplates,
  seedDocument,
  textHash,
} from '../../src/shared/comms.ts';
import { getProductSku as storefrontSku } from '../../../../astro-poc/src/lib/product-identity.ts';
import type { CommsActivity } from '../../src/shared/schemas/comms.ts';

// Plan 217: lógica pura del módulo de comunicaciones.

describe('variables de plantilla', () => {
  it('extrae variables únicas en orden', () => {
    expect(extractVariables('Hola {nombre}, {producto} a {precio}. {nombre}')).toEqual([
      'nombre',
      'producto',
      'precio',
    ]);
  });

  it('sustituye las variables con valor y reporta las faltantes', () => {
    const r = renderTemplate('Hola {nombre}, {producto} a {precio}', {
      nombre: 'Ana',
      producto: '  ',
    });
    expect(r.text).toBe('Hola Ana, {producto} a {precio}');
    expect(r.missing).toEqual(['producto', 'precio']);
  });

  it('las variables personalizadas también se exigen', () => {
    expect(renderTemplate('Hasta las {hora}', {}).missing).toEqual(['hora']);
    expect(renderTemplate('Hasta las {hora}', { hora: '21:00' })).toEqual({
      text: 'Hasta las 21:00',
      missing: [],
    });
  });

  it('no interpreta los valores como plantillas (sin inyección recursiva)', () => {
    expect(renderTemplate('{nombre}', { nombre: '{precio}' }).text).toBe('{precio}');
  });
});

describe('teléfonos', () => {
  // Matriz de contrato (plan 230): solo formas dialables por wa.me.
  it.each([
    ['+56 9 1234 5678', '56912345678'],
    ['912345678', '56912345678'],
    ['9 1234 5678', '56912345678'],
    ['56912345678', '56912345678'],
    ['0056912345678', '56912345678'],
    ['00 56 9 1234 5678', '56912345678'],
    ['9 1111 2222', '56911112222'],
    ['+56 9 0000 0000', '56900000000'],
    ['+1 (415) 555-0100', '14155550100'],
  ])('normaliza %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    '',
    'abc',
    '12345',
    '+9 1234 5678',
    '+2 1234 5678',
    '+56 9 1234',
    '+56 22334455',
    '22334455',
    '91234567',
    '5691234567890',
  ])('rechaza %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  it('formatea números chilenos', () => {
    expect(formatPhone('56912345678')).toBe('+56 9 1234 5678');
    expect(formatPhone('14155550100')).toBe('+14155550100');
  });
});

describe('enlace Click to Chat', () => {
  it('con número abre ese chat con texto codificado (saltos de línea incluidos)', () => {
    expect(buildWhatsAppUrl('Hola & chao\n¿ok?', '56912345678')).toBe(
      'https://wa.me/56912345678?text=Hola%20%26%20chao%0A%C2%BFok%3F'
    );
  });

  it('sin número abre el selector de chats (flujo del grupo)', () => {
    expect(buildWhatsAppUrl('Hola', null)).toBe('https://wa.me/?text=Hola');
  });
});

describe('datos de producto', () => {
  const base = { name: 'Toalla Nova', category: 'Limpiezayaseo', price: 2000 };

  it('el SKU coincide con el del storefront', () => {
    for (const p of [
      base,
      { ...base, id: 'abc' },
      { ...base, sku: ' X-1 ' },
      { name: 'Ñandú', price: 1 },
    ]) {
      expect(productSku(p)).toBe(storefrontSku(p));
    }
  });

  it('enlaza /p/<sku>/ solo si el producto tiene página pública', () => {
    expect(productUrl({ ...base, stock: true })).toMatch(
      /^https:\/\/www\.elrincondeebano\.com\/p\/pid-\d+\/$/
    );
    expect(productUrl({ ...base, stock: false })).toBe('https://www.elrincondeebano.com/');
    expect(productUrl({ ...base, stock: true, is_archived: true })).toBe(
      'https://www.elrincondeebano.com/'
    );
  });

  it('precio y oferta salen del catálogo, en CLP', () => {
    const v = productVariables({ ...base, description: '2 rollos', discount: 500, stock: true });
    expect(v.producto).toBe('Toalla Nova (2 rollos)');
    expect(v.precio?.replace(/\s/g, ' ')).toBe('$2.000');
    expect(v.oferta?.replace(/\s/g, ' ')).toBe('$1.500');
    expect(productVariables(base).oferta).toBeUndefined();
  });
});

describe('repeticiones', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const entry = (
    at: string,
    dest: string | null,
    hash: string,
    status: CommsActivity['status'] = 'enviado_manual'
  ): CommsActivity => ({
    id: `a-${at}`,
    at,
    template_id: 't',
    template_title: 'T',
    destination_id: dest,
    destination_alias: 'X',
    status,
    text_hash: hash,
  });

  it('detecta el mismo texto al mismo destino dentro de 7 días', () => {
    const h = textHash('Hola  vecinos');
    expect(h).toBe(textHash(' Hola vecinos '));
    const log = [entry('2026-10-08T12:00:00Z', 'grupo', h)];
    expect(findRecentRepeat(log, 'grupo', h, now)).not.toBeNull();
    expect(findRecentRepeat(log, 'otro', h, now)).toBeNull();
    expect(findRecentRepeat(log, 'grupo', textHash('otro'), now)).toBeNull();
    expect(
      findRecentRepeat([entry('2026-09-01T12:00:00Z', 'grupo', h)], 'grupo', h, now)
    ).toBeNull();
  });

  it('el número pegado (destination_id null) se compara como destino propio', () => {
    const h = textHash('Hola vecino');
    const pegado = [entry('2026-10-08T12:00:00Z', null, h)];
    expect(findRecentRepeat(pegado, null, h, now)).not.toBeNull();
    // Un destino guardado no coincide con el caso pegado ni al revés.
    expect(findRecentRepeat(pegado, 'grupo', h, now)).toBeNull();
    expect(findRecentRepeat([entry('2026-10-08T12:00:00Z', 'grupo', h)], null, h, now)).toBeNull();
  });

  it('abrir el chat o copiar no cuentan como envío repetido', () => {
    const h = textHash('Hola');
    for (const status of ['chat_abierto', 'preparado'] as const) {
      expect(
        findRecentRepeat([entry('2026-10-10T11:00:00Z', 'g', h, status)], 'g', h, now)
      ).toBeNull();
    }
    expect(
      findRecentRepeat([entry('2026-10-10T11:00:00Z', 'g', h, 'compartir_iniciado')], 'g', h, now)
    ).not.toBeNull();
  });
});

describe('búsqueda', () => {
  it('ignora tildes, oculta archivadas y prioriza favoritos', () => {
    const doc = seedDocument();
    const templates = doc.templates.map((t) =>
      t.id === 'resp-delivery' ? { ...t, archived: true } : t
    );
    const results = searchTemplates(templates, 'reposicion');
    expect(results.map((t) => t.id)).toContain('producto-repuesto');
    expect(searchTemplates(templates, 'edificio').map((t) => t.id)).not.toContain('resp-delivery');
    const all = searchTemplates(templates, '');
    const firstNonFav = all.findIndex((t) => !t.favorite);
    expect(all.slice(firstNonFav).some((t) => t.favorite)).toBe(false);
  });
});

describe('documento y respaldo', () => {
  it('el documento inicial es válido y no contiene teléfonos', () => {
    const doc = seedDocument();
    expect(parseCommsDocument(doc).ok).toBe(true);
    expect(doc.destinations.every((d) => d.kind === 'grupo')).toBe(true);
    expect(JSON.stringify(doc)).not.toMatch(/569\d{8}/);
  });

  it('ida y vuelta del respaldo versionado', () => {
    const doc = seedDocument();
    const restored = parseBackup(JSON.stringify(buildBackup(doc)));
    expect(restored).toEqual({ ok: true, value: doc });
  });

  it('rechaza respaldos corruptos, de otro formato o con ids duplicados', () => {
    expect(parseBackup('{no json').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: 'otro', data: {} })).ok).toBe(false);
    const doc = seedDocument();
    const dup = { ...doc, templates: [...doc.templates, doc.templates[0]] };
    expect(integrityErrors(dup)).toHaveLength(1);
    expect(parseBackup(JSON.stringify(buildBackup(dup))).ok).toBe(false);
  });

  it('rechaza imágenes fuera del catálogo y teléfonos inválidos', () => {
    const doc = seedDocument();
    const badImage = {
      ...doc,
      templates: [{ ...doc.templates[0], images: ['https://evil.example/x.jpg'] }],
    };
    expect(parseCommsDocument(badImage).ok).toBe(false);
    const badPhone = {
      ...doc,
      destinations: [{ id: 'c', kind: 'contacto', alias: 'A', name: '', phone: '+56 9' }],
    };
    expect(parseCommsDocument(badPhone).ok).toBe(false);
  });
});
