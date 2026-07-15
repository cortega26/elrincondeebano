"""Tests for git_sync module."""

from __future__ import annotations

import subprocess
from unittest.mock import MagicMock, patch

import pytest

from admin.product_manager.git_sync import GitSync, GitSyncError, GitStatus, detect_repo_root


@pytest.fixture
def git_sync_fixture(tmp_path):
    return GitSync(repo_root=tmp_path, auto_stage_data=False)


class TestGitSync:
    def test_is_available_returns_false_outside_repo(self, git_sync_fixture):
        assert git_sync_fixture.is_available() is False

    @patch("subprocess.run")
    def test_is_available_returns_true_inside_repo(self, mock_run, tmp_path):
        mock_run.return_value = MagicMock(returncode=0)
        gs = GitSync(repo_root=tmp_path)
        assert gs.is_available() is True

    def test_get_status_returns_empty_when_not_available(self, git_sync_fixture):
        status = git_sync_fixture.get_status()
        assert isinstance(status, GitStatus)
        assert status.branch == ""
        assert status.dirty is False

    def test_build_commit_message_with_counts(self, tmp_path):
        gs = GitSync(repo_root=tmp_path)
        msg = gs.build_commit_message(product_count=5, category_count=2, summary="prueba")
        assert "5 producto(s)" in msg
        assert "2 categoría(s)" in msg
        assert "prueba" in msg

    @patch("subprocess.run")
    def test_commit_failure_raises_git_sync_error(self, mock_run, tmp_path):
        mock_run.side_effect = subprocess.CalledProcessError(
            1, "git", stderr="fatal: something wrong"
        )
        gs = GitSync(repo_root=tmp_path, auto_stage_data=False)
        with patch.object(gs, "is_available", return_value=True):
            with pytest.raises(GitSyncError):
                gs.commit("test commit")

    def test_sync_changes_commits(self, tmp_path):
        gs = GitSync(repo_root=tmp_path, auto_stage_data=True)

        with patch.object(gs, "is_available", return_value=True), \
             patch.object(gs, "stage_all_data", return_value=[]), \
             patch.object(gs, "commit", return_value="abc1234"):
            result = gs.sync_changes(message="test", push=False)

        assert result["committed"] is True
        assert result["hash"] == "abc1234"

    @patch("subprocess.run")
    def test_pull_returns_false_on_conflict(self, mock_run, tmp_path):
        mock_run.side_effect = subprocess.CalledProcessError(
            1, "git", stderr="CONFLICT (content): Merge conflict"
        )
        gs = GitSync(repo_root=tmp_path)
        assert gs.pull() is False

    def test_detect_repo_root_does_not_crash(self):
        result = detect_repo_root()
        assert result is not None or result is None

    def test_push_succeeds(self, tmp_path):
        gs = GitSync(repo_root=tmp_path)
        with patch.object(gs, "get_status", return_value=MagicMock(
            branch="main", dirty=False, change_count=0, untracked_count=0,
            ahead=0, behind=0, has_conflicts=False,
        )), patch.object(gs, "_run_git", return_value=MagicMock(returncode=0)):
            assert gs.push() is True

    def test_rollback_last_commit_succeeds(self, tmp_path):
        gs = GitSync(repo_root=tmp_path)
        with patch.object(gs, "_run_git", return_value=MagicMock(returncode=0)):
            assert gs.rollback_last_commit() is True
