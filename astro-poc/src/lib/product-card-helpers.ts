import {
  getProductCardImageSource,
  type ResponsiveImageSource,
  type ProductRecord,
} from './catalog';

export interface ProductCardData {
  price: number;
  discount: number;
  finalPrice: number;
  hasDiscount: boolean;
  discountPercent: number;
  searchText: string;
  imageSource: ResponsiveImageSource;
  avifImageSource: ResponsiveImageSource | null;
  dataAttributes: Record<string, string>;
}

export function computeProductCardData(product: ProductRecord, index: number): ProductCardData {
  const price = typeof product.price === 'number' ? product.price : 0;
  const discount = typeof product.discount === 'number' ? product.discount : 0;
  const finalPrice = Math.max(price - discount, 0);
  const hasDiscount = discount > 0 && price > 0 && finalPrice < price;
  const discountPercent = hasDiscount ? Math.round((discount / price) * 100) : 0;

  const searchText = [product.name, product.description, product.category]
    .filter(Boolean)
    .join(' ');

  const imageSource = getProductCardImageSource(product.image_path);
  const avifPath = product.image_avif_path;
  const avifImageSource = avifPath ? getProductCardImageSource(avifPath) : null;

  const dataAttributes: Record<string, string> = {
    'data-product-name': String(product.name || ''),
    'data-product-category': String(product.category || ''),
    'data-product-description': String(product.description || ''),
    'data-product-search-text': searchText,
    'data-product-price': String(price),
    'data-product-discount': String(discount),
    'data-product-final-price': String(finalPrice),
    'data-product-has-discount': hasDiscount ? 'true' : 'false',
    'data-product-discount-percent': String(discountPercent),
    'data-product-order': String(index),
    'data-product-stock': String(product.stock ?? true),
  };

  return {
    price,
    discount,
    finalPrice,
    hasDiscount,
    discountPercent,
    searchText,
    imageSource,
    avifImageSource,
    dataAttributes,
  };
}
