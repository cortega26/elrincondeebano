from test_support import (
  bootstrap_tests,
  InMemoryRepository,
  require,
)


bootstrap_tests()

from admin.product_manager.models import Product
from admin.product_manager.services import ProductService


def test_get_all_products_returns_defensive_copy() -> None:
  repo = InMemoryRepository([
      Product(name='Producto 1', description='Descripción', price=1000)
  ])
  service = ProductService(repo)

  first_result = service.get_all_products()
  second_result = service.get_all_products()

  first_result.pop()

  require(len(second_result) == 1, 'Expected defensive copy to remain intact')
  require(len(service.get_all_products()) == 1, 'Expected repository to remain intact')
