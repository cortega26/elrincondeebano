"""Characterization tests for BulkOperationsMixin — undo/redo stacks and payload construction."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from admin.product_manager.services import ProductServiceError
from admin.product_manager.ui.bulk_operations_mixin import BulkOperationsMixin
from conftest import (
    FakeTreeview,
    FakeTk,
    FakeWidget,
    create_test_product,
)


class BulkMixinTestHost(BulkOperationsMixin):
    """Minimal host for testing BulkOperationsMixin methods headlessly."""

    def __init__(self, product_service, *, preview_result=True):
        self.master = FakeTk()
        self.product_service = product_service
        self.tree = FakeTreeview(columns=["name", "description", "price", "discount", "stock", "category"])
        self._undo_stack = []
        self._redo_stack = []
        self._undo_max = 20
        self.undo_btn = FakeWidget()
        self.redo_btn = FakeWidget()
        self._refresh_called = False
        self._last_status = ""
        self._selected_products = []
        self._preview_result = preview_result
        self.category_service = None
        self.category_helper = None

    def _get_selected_products(self):
        return list(self._selected_products)

    def refresh_products(self):
        self._refresh_called = True

    def update_status(self, message):
        self._last_status = message

    def _update_history_buttons(self):
        pass

    def _show_preview_dialog(self, content):
        return self._preview_result


@pytest.fixture
def mock_svc():
    svc = MagicMock()
    svc.batch_update.return_value = None
    svc.get_category_choices.return_value = [("Bebidas", "bebidas"), ("Snacks", "snacks")]
    return svc


@pytest.fixture
def host(mock_svc):
    return BulkMixinTestHost(mock_svc)


class TestPreviewAndApply:
    """Characterize _preview_and_apply_operation."""

    def test_creates_undo_entry_on_apply(self, host):
        p = create_test_product(name="Item1", description="d", price=100, category="bebidas")
        new_p = create_test_product(name="Item1", description="d", price=150, category="bebidas")
        pairs = [(p, new_p)]

        host._preview_and_apply_operation("Test op", pairs)
        assert host._refresh_called
        assert "Test op" in host._last_status
        assert len(host._undo_stack) == 1
        assert host._undo_stack[0]["description"] == "Test op"
        assert len(host._redo_stack) == 0

    def test_redo_cleared_on_new_operation(self, host):
        p = create_test_product(name="Item1", description="d", price=100)
        new_p = create_test_product(name="Item1", description="d", price=150)
        pairs = [(p, new_p)]

        host._preview_and_apply_operation("op1", pairs)
        host._redo_stack.append({"desc": "stale"})
        host._preview_and_apply_operation("op2", pairs)
        assert len(host._redo_stack) == 0

    def test_undo_respects_max_capacity(self, host):
        host._undo_max = 3
        for i in range(5):
            p = create_test_product(name=f"Item{i}", description="d", price=100)
            new_p = create_test_product(name=f"Item{i}", description="d", price=150)
            host._preview_and_apply_operation(f"op{i}", [(p, new_p)])
        assert len(host._undo_stack) == 3

    def test_preview_rejected_does_not_apply(self, host):
        host._preview_result = False
        p = create_test_product(name="X", description="d", price=100)
        new_p = create_test_product(name="X", description="d", price=200)
        host._preview_and_apply_operation("rejected", [(p, new_p)])
        assert len(host._undo_stack) == 0
        assert not host._refresh_called

    def test_empty_pairs_are_noop(self, host):
        host._preview_and_apply_operation("noop", [])
        assert len(host._undo_stack) == 0
        assert not host._refresh_called

    def test_batch_update_called_on_apply(self, host):
        p = create_test_product(name="Item1", description="d", price=100)
        new_p = create_test_product(name="Item1", description="d", price=200)
        host._preview_and_apply_operation("update", [(p, new_p)])
        host.product_service.batch_update.assert_called_once()

    def test_batch_update_error_is_handled(self, host):
        host.product_service.batch_update.side_effect = ProductServiceError("boom")
        with patch("admin.product_manager.ui.bulk_operations_mixin.messagebox") as mock_mb:
            p = create_test_product(name="ErrItem", description="d", price=100)
            new_p = create_test_product(name="ErrItem", description="d", price=200)
            host._preview_and_apply_operation("bad", [(p, new_p)])
            mock_mb.showerror.assert_called_once()


class TestUndoRedo:
    """Characterize undo_last and redo_last."""

    def test_undo_restores_previous_state(self, host):
        old = create_test_product(name="Old", description="d", price=100)
        new = create_test_product(name="Old", description="d", price=200)
        host._undo_stack.append({"description": "test undo", "do": [("Old", "d", new)], "undo": [("Old", "d", old)]})
        host.undo_last()
        host.product_service.batch_update.assert_called_once_with([("Old", "d", old)])
        assert len(host._redo_stack) == 1
        assert host._refresh_called

    def test_undo_empty_stack_is_noop(self, host):
        host.undo_last()
        host.product_service.batch_update.assert_not_called()

    def test_redo_reapplies_operation(self, host):
        old = create_test_product(name="Old", description="d", price=100)
        new = create_test_product(name="Old", description="d", price=200)
        host._redo_stack.append({"description": "test redo", "do": [("Old", "d", new)], "undo": [("Old", "d", old)]})
        host.redo_last()
        host.product_service.batch_update.assert_called_once_with([("Old", "d", new)])
        assert len(host._undo_stack) == 1
        assert host._refresh_called

    def test_redo_empty_stack_is_noop(self, host):
        host.redo_last()
        host.product_service.batch_update.assert_not_called()

    def test_undo_then_redo_restores_stack(self, host):
        old = create_test_product(name="Old", description="d", price=100)
        new = create_test_product(name="Old", description="d", price=200)
        host._undo_stack.append({"description": "op", "do": [("Old", "d", new)], "undo": [("Old", "d", old)]})
        host.undo_last()
        assert len(host._undo_stack) == 0
        host.redo_last()
        assert len(host._undo_stack) == 1

    def test_undo_with_service_error_is_handled(self, host):
        host.product_service.batch_update.side_effect = ProductServiceError("undo failed")
        with patch("admin.product_manager.ui.bulk_operations_mixin.messagebox") as mock_mb:
            old = create_test_product(name="Old", description="d", price=100)
            new = create_test_product(name="Old", description="d", price=200)
            host._undo_stack.append({"description": "op", "do": [("Old", "d", new)], "undo": [("Old", "d", old)]})
            host.undo_last()
            mock_mb.showerror.assert_called_once()
