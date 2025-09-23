import json
import sys
import types
from pathlib import Path


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

from admin.product_manager.repositories import JsonProductRepository


def test_repair_database_recovers_wrapped_payload(tmp_path) -> None:
  products_path = tmp_path / 'products.json'
  corrupted_payload = {
    'version': 'legacy',
    'last_updated': '2024-06-01T00:00:00',
    'products': [
      {
        'name': 'Café en grano',
        'description': 'Tueste medio de origen colombiano.',
        'price': 2500
      },
      {
        'name': 'Entrada corrupta',
        'description': 'No incluye precio.'
      }
    ],
    'metadata': {'source': 'backup'}
  }
  products_path.write_text(
    json.dumps(corrupted_payload),
    encoding=JsonProductRepository.ENCODING
  )

  repository = JsonProductRepository(file_name=str(products_path))

  assert repository.repair_database() is True

  with products_path.open(encoding=JsonProductRepository.ENCODING) as handler:
    repaired_data = json.load(handler)

  assert repaired_data.get('version') != 'legacy'
  products = repaired_data.get('products', [])
  assert len(products) == 1
  assert products[0]['name'] == 'Café en grano'
  assert products[0]['price'] == 2500
  assert 'Entrada corrupta' not in json.dumps(products)
