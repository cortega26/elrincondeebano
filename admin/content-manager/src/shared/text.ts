// Plan 239: primitivo único de plegado de acentos del admin. NFD descompone
// vocales acentuadas y la tilde de la ñ; la clase combinante U+0300–U+036F va
// escapada a propósito — los caracteres combinantes crudos en el código
// fuente son frágiles ante editores. Los sitios que lo usan conservan sus
// propias reglas de sufijo (minúsculas, slug, trim).
export function foldAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
