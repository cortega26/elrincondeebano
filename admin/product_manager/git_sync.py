"""Git integration for auto-commit/push of product catalog changes."""

from __future__ import annotations

import logging
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class GitSyncError(Exception):
    """Raised when a git operation fails."""


class GitNotAvailableError(GitSyncError):
    """Raised when git is not installed or the directory is not a repo."""


class GitConflictError(GitSyncError):
    """Raised when git reports merge conflicts."""


@dataclass
class GitStatus:
    """Structured git working-tree status."""
    dirty: bool = False
    staged: List[str] = field(default_factory=list)
    unstaged: List[str] = field(default_factory=list)
    untracked: List[str] = field(default_factory=list)
    branch: str = ""
    ahead: int = 0
    behind: int = 0
    has_conflicts: bool = False

    @property
    def change_count(self) -> int:
        return len(self.staged) + len(self.unstaged)

    @property
    def untracked_count(self) -> int:
        return len(self.untracked)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class GitSync:
    """Git integration layer for product catalog changes."""

    def __init__(
        self,
        repo_root: Optional[Path] = None,
        auto_stage_data: bool = True,
        auto_push: bool = False,
        remote: str = "origin",
        logger_instance: Optional[logging.Logger] = None,
    ):
        self._repo_root = Path(repo_root) if repo_root else Path.cwd()
        self.auto_stage_data = auto_stage_data
        self.auto_push = auto_push
        self.remote = remote
        self.logger = logger_instance or logger

    # ------------------------------------------------------------------
    #  Low-level git helpers
    # ------------------------------------------------------------------

    def _run_git(
        self,
        args: List[str],
        *,
        capture: bool = True,
        cwd: Optional[Path] = None,
        timeout: int = 30,
        check: bool = True,
    ) -> subprocess.CompletedProcess:
        """Run a git command and return the CompletedProcess."""
        work_dir = str(cwd or self._repo_root)
        try:
            return subprocess.run(
                ["git"] + list(args),
                cwd=work_dir,
                capture_output=capture,
                text=True,
                timeout=timeout,
                check=check,
            )
        except FileNotFoundError:
            raise GitNotAvailableError(
                "Git no está instalado. Instala git para usar la sincronización automática."
            ) from None
        except subprocess.TimeoutExpired as exc:
            raise GitSyncError(
                f"La operación git '{' '.join(args)}' excedió el tiempo límite."
            ) from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            stdout = (exc.stdout or "").strip()
            detail = stderr or stdout or str(exc)
            if "CONFLICT" in detail.upper() or "would be overwritten" in detail:
                raise GitConflictError(f"Conflicto detectado: {detail}") from exc
            raise GitSyncError(f"git {' '.join(args)} falló: {detail}") from exc

    def is_available(self) -> bool:
        """Check if git is available and cwd is a git repo."""
        try:
            result = self._run_git(
                ["rev-parse", "--is-inside-work-tree"], check=False
            )
            return result.returncode == 0
        except (GitNotAvailableError, GitSyncError):
            return False

    # ------------------------------------------------------------------
    #  Status
    # ------------------------------------------------------------------

    def get_status(self) -> GitStatus:
        """Build a GitStatus snapshot."""
        status = GitStatus()

        if not self.is_available():
            return status

        try:
            branch_result = self._run_git(
                ["rev-parse", "--abbrev-ref", "HEAD"], check=False
            )
            if branch_result.returncode == 0:
                status.branch = branch_result.stdout.strip()
        except GitSyncError:
            pass

        try:
            stat_result = self._run_git(
                ["status", "--porcelain"], check=False
            )
            if stat_result.returncode == 0:
                for line in stat_result.stdout.splitlines():
                    line = line.rstrip()
                    if not line:
                        continue
                    idx_code = line[:2].strip()
                    filename = line[3:].strip()
                    if "?" in idx_code:
                        status.untracked.append(filename)
                    elif "U" in idx_code or "A" in idx_code or "D" in idx_code or "M" in idx_code:
                        if "M" in idx_code or "A" in idx_code or "D" in idx_code:
                            if line[0] != " ":
                                status.staged.append(filename)
                            if line[1] != " " and "?" not in idx_code:
                                status.unstaged.append(filename)
                    if "U" in idx_code.replace("?", ""):
                        status.has_conflicts = True
        except GitSyncError:
            pass

        status.dirty = bool(status.staged or status.unstaged or status.untracked)

        try:
            ahead_result = self._run_git(
                ["rev-list", "--count", "@{upstream}..HEAD"], check=False
            )
            if ahead_result.returncode == 0:
                status.ahead = int(ahead_result.stdout.strip() or 0)
        except (GitSyncError, ValueError):
            pass

        try:
            behind_result = self._run_git(
                ["rev-list", "--count", "HEAD..@{upstream}"], check=False
            )
            if behind_result.returncode == 0:
                status.behind = int(behind_result.stdout.strip() or 0)
        except (GitSyncError, ValueError):
            pass

        return status

    # ------------------------------------------------------------------
    #  Operations
    # ------------------------------------------------------------------

    def stage_files(self, paths: List[str]) -> None:
        """Stage specific file paths."""
        if not paths:
            return
        self._run_git(["add", "--"] + paths)

    def stage_all_data(self) -> List[str]:
        """Stage all files under data/ that have changes."""
        data_dir = self._repo_root / "data"
        if not data_dir.exists():
            return []

        staged: List[str] = []
        for pattern in ["data/", "assets/images/"]:
            try:
                self._run_git(["add", "--", pattern])
                staged.append(pattern)
            except GitSyncError as exc:
                self.logger.warning("No se pudo agregar %s: %s", pattern, exc)
        return staged

    def commit(
        self,
        message: str,
        *,
        author: Optional[str] = None,
        allow_empty: bool = False,
    ) -> str:
        """Create a commit with the given message. Returns the new commit hash."""
        args = ["commit", "-m", message]
        if allow_empty:
            args.append("--allow-empty")
        if author:
            args.extend(["--author", author])
        self._run_git(args)
        try:
            rev_result = self._run_git(
                ["rev-parse", "--short", "HEAD"], cwd=self._repo_root
            )
            return rev_result.stdout.strip()
        except GitSyncError:
            return "HEAD"

    def push(self, *, set_upstream: bool = False) -> bool:
        """Push current branch to remote. Returns True if successful."""
        branch = self.get_status().branch
        if not branch:
            raise GitSyncError("No se pudo determinar la rama actual.")

        args = ["push"]
        if set_upstream:
            args.extend(["--set-upstream", self.remote, branch])
        else:
            args.extend([self.remote, branch])

        try:
            self._run_git(args, timeout=120)
            return True
        except GitSyncError as exc:
            self.logger.error("Push fallido: %s", exc)
            return False

    def pull(self) -> bool:
        """Pull latest changes from remote. Returns True if successful."""
        try:
            self._run_git(["pull", "--rebase", self.remote], timeout=120)
            return True
        except GitConflictError:
            self.logger.warning("Conflicto al hacer pull. Se requiere intervención manual.")
            return False
        except GitSyncError as exc:
            self.logger.error("Pull fallido: %s", exc)
            return False

    def get_diff_summary(self) -> str:
        """Return a human-readable summary of unstaged changes."""
        if not self.is_available():
            return ""
        try:
            result = self._run_git(
                ["diff", "--stat", "--", "data/", "assets/"], check=False
            )
            return result.stdout.strip()
        except GitSyncError:
            return ""

    def get_staged_diff_summary(self) -> str:
        """Return a human-readable summary of staged changes."""
        if not self.is_available():
            return ""
        try:
            result = self._run_git(
                ["diff", "--cached", "--stat", "--", "data/", "assets/"], check=False
            )
            return result.stdout.strip()
        except GitSyncError:
            return ""

    # ------------------------------------------------------------------
    #  High-level workflows
    # ------------------------------------------------------------------

    def build_commit_message(
        self,
        product_count: Optional[int] = None,
        category_count: Optional[int] = None,
        summary: str = "",
    ) -> str:
        """Build a standardised commit message for catalog changes."""
        parts: List[str] = []
        if product_count:
            parts.append(f"{product_count} producto(s)")
        if category_count:
            parts.append(f"{category_count} categoría(s)")
        if summary:
            parts.append(summary)
        elif parts:
            parts.append("actualizado(s)")
        else:
            parts.append("actualización del catálogo")

        ts = datetime.now().strftime("%Y-%m-%d %H:%M")
        return f"catálogo: {'; '.join(parts)} [{ts}]"

    def sync_changes(
        self,
        message: Optional[str] = None,
        *,
        stage: bool = True,
        push: Optional[bool] = None,
        product_count: int = 0,
        category_count: int = 0,
        summary: str = "",
        on_progress: Optional[Callable[[str], None]] = None,
    ) -> Dict[str, Any]:
        """Complete sync workflow: stage → commit → push.

        Returns a dict with keys: committed (bool), pushed (bool), hash (str), message (str).
        """
        result: Dict[str, Any] = {
            "committed": False,
            "pushed": False,
            "hash": "",
            "message": message or "",
        }

        if not self.is_available():
            result["error"] = "Git no está disponible en este directorio."
            return result

        should_push = push if push is not None else self.auto_push

        if stage and self.auto_stage_data:
            if on_progress:
                on_progress("Preparando archivos de datos...")
            self.stage_all_data()

        msg = message or self.build_commit_message(
            product_count=product_count,
            category_count=category_count,
            summary=summary,
        )
        result["message"] = msg

        try:
            if on_progress:
                on_progress("Creando commit...")
            commit_hash = self.commit(msg, allow_empty=False)
            result["committed"] = True
            result["hash"] = commit_hash
        except GitSyncError as exc:
            if "nothing to commit" in str(exc).lower():
                result["error"] = "Sin cambios para commitear."
                return result
            raise

        if should_push:
            if on_progress:
                on_progress("Subiendo cambios al repositorio remoto...")
            try:
                result["pushed"] = self.push()
            except GitSyncError as exc:
                result["push_error"] = str(exc)

        return result

    def rollback_last_commit(self) -> bool:
        """Revert the last commit (soft reset). Returns True if successful."""
        try:
            self._run_git(["reset", "--soft", "HEAD~1"])
            return True
        except GitSyncError as exc:
            self.logger.error("Rollback fallido: %s", exc)
            return False


def detect_repo_root() -> Optional[Path]:
    """Auto-detect git repository root from cwd."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        return Path(result.stdout.strip())
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return None
