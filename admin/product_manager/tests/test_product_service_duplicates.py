import pytest

from admin.product_manager.tests.test_support import (
  bootstrap_tests,
  InMemoryRepository,
)


bootstrap_tests()

from admin.product_manager.models import Product
from admin.product_manager.services import (
  DuplicateProductError,
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
  assert len(products) == 2
  assert {p.description for p in products} == {'Original', 'Variante'}


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
  assert selected.price == 900


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
  assert refreshed.price == 1500


def test_delete_product_with_duplicate_name_removes_exact_match() -> None:
  repo = InMemoryRepository([
      Product(name='Producto', description='Original', price=1000),
      Product(name='Producto', description='Variante', price=900),
  ])
  service = ProductService(repo)

  removed = service.delete_product('Producto', 'Variante')
  assert removed is True
  remaining = service.get_all_products()
  assert len(remaining) == 1
  assert remaining[0].description == 'Original'
