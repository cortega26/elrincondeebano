import sys
import types
from pathlib import Path
from typing import List


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
from admin.product_manager.services import ProductService
from admin.product_manager.repositories import ProductRepositoryProtocol


class InMemoryRepository(ProductRepositoryProtocol):
  """Repositorio en memoria para pruebas del servicio."""

  def __init__(self, products: List[Product]):
    self._products = list(products)

  def load_products(self) -> List[Product]:
    return list(self._products)

  def save_products(self, products: List[Product]) -> None:
    self._products = list(products)


def test_get_all_products_returns_defensive_copy() -> None:
  repo = InMemoryRepository([
      Product(name='Producto 1', description='Descripción', price=1000)
  ])
  service = ProductService(repo)

  first_result = service.get_all_products()
  second_result = service.get_all_products()

  first_result.pop()

  assert len(second_result) == 1
  assert len(service.get_all_products()) == 1
