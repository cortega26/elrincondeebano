import sys
import types
from pathlib import Path
from typing import Any, Dict, List, Optional

import pytest


if 'portalocker' not in sys.modules:
  portalocker_stub = types.ModuleType('portalocker')
  portalocker_stub.LOCK_EX = 0
  portalocker_stub.LOCK_SH = 0

  def _noop(*_args, **_kwargs) -> None:
    return None

  portalocker_stub.lock = _noop
  portalocker_stub.unlock = _noop
  sys.modules['portalocker'] = portalocker_stub

ROOT_PATH = Path(__file__).resolve().parents[3]
if str(ROOT_PATH) not in sys.path:
  sys.path.insert(0, str(ROOT_PATH))

MODULE_PATH = Path(__file__).resolve().parents[1]
if str(MODULE_PATH) not in sys.path:
  sys.path.insert(0, str(MODULE_PATH))

from admin.product_manager.models import Product
from admin.product_manager.services import (
  DuplicateProductError,
  ProductService,
  ProductServiceError,
)
from admin.product_manager.repositories import ProductRepositoryProtocol


class InMemoryRepository(ProductRepositoryProtocol):
  """Simple in-memory repository used for service tests."""

  def __init__(self, products: List[Product]):
    self._products = list(products)
    self._metadata: Dict[str, Any] = {}

  def load_products(self) -> List[Product]:
    return list(self._products)

  def save_products(self, products: List[Product], metadata: Optional[Dict[str, Any]] = None) -> None:
    self._products = list(products)
    if metadata is not None:
      self._metadata = dict(metadata)


class StubSyncEngine:
  """Capture sync enqueue payloads for assertions."""

  def __init__(self) -> None:
    self.calls: List[Dict[str, Any]] = []

  def enqueue_update(self, **payload: Any) -> None:
    self.calls.append(payload)


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


def test_update_product_enqueues_identity_key_for_duplicate_name() -> None:
  original = Product(name='Producto', description='Original', price=1000)
  variant = Product(name='Producto', description='Variante', price=900)
  repo = InMemoryRepository([original, variant])
  service = ProductService(repo)
  sync_stub = StubSyncEngine()
  service.sync_engine = sync_stub

  updated_variant = Product(name='Producto', description='Variante', price=950)
  service.update_product('Producto', updated_variant, 'Variante')

  assert sync_stub.calls, 'expected sync payload to be enqueued'
  payload = sync_stub.calls[0]
  expected_identity = Product.identity_key_from_values('Producto', 'Variante')
  assert payload['product_id'] == expected_identity


def test_apply_server_snapshot_targets_matching_identity_key() -> None:
  original = Product(name='Producto', description='Original', price=1000)
  variant = Product(name='Producto', description='Variante', price=900)
  repo = InMemoryRepository([original, variant])
  service = ProductService(repo)

  snapshot = variant.to_dict()
  snapshot['price'] = 975

  service.apply_server_snapshot(snapshot, catalog_rev=2)

  refreshed_variant = service.get_product_by_name('Producto', 'Variante')
  assert refreshed_variant.price == 975
  untouched_original = service.get_product_by_name('Producto', 'Original')
  assert untouched_original.price == 1000
