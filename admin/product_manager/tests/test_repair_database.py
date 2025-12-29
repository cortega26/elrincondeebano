import json

from test_support import bootstrap_tests


bootstrap_tests()

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
