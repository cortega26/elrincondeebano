import json

from test_support import bootstrap_tests, require


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

  require(repository.repair_database() is True, 'Expected repair_database to return True')

  with products_path.open(encoding=JsonProductRepository.ENCODING) as handler:
    repaired_data = json.load(handler)

  require(repaired_data.get('version') != 'legacy', 'Expected repaired version to change')
  products = repaired_data.get('products', [])
  require(len(products) == 1, 'Expected one valid product after repair')
  require(products[0]['name'] == 'Café en grano', 'Expected repaired product name')
  require(products[0]['price'] == 2500, 'Expected repaired product price')
  require('Entrada corrupta' not in json.dumps(products), 'Expected corrupt entry removed')
