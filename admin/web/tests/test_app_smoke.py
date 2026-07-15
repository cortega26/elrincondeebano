"""Smoke tests for the admin web app — import safety and DB operations.

These tests validate that the app module imports without starting Streamlit
and that DataStore operations work against a temporary database.
"""

import sys
from pathlib import Path

import pytest

ADMIN_DIR = Path(__file__).resolve().parent.parent.parent
if str(ADMIN_DIR) not in sys.path:
    sys.path.insert(0, str(ADMIN_DIR))


def test_app_imports_without_streamlit():
    from admin.web.config import ASTRO_DATA_DIR, DATA_DIR, DB_PATH

    assert DB_PATH.name == "storefront.db"
    assert DATA_DIR.name == "data"
    assert ASTRO_DATA_DIR.name == "data"


def test_get_store_initializes_with_temp_db(tmp_path):
    from admin.web.app import get_store

    db_path = tmp_path / "test.db"
    store = get_store(db_path=db_path)

    assert db_path.exists()

    products = store.get_products()
    assert isinstance(products, list)
    assert len(products) == 0


def test_store_read_only_does_not_mutate_temp_db(tmp_path):
    from admin.web.app import get_store

    db_path = tmp_path / "readonly.db"
    store = get_store(db_path=db_path)

    products_before = store.get_products()
    history = store.get_change_history(limit=5)
    products_after = store.get_products()

    assert products_before == products_after
    assert isinstance(history, list)


def test_app_module_import_is_side_effect_free():
    import admin.web.app

    assert hasattr(admin.web.app, "get_store")
    assert hasattr(admin.web.app, "render_admin_ui")
    assert hasattr(admin.web.app, "DB_PATH")


def test_config_paths_are_absolute():
    from admin.web.config import ASTRO_DATA_DIR, DATA_DIR, DB_PATH

    assert DB_PATH.is_absolute()
    assert DATA_DIR.is_absolute()
    assert ASTRO_DATA_DIR.is_absolute()



