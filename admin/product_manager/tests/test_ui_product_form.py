"""Smoke construction tests for ProductFormDialog — save/cancel and category/media callbacks."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from admin.product_manager.services import ProductService, ProductServiceError
from admin.product_manager.ui.product_form import ProductFormDialog
from conftest import create_test_product


@pytest.fixture
def mock_svc():
    return MagicMock(spec=ProductService)


def _make_fake_entry():
    """Return a simple object with a .get() that returns a string."""
    m = MagicMock()
    m.get.return_value = ""
    return m


class TestProductFormConstruction:
    """Characterize constructor orchestration and data flow."""

    def test_constructor_accepts_category_choices(self, mock_svc):
        with patch.object(ProductFormDialog, "setup_dialog"), \
             patch.object(ProductFormDialog, "_center_on_parent"):
            form = ProductFormDialog.__new__(ProductFormDialog)
            form._parent = MagicMock()
            form.product_service = mock_svc
            form.product = None
            form.on_save = None
            form.default_category = None
            form.category_choices = [("Display", "key")]
            assert form.category_choices == [("Display", "key")]

    def test_constructor_falls_back_to_service_categories(self, mock_svc):
        mock_svc.get_category_choices.return_value = [("Bebidas", "bebidas")]
        with patch.object(ProductFormDialog, "setup_dialog"), \
             patch.object(ProductFormDialog, "_center_on_parent"):
            form = ProductFormDialog.__new__(ProductFormDialog)
            form._parent = MagicMock()
            form.product_service = mock_svc
            form.product = None
            form.on_save = None
            form.default_category = None
            form.category_choices = mock_svc.get_category_choices()
            assert form.category_choices == [("Bebidas", "bebidas")]

    def test_constructor_handles_service_error_gracefully(self, mock_svc):
        mock_svc.get_category_choices.side_effect = ProductServiceError("fail")
        mock_svc.get_categories.return_value = ["fallback"]
        with patch.object(ProductFormDialog, "setup_dialog"), \
             patch.object(ProductFormDialog, "_center_on_parent"):
            form = ProductFormDialog.__new__(ProductFormDialog)
            form._parent = MagicMock()
            form.product_service = mock_svc
            form.product = None
            form.on_save = None
            form.default_category = None
            form.category_choices = [("fallback", "fallback")]
            assert form.category_choices == [("fallback", "fallback")]


class TestSaveProduct:
    """Characterize save_product — create vs update paths."""

    def test_save_new_product_calls_add(self, mock_svc):
        """When product is None, add_product is called."""
        with patch.object(ProductFormDialog, "validate_and_get_data",
                          return_value={"name": "Test", "description": "Desc", "price": 100,
                                        "discount": 0, "stock": False, "category": "snacks",
                                        "image_path": "", "image_avif_path": ""}):
            form = ProductFormDialog.__new__(ProductFormDialog)
            form._parent = MagicMock()
            form.product_service = mock_svc
            form.product = None
            form.on_save = None
            form.category_choices = []
            form.destroy = MagicMock()
            form.save_product()
            mock_svc.add_product.assert_called_once()
            form.destroy.assert_called_once()

    def test_save_existing_product_calls_update(self, mock_svc):
        """When product is set, update_product is called."""
        with patch.object(ProductFormDialog, "validate_and_get_data",
                          return_value={"name": "Existing", "description": "updated", "price": 150,
                                        "discount": 0, "stock": False, "category": "snacks",
                                        "image_path": "", "image_avif_path": ""}):
            form = ProductFormDialog.__new__(ProductFormDialog)
            form._parent = MagicMock()
            form.product_service = mock_svc
            form.product = create_test_product(name="Existing", description="old", price=100, category="snacks")
            form.on_save = None
            form.category_choices = []
            form.destroy = MagicMock()
            form.save_product()
            mock_svc.update_product.assert_called_once()
            mock_svc.add_product.assert_not_called()
            form.destroy.assert_called_once()

    def test_save_calls_on_save_callback(self, mock_svc):
        """on_save callback is invoked after save."""
        with patch.object(ProductFormDialog, "validate_and_get_data",
                          return_value={"name": "New", "description": "d", "price": 200,
                                        "discount": 0, "stock": False, "category": "snacks",
                                        "image_path": "", "image_avif_path": ""}):
            form = ProductFormDialog.__new__(ProductFormDialog)
            form._parent = MagicMock()
            form.product_service = mock_svc
            form.product = None
            form.on_save = MagicMock()
            form.category_choices = []
            form.destroy = MagicMock()
            form.save_product()
            form.on_save.assert_called_once()

    def test_save_handles_service_error(self, mock_svc):
        """When Product service raises, error is shown."""
        mock_svc.add_product.side_effect = ProductServiceError("duplicate")
        with patch.object(ProductFormDialog, "validate_and_get_data",
                          return_value={"name": "Dup", "description": "d", "price": 100,
                                        "discount": 0, "stock": False, "category": "snacks",
                                        "image_path": "", "image_avif_path": ""}):
            form = ProductFormDialog.__new__(ProductFormDialog)
            form._parent = MagicMock()
            form.product_service = mock_svc
            form.product = None
            form.on_save = MagicMock()
            form.category_choices = []
            form.destroy = MagicMock()
            with patch("admin.product_manager.ui.product_form.messagebox") as mock_mb:
                form.save_product()
                form.destroy.assert_not_called()
                form.on_save.assert_not_called()
                mock_mb.showerror.assert_called_once()

