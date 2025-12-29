import json
from pathlib import Path

from test_support import bootstrap_tests, require


bootstrap_tests()

from admin.product_manager.models import Product
from admin.product_manager.repositories import JsonProductRepository


def test_absolute_path_uses_provided_directory(tmp_path: Path) -> None:
    products_path = tmp_path / 'nested' / 'products.json'
    repo = JsonProductRepository(file_name=str(products_path))

    product = Product(
        name='Producto de prueba',
        description='Descripción',
        price=1000
    )

    repo.save_products([product])

    require(products_path.exists(), 'Expected products.json to be created')
    require(products_path.parent == repo._file_path.parent, 'Expected repository path to match')
    with products_path.open(encoding=JsonProductRepository.ENCODING) as handler:
        saved_data = json.load(handler)
    require(
        saved_data['products'][0]['name'] == product.name,
        'Expected saved product name to match'
    )
    require(
        not any(item.name.startswith('C:') for item in tmp_path.iterdir()),
        'Expected no stray drive-prefixed paths'
    )

    repo.save_products([product])
    backups = sorted(products_path.parent.glob(f'*{JsonProductRepository.BACKUP_SUFFIX}*'))
    require(backups, 'Se debe crear un respaldo en el mismo directorio')
    for backup in backups:
        require(backup.parent == products_path.parent, 'Expected backup in same directory')
