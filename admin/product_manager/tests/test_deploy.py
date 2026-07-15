"""Tests for deploy module."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from admin.product_manager.deploy import (
    DeployPipeline,
    DeployResult,
    DeployError,
)


@pytest.fixture
def deploy_pipeline_fixture(tmp_path):
    git_mock = MagicMock()
    git_mock.is_available.return_value = True
    git_mock.get_status.return_value = MagicMock(
        branch="main", dirty=False, change_count=0, untracked_count=0,
        ahead=0, behind=0, has_conflicts=False,
    )
    git_mock.stage_all_data.return_value = ["data/"]
    git_mock.commit.return_value = "abc1234"
    git_mock.push.return_value = True
    git_mock.build_commit_message.return_value = "catalogo: test"

    return DeployPipeline(repo_root=tmp_path, git_sync=git_mock)


class TestDeployPipeline:
    def test_run_returns_result_on_success(self, deploy_pipeline_fixture):
        p = deploy_pipeline_fixture
        with patch.object(p, "_sync_categories"), \
             patch.object(p, "_generate_og_images"):
            result = p.run(product_count=3, category_count=1, summary="prueba")

        assert isinstance(result, DeployResult)
        assert result.success is True
        assert result.committed is True
        assert result.pushed is True
        assert result.commit_hash == "abc1234"
        assert len(result.errors) == 0

    def test_run_returns_errors_on_failure(self, deploy_pipeline_fixture):
        p = deploy_pipeline_fixture
        with patch.object(
            p, "_sync_categories", side_effect=DeployError("fallo categorias")
        ):
            result = p.run()

        assert result.success is False
        assert len(result.errors) > 0
        assert "fallo categorias" in str(result.errors[0])

    def test_cancel_sets_event(self, deploy_pipeline_fixture):
        deploy_pipeline_fixture.cancel()
        assert deploy_pipeline_fixture._cancel_event.is_set()

    def test_is_running_returns_false_initially(self, deploy_pipeline_fixture):
        assert deploy_pipeline_fixture.is_running is False

    def test_quick_status_returns_dict(self, deploy_pipeline_fixture):
        status = deploy_pipeline_fixture.quick_status()
        assert isinstance(status, dict)
        assert "git_available" in status
        assert "branch" in status
        assert "can_deploy" in status
