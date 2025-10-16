const DEFAULT_CURRENCY_CODE = 'CLP';
const normalizeCurrencyCode = (currencyCode) => {
  if (typeof currencyCode !== 'string') {
    return DEFAULT_CURRENCY_CODE;
  }
  const trimmed = currencyCode.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(trimmed)) {
    return trimmed;
  }
  return DEFAULT_CURRENCY_CODE;
};
const createCurrencyFormatter = (currencyCode) => {
  const fallbackCode = normalizeCurrencyCode(currencyCode);
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: fallbackCode, minimumFractionDigits: 0 });
};
console.log(createCurrencyFormatter(null).format(123));
console.log(createCurrencyFormatter('null').format(123));
