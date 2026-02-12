import pytest

from test_support import (
  bootstrap_tests,
  InMemoryRepository,
  require,
)


bootstrap_tests()

from admin.product_manager.models import Product
from admin.product_manager.services import (
  DuplicateProductError,
  ProductFilterCriteria,
  ProductService,
  ProductServiceError,
)


def test_add_product_allows_duplicate_name_with_unique_description() -> None:
  repo = InMemoryRepository([
      Product(name='Producto', description='Original', price=1000)
  ])
  service = ProductService(repo)

  duplicate_name = Product(name='Producto', description='Variante', price=1200)
  service.add_product(duplicate_name)

  products = service.get_all_products()
  require(len(products) == 2, 'Expected two products with same name')
  require(
    {p.description for p in products} == {'Original', 'Variante'},
    'Expected distinct descriptions for duplicate names'
  )


def test_add_product_rejects_exact_identity_duplicate() -> None:
  repo = InMemoryRepository([
      Product(name='Producto', description='Original', price=1000)
  ])
  service = ProductService(repo)
  duplicate_identity = Product(name='Producto', description='Original', price=1200)

  with pytest.raises(DuplicateProductError):
    service.add_product(duplicate_identity)


def test_get_product_by_name_requires_description_with_duplicates() -> None:
  repo = InMemoryRepository([
      Product(name='Producto', description='Original', price=1000),
      Product(name='Producto', description='Variante', price=900),
  ])
  service = ProductService(repo)

  with pytest.raises(ProductServiceError):
    service.get_product_by_name('Producto')

  selected = service.get_product_by_name('Producto', 'Variante')
  require(selected.price == 900, 'Expected selected duplicate price')


def test_update_product_with_duplicate_name_uses_description() -> None:
  base = Product(name='Producto', description='Original', price=1000)
  repo = InMemoryRepository([
      base,
      Product(name='Producto', description='Variante', price=900),
  ])
  service = ProductService(repo)

  updated = Product(name='Producto', description='Original', price=1500)
  service.update_product(base.name, updated, base.description)

  refreshed = service.get_product_by_name('Producto', 'Original')
  require(refreshed.price == 1500, 'Expected updated product price')


def test_delete_product_with_duplicate_name_removes_exact_match() -> None:
  repo = InMemoryRepository([
      Product(name='Producto', description='Original', price=1000),
      Product(name='Producto', description='Variante', price=900),
  ])
  service = ProductService(repo)

  removed = service.delete_product('Producto', 'Variante')
  require(removed is True, 'Expected delete to return True')
  all_products = service.get_all_products()
  require(len(all_products) == 2, 'Expected archived product to remain in catalog')
  archived_variants = [
      p for p in all_products if p.description == 'Variante' and p.is_archived
  ]
  require(len(archived_variants) == 1, 'Expected matching duplicate to be archived')

  remaining_active = service.filter_products(ProductFilterCriteria())
  require(len(remaining_active) == 1, 'Expected one active product after archive')
  require(
      remaining_active[0].description == 'Original',
      'Expected original product to remain active'
  )
