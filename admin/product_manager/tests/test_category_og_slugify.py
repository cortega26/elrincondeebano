from pathlib import Path

import pytest

from test_support import bootstrap_tests

bootstrap_tests()

from admin.product_manager.category_repository import JsonCategoryRepository  # noqa: E402
from admin.product_manager.category_service import CategoryService, CategoryServiceError  # noqa: E402
from tools.category_og.slug import SlugError, slugify_category  # noqa: E402


def test_slugify_category_normalizes_accents_and_spacing() -> None:
    assert slugify_category("  Lácteos   Frescos ") == "lacteos_frescos"  # nosec B101
    assert slugify_category("Cerveza!!! Premium") == "cerveza_premium"  # nosec B101
    assert slugify_category("Snacks 123") == "snacks_123"  # nosec B101


def test_slugify_category_rejects_empty_result() -> None:
    with pytest.raises(SlugError):
        slugify_category("***")


def test_category_service_blocks_slug_collision(tmp_path: Path) -> None:
    repository = JsonCategoryRepository(str(tmp_path / "categories.json"))
    service = CategoryService(repository)

    service.create_nav_group(label="General", group_id="general")
    first = service.create_category(title="Lácteos Frescos", group_id="general")
    assert first.slug == "lacteos_frescos"  # nosec B101 - pytest assertion

    with pytest.raises(CategoryServiceError):
        service.create_category(title="Lacteos Frescos", group_id="general")
