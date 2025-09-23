import json
import sys
from pathlib import Path

ROOT_PATH = Path(__file__).resolve().parents[3]
if str(ROOT_PATH) not in sys.path:
    sys.path.insert(0, str(ROOT_PATH))

MODULE_PATH = Path(__file__).resolve().parents[1]
if str(MODULE_PATH) not in sys.path:
    sys.path.insert(0, str(MODULE_PATH))

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

    assert products_path.exists()
    assert products_path.parent == repo._file_path.parent
    with products_path.open(encoding=JsonProductRepository.ENCODING) as handler:
        saved_data = json.load(handler)
    assert saved_data['products'][0]['name'] == product.name
    assert not any(item.name.startswith('C:') for item in tmp_path.iterdir())

    repo.save_products([product])
    backups = sorted(products_path.parent.glob(f'*{JsonProductRepository.BACKUP_SUFFIX}*'))
    assert backups, 'Se debe crear un respaldo en el mismo directorio'
    for backup in backups:
        assert backup.parent == products_path.parent
