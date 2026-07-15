"""Characterization tests for DeployPanelMixin — status rendering and button-state transitions."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from admin.product_manager.deploy import DeployPipeline, DeployResult
from admin.product_manager.ui.deploy_panel import DeployPanelMixin
from conftest import FakeStringVar, FakeTk, FakeWidget


class DeployMixinTestHost(DeployPanelMixin):
    """Minimal host for testing DeployPanelMixin headlessly."""

    def __init__(self, git_sync=None, deploy_pipeline=None):
        self.master = FakeTk()
        self.git_sync = git_sync
        self.deploy_pipeline = deploy_pipeline
        self._dark_mode = False
        self._deploy_running = False
        self._git_status_job = None
        self.toast_manager = None
        self._deploy_buttons_frame = None
        self._activity_toggle_btn = None
        self._git_indicator = MagicMock()
        self.deploy_status_var = FakeStringVar("")
        self.deploy_btn = FakeWidget()
        self.commit_btn = FakeWidget()
        self.push_btn = FakeWidget()
        self.pull_btn = FakeWidget()
        self._toggle_deploy_btn = FakeWidget()
        self._status_updates = []
        self._sync_refreshed = False
        self._activity_log_tree = None

    def setup_deploy_integration(self):
        DeployPanelMixin.setup_deploy_integration(self)
        self._git_indicator = MagicMock()

    def update_status(self, message):
        self._status_updates.append(message)

    def refresh_sync_status(self):
        self._sync_refreshed = True

    def refresh_products(self):
        pass

    def _paint_git_dot(self, color_key):
        pass

    def _toast(self, message, level=None):
        pass


@pytest.fixture
def git_mock():
    gm = MagicMock()
    gm.is_available.return_value = True
    status = MagicMock()
    status.branch = "main"
    status.dirty = False
    status.change_count = 0
    status.untracked_count = 0
    status.ahead = 0
    status.behind = 0
    status.has_conflicts = False
    gm.get_status.return_value = status
    return gm


@pytest.fixture
def host(git_mock):
    h = DeployMixinTestHost()
    h.setup_deploy_integration()
    h.git_sync = git_mock
    return h


class TestGitStatusRendering:
    """Characterize _refresh_git_status button-state logic."""

    def test_no_git_disables_buttons(self, host):
        host.git_sync = None
        host.deploy_pipeline = None
        host._refresh_git_status()
        assert "Git no detectado" in host.deploy_status_var.get()
        assert host.deploy_btn._config["state"] == "disabled"
        assert host.commit_btn._config["state"] == "disabled"

    def test_conflicts_disables_deploy_and_commit(self, host, git_mock):
        git_mock.get_status.return_value.has_conflicts = True
        host._refresh_git_status()
        assert "CONFLICTOS" in host.deploy_status_var.get()
        assert host.deploy_btn._config["state"] == "disabled"
        assert host.commit_btn._config["state"] == "disabled"

    def test_dirty_enables_commit(self, host, git_mock):
        git_mock.get_status.return_value.dirty = True
        git_mock.get_status.return_value.change_count = 3
        host.deploy_pipeline = None  # no deploy
        host._refresh_git_status()
        assert "3 cambio(s)" in host.deploy_status_var.get()
        assert host.commit_btn._config["state"] == "normal"

    def test_clean_disables_all(self, host, git_mock):
        host.deploy_pipeline = None
        host._refresh_git_status()
        assert "sin cambios" in host.deploy_status_var.get()
        assert host.commit_btn._config["state"] == "disabled"
        assert host.push_btn._config["state"] == "disabled"

    def test_ahead_enables_push(self, host, git_mock):
        git_mock.get_status.return_value.ahead = 2
        host._refresh_git_status()
        assert "2 commit(s) por subir" in host.deploy_status_var.get()
        assert host.push_btn._config["state"] == "normal"
        assert host.commit_btn._config["state"] == "disabled"

    def test_behind_enables_pull(self, host, git_mock):
        git_mock.get_status.return_value.behind = 1
        host._refresh_git_status()
        assert host.pull_btn._config["state"] == "normal"
        assert "+1" in host.deploy_status_var.get()

    def test_no_branch_disables_all(self, host, git_mock):
        git_mock.get_status.return_value.branch = ""
        host._refresh_git_status()
        assert "Sin rama activa" in host.deploy_status_var.get()
        assert host.deploy_btn._config["state"] == "disabled"

    def test_schedules_next_poll(self, host, git_mock):
        host._refresh_git_status()
        assert host._git_status_job is not None

    def test_error_gracefully_handled(self, host, git_mock):
        git_mock.get_status.side_effect = RuntimeError("git broke")
        host._refresh_git_status()
        assert "Error" in host.deploy_status_var.get()

    def test_deploy_enabled_when_pipeline_and_dirty(self, host, git_mock):
        git_mock.get_status.return_value.dirty = True
        host.deploy_pipeline = MagicMock(spec=DeployPipeline)
        host._refresh_git_status()
        assert host.deploy_btn._config["state"] == "normal"


class TestDeployResultHandling:
    """Characterize _handle_deploy_result."""

    def test_success_sets_status_and_calls_refresh(self, host):
        host.deploy_pipeline = MagicMock(spec=DeployPipeline)
        result = DeployResult(success=True, committed=True, pushed=True, commit_hash="abc1234")
        host._handle_deploy_result(result)
        assert not host._deploy_running
        assert host.deploy_btn._config["text"] == "Guardar y publicar"
        assert host._sync_refreshed

    def test_failure_renders_errors(self, host):
        host.deploy_pipeline = MagicMock(spec=DeployPipeline)
        result = DeployResult(success=False, errors=["Error 1", "Error 2"])
        host._handle_deploy_result(result)
        assert not host._deploy_running
        assert host.deploy_btn._config["text"] == "Guardar y publicar"

    def test_warnings_passed_through(self, host):
        host.deploy_pipeline = MagicMock(spec=DeployPipeline)
        result = DeployResult(success=True, committed=True, pushed=True, commit_hash="abc1234", warnings=["warning!"])
        host._handle_deploy_result(result)
        assert host._sync_refreshed

    def test_handle_deploy_progress_updates_status(self, host):
        from admin.product_manager.deploy import DeployProgress, DeployStep

        host.deploy_pipeline = MagicMock(spec=DeployPipeline)
        progress = DeployProgress(step=DeployStep.CATEGORY_SYNC, message="syncing...")
        host._handle_deploy_progress(progress)
        assert len(host._status_updates) > 0

    def test_handle_deploy_progress_done_is_ignored(self, host):
        from admin.product_manager.deploy import DeployProgress, DeployStep

        status_before = len(host._status_updates)
        host.deploy_pipeline = MagicMock(spec=DeployPipeline)
        progress = DeployProgress(step=DeployStep.DONE, message="done")
        host._handle_deploy_progress(progress)
        assert len(host._status_updates) == status_before


class TestCommitAndPushActions:
    """Characterize _on_commit_click and _on_push_click."""

    def test_commit_without_git_is_noop(self, host):
        host.git_sync = None
        host._on_commit_click()

    def test_commit_success_toasts(self, host, git_mock):
        git_mock.build_commit_message.return_value = "test commit msg"
        git_mock.sync_changes.return_value = {"committed": True, "hash": "def5678"}
        host._on_commit_click()
        git_mock.sync_changes.assert_called_once()

    def test_commit_error_toasts(self, host, git_mock):
        git_mock.sync_changes.return_value = {"error": "failed"}
        host._on_commit_click()

    def test_push_success(self, host, git_mock):
        git_mock.push.return_value = True
        host._on_push_click()
        git_mock.push.assert_called_once()

    def test_push_failure(self, host, git_mock):
        git_mock.push.return_value = False
        host._on_push_click()

    def test_pull_success(self, host, git_mock):
        git_mock.pull.return_value = True
        host._on_pull_click()
        git_mock.pull.assert_called_once()

    def test_pull_conflict(self, host, git_mock):
        git_mock.pull.return_value = False
        host._on_pull_click()
