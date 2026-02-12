import json
import os
import re
import tempfile
import unicodedata

import pytest

from test_support import bootstrap_tests, InMemoryRepository, require


bootstrap_tests()

from admin.product_manager.models import Product
from admin.product_manager.services import ProductService, ProductServiceError


def _normalize(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    normalized = "".join(
        ch for ch in normalized if unicodedata.category(ch) != "Mn"
    )
    return re.sub(r"[^a-z0-9]+", "", normalized.lower())


class _CategoryMatch:
    def __init__(self, product_key: str):
        self.product_key = product_key


class StubCategoryService:
    def __init__(self, choices):
        self._choices = list(choices)
        self._lookup = {}
        for label, key in self._choices:
            self._lookup[_normalize(label)] = key
            self._lookup[_normalize(key)] = key

    def attach_product_service(self, _service) -> None:
        return None

    def list_category_choices(self):
        return list(self._choices)

    def find_category_by_product_key(self, value: str):
        key = self._lookup.get(_normalize(value))
        if not key:
            return None
        return _CategoryMatch(key)

    def resolve_category_key(self, value: str):
        return self._lookup.get(_normalize(value))


def _build_service() -> ProductService:
    repo = InMemoryRepository([])
    category_service = StubCategoryService(
        [
            ("Carnes y Embutidos", "Carnesyembutidos"),
            ("Bebidas", "Bebidas"),
        ]
    )
    return ProductService(repo, category_service=category_service)


def test_add_product_normalizes_legacy_category_label() -> None:
    service = _build_service()
    product = Product(
        name="Producto Normalizado",
        description="Etiqueta legacy",
        price=1200,
        category="carnes y embutídos",
    )

    service.add_product(product)
    stored = service.get_product_by_name(
        "Producto Normalizado", "Etiqueta legacy"
    )
    require(
        stored.category == "Carnesyembutidos",
        "Expected product category to be stored as canonical key",
    )


def test_import_plan_normalizes_legacy_category_label() -> None:
    service = _build_service()
    payload = [
        Product(
            name="Importado",
            description="Desde JSON",
            price=990,
            category="Carnes y Embutidos",
        ).to_dict()
    ]

    with tempfile.NamedTemporaryFile(
        "w", suffix=".json", delete=False, encoding="utf-8"
    ) as temp_file:
        json.dump(payload, temp_file, ensure_ascii=False)
        temp_path = temp_file.name

    try:
        plan = service.build_import_plan(temp_path)
    finally:
        os.unlink(temp_path)

    summary = plan.get("summary", {})
    require(summary.get("invalid") == 0, "Expected import row to be valid")
    rows = plan.get("rows", [])
    require(len(rows) == 1, "Expected one import row")
    incoming = rows[0].get("incoming")
    require(incoming is not None, "Expected incoming product in import row")
    require(
        incoming.category == "Carnesyembutidos",
        "Expected import plan to normalize category to canonical key",
    )


def test_save_all_products_rejects_unknown_category() -> None:
    service = _build_service()
    invalid = Product(
        name="Inválido",
        description="Categoría inexistente",
        price=800,
        category="CategoriaQueNoExiste",
    )
    with pytest.raises(ProductServiceError):
        service.save_all_products([invalid])
