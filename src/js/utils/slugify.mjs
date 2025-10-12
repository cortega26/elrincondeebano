const FALLBACK_SLUG = '';

/**
 * Convert arbitrary text into a normalized slug suitable for routing and comparisons.
 * - Removes diacritics and punctuation.
 * - Collapses whitespace and separators.
 * - Returns lowercase alpha-numeric string.
 *
 * @param {unknown} value
 * @returns {string}
 */
export const slugify = (value) => {
  if (value === null || value === undefined) {
    return FALLBACK_SLUG;
  }

  try {
    return String(value)
      .normalize('NFD')
      .replace(/\p{Diacritic}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .replace(/^(?:-|_)+|(?:-|_)+$/g, '')
      .trim();
  } catch (error) {
    if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('slugify failed to normalize value, using fallback', { error, value });
    }
    return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '').trim();
  }
};

export default slugify;
