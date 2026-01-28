import sys
import types
from pathlib import Path
from typing import Iterable, List, Any, Optional, cast


def bootstrap_tests() -> None:
    """Ensure import paths and optional portalocker stub are ready for tests."""
    root_path = Path(__file__).resolve().parents[3]
    if str(root_path) not in sys.path:
        sys.path.insert(0, str(root_path))

    module_path = Path(__file__).resolve().parents[1]
    if str(module_path) not in sys.path:
        sys.path.insert(0, str(module_path))

    if 'portalocker' not in sys.modules:
        portalocker_stub = cast(Any, types.ModuleType('portalocker'))
        portalocker_stub.LOCK_EX = 0
        portalocker_stub.LOCK_SH = 0

        def _noop(*_args, **_kwargs) -> None:
            return None

        portalocker_stub.lock = _noop
        portalocker_stub.unlock = _noop
        sys.modules['portalocker'] = portalocker_stub


class InMemoryRepository:
    """Repositorio en memoria para pruebas del servicio."""

    def __init__(self, products: Iterable[Any]):
        self._products = list(products)

    def load_products(self) -> List[Any]:
        return list(self._products)

    def save_products(
        self, products: Iterable[Any], metadata: Optional[dict] = None
    ) -> None:
        self._products = list(products)

    def get_catalog_meta(self) -> dict:
        return {}


def require(condition: bool, message: str = 'Expected condition to be true') -> None:
    if not condition:
        raise AssertionError(message)
