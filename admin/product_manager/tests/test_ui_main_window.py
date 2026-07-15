"""Characterization tests for MainWindow filter criteria and selection lookup."""

from __future__ import annotations

from unittest.mock import MagicMock, patch


from admin.product_manager.services import ProductService
from admin.product_manager.ui.main_window import MainWindow
from conftest import (
    FakeBooleanVar,
    FakeStringVar,
    FakeTreeview,
    FakeTk,
    create_test_product,
)


class TestFilterCriteria:
    """Characterize _build_filter_criteria behaviour."""

    @staticmethod
    def _build_window(**overrides):
        window = MainWindow.__new__(MainWindow)
        window.search_var = FakeStringVar(overrides.get("search", ""))
        window.category_var = FakeStringVar(overrides.get("category", "Todas"))
        window.category_helper = overrides.get("category_helper", None)
        window.only_discount_var = FakeBooleanVar(overrides.get("only_discount", False))
        window.only_out_of_stock_var = FakeBooleanVar(overrides.get("only_out_of_stock", False))
        window._only_in_stock_override = overrides.get("only_in_stock", False)
        window.min_price_var = FakeStringVar(overrides.get("min_price", ""))
        window.max_price_var = FakeStringVar(overrides.get("max_price", ""))
        window.show_archived_var = FakeBooleanVar(overrides.get("show_archived", False))
        return window

    def test_defaults_yield_empty_criteria(self):
        window = self._build_window()
        criteria = window._build_filter_criteria()
        assert criteria.query is None
        assert criteria.category is None
        assert criteria.min_price is None
        assert criteria.max_price is None
        assert criteria.only_discount is False
        assert criteria.only_in_stock is False
        assert criteria.only_out_of_stock is False
        assert criteria.show_archived_only is False

    def test_search_query_propagates(self):
        window = self._build_window(search="empanada")
        criteria = window._build_filter_criteria()
        assert criteria.query == "empanada"

    def test_category_is_extracted_when_helper_present(self):
        helper = MagicMock()
        helper.get_key_from_display.return_value = "cat_key"
        window = self._build_window(category="Display Name", category_helper=helper)
        criteria = window._build_filter_criteria()
        assert criteria.category == "cat_key"

    def test_category_null_when_label_is_todas(self):
        helper = MagicMock()
        window = self._build_window(category="Todas", category_helper=helper)
        criteria = window._build_filter_criteria()
        assert criteria.category is None

    def test_only_discount_flag_toggled(self):
        window = self._build_window(only_discount=True)
        criteria = window._build_filter_criteria()
        assert criteria.only_discount is True

    def test_only_out_of_stock_flag_toggled(self):
        window = self._build_window(only_out_of_stock=True)
        criteria = window._build_filter_criteria()
        assert criteria.only_out_of_stock is True

    def test_only_in_stock_override(self):
        window = self._build_window(only_in_stock=True)
        criteria = window._build_filter_criteria()
        assert criteria.only_in_stock is True

    def test_min_price_parsed(self):
        window = self._build_window(min_price="1500")
        criteria = window._build_filter_criteria()
        assert criteria.min_price == 1500.0

    def test_max_price_parsed(self):
        window = self._build_window(max_price="5000")
        criteria = window._build_filter_criteria()
        assert criteria.max_price == 5000.0

    def test_show_archived_only(self):
        window = self._build_window(show_archived=True)
        criteria = window._build_filter_criteria()
        assert criteria.show_archived_only is True

    def test_invalid_price_ignored(self):
        window = self._build_window(min_price="abc", max_price="xyz")
        criteria = window._build_filter_criteria()
        assert criteria.min_price is None
        assert criteria.max_price is None


class TestSelectionLookup:
    """Characterize _get_selected_products and get_product_by_tree_item."""

    @staticmethod
    def _build_window():
        window = MainWindow.__new__(MainWindow)
        window.tree = FakeTreeview(columns=("name", "description", "price", "discount", "stock", "category"))
        window._current_products = []
        window.category_helper = None
        product_service = MagicMock(spec=ProductService)
        window.product_service = product_service
        window._name_to_product = {}
        product_service.get_product_by_name.side_effect = lambda name, desc=None: window._name_to_product.get(name)
        return window

    def _insert_product_in_tree(self, window, product):
        values = {
            "name": product.name,
            "description": product.description,
            "price": str(product.price),
            "discount": str(product.discount),
            "stock": "☑" if product.stock else "☐",
            "category": product.category,
        }
        iid = window.tree.insert("", "end", **values)
        window._current_products.append(product)
        window._name_to_product[product.name] = product
        return iid

    def test_empty_selection_returns_empty(self):
        window = self._build_window()
        assert window._get_selected_products() == []

    def test_single_selection_returns_product(self):
        window = self._build_window()
        p = create_test_product(name="Café", description="Negro", price=500, category="Bebidas")
        iid = self._insert_product_in_tree(window, p)
        window.tree._selected = [iid]

        selected = window._get_selected_products()
        assert len(selected) == 1
        assert selected[0].name == "Café"
        assert selected[0].category == "Bebidas"

    def test_multi_selection_returns_all_products(self):
        window = self._build_window()
        p1 = create_test_product(name="A", description="a", price=100)
        p2 = create_test_product(name="B", description="b", price=200)
        iid1 = self._insert_product_in_tree(window, p1)
        iid2 = self._insert_product_in_tree(window, p2)
        window.tree._selected = [iid1, iid2]

        selected = window._get_selected_products()
        assert len(selected) == 2

    def test_get_product_by_name_fallback(self):
        window = self._build_window()
        p = create_test_product(name="Unique", description="One of a kind", price=300, category="Snacks")
        iid = self._insert_product_in_tree(window, p)

        result = window.get_product_by_tree_item(iid)
        assert result is not None
        assert result.name == "Unique"
        assert result.price == 300

    def test_get_product_by_name_returns_none_for_unknown(self):
        window = self._build_window()
        assert window.get_product_by_tree_item("bogus_id") is None


class TestConfigLoadSave:
    """Characterize _load_config and _save_config merge behaviour."""

    def test_load_config_returns_defaults_when_file_missing(self, tmp_path):
        window = MainWindow.__new__(MainWindow)
        with patch("pathlib.Path.home", return_value=tmp_path):
            config = window._load_config()
            assert config.font_size == 10
            assert config.view_mode == "list"

    def test_load_config_restores_saved_values(self, tmp_path):
        import json

        config_dir = tmp_path / ".product_manager"
        config_dir.mkdir(parents=True, exist_ok=True)
        config_file = config_dir / "config.json"
        saved = {"font_size": 14, "enable_animations": False, "view_mode": "gallery", "window_size": [1024, 768]}
        config_file.write_text(json.dumps(saved), encoding="utf-8")

        window = MainWindow.__new__(MainWindow)
        with patch("pathlib.Path.home", return_value=tmp_path):
            config = window._load_config()
            assert config.font_size == 14
            assert config.enable_animations is False
            assert config.view_mode == "gallery"
            assert config.window_size == (1024, 768) or config.window_size == [1024, 768]

    def test_save_config_merges_existing(self, tmp_path):
        import json

        config_file = tmp_path / "config.json"
        config_file.parent.mkdir(parents=True, exist_ok=True)
        config_file.write_text(json.dumps({"locale": "es", "existing_key": "keep_me"}), encoding="utf-8")

        with patch.object(MainWindow, "_get_config_path", return_value=config_file):
            window = MainWindow.__new__(MainWindow)
            window.config = MagicMock()
            window.config.font_size = 12
            window.config.enable_animations = True
            window.config.window_size = (800, 600)
            window.config.locale = "es"
            window.config.column_widths = {}
            window.view_mode = "list"
            window._capture_column_widths = lambda: None
            window._save_config()

            saved_data = json.loads(config_file.read_text(encoding="utf-8"))
            assert saved_data["font_size"] == 12
            assert saved_data["existing_key"] == "keep_me"
            assert saved_data["locale"] == "es"

    def test_save_config_schedules_debounced(self):
        window = MainWindow.__new__(MainWindow)
        window.master = FakeTk()
        window._config_save_job = None
        window._config_save_delay_ms = 500

        with patch.object(window, "_save_config"):
            window._schedule_config_save()
            assert window._config_save_job is not None
            # A second call cancels the previous job
            old_job = window._config_save_job
            window._schedule_config_save()
            assert window._config_save_job != old_job


class TestRefreshProducts:
    """Characterize refresh_products flow."""

    def test_refresh_populates_tree_with_filtered_results(self):
        window = MainWindow.__new__(MainWindow)
        window.search_var = FakeStringVar("")
        window.category_var = FakeStringVar("Todas")
        window.category_helper = None
        window.min_price_var = FakeStringVar("")
        window.max_price_var = FakeStringVar("")
        window.only_discount_var = FakeBooleanVar(False)
        window.only_out_of_stock_var = FakeBooleanVar(False)
        window._only_in_stock_override = False
        window.show_archived_var = FakeBooleanVar(False)
        window.status_var = FakeStringVar("")
        window.filter_status_var = FakeStringVar("Sin filtros")
        window.logger = MagicMock()

        p = create_test_product(name="Galletas", description="Crujientes", price=200)
        mock_svc = MagicMock()
        mock_svc.filter_products.return_value = [p]
        mock_svc.get_category_choices.return_value = [("Galletas", "galletas")]
        window.product_service = mock_svc

        window.tree = FakeTreeview(columns=("name", "description", "price", "discount", "stock", "category"))
        window._current_products = []
        window.columns = {
            "name": {"text": "Nombre"},
            "description": {"text": "Descripción"},
            "price": {"text": "Precio"},
            "discount": {"text": "Descuento"},
            "stock": {"text": "Stock"},
            "category": {"text": "Categoría"},
        }
        window.update_filter_indicator = lambda: None
        window._update_archive_controls = lambda: None
        window._refresh_stats_dashboard = lambda: None
        window._category_display_label = lambda cat: cat
        window.treeview_manager = MagicMock()
        window.tree_frame = MagicMock()
        window.tree_frame.winfo_ismapped.return_value = True
        window.gallery = MagicMock()
        window.gallery.winfo_ismapped.return_value = False
        window.view_mode = "list"

        window.refresh_products()

        mock_svc.filter_products.assert_called_once()
        assert len(window.tree.get_children()) == 1
        assert "Mostrando" in window.status_var.get()
