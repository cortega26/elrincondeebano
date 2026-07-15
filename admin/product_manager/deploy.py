"""Deploy pipeline orchestrator for the Product Manager.

Coordinates catalog changes through the content-manager toolchain:
category registry sync → OG asset generation → git stage/commit/push.
"""

from __future__ import annotations

import logging
import os
import subprocess
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum, auto
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .git_sync import GitSync, GitSyncError

logger = logging.getLogger(__name__)


class DeployStep(Enum):
    """Steps in the deploy pipeline."""
    NONE = auto()
    CATEGORY_SYNC = auto()
    OG_IMAGES = auto()
    STAGE = auto()
    COMMIT = auto()
    PUSH = auto()
    BUILD_CHECK = auto()
    DONE = auto()


STEP_LABELS: Dict[DeployStep, str] = {
    DeployStep.CATEGORY_SYNC: "Sincronizando catálogo de categorías...",
    DeployStep.OG_IMAGES: "Generando imágenes OpenGraph...",
    DeployStep.STAGE: "Preparando archivos para commit...",
    DeployStep.COMMIT: "Creando commit...",
    DeployStep.PUSH: "Subiendo cambios al repositorio remoto...",
    DeployStep.BUILD_CHECK: "Verificando build...",
}


class DeployError(Exception):
    """Raised when a deploy operation fails."""


@dataclass
class DeployProgress:
    """Progress payload for UI feedback during deploy."""
    step: DeployStep = DeployStep.NONE
    message: str = ""
    percent: float = 0.0
    detail: str = ""


@dataclass
class DeployResult:
    """Outcome of a deploy pipeline run."""
    success: bool = False
    committed: bool = False
    pushed: bool = False
    commit_hash: str = ""
    message: str = ""
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    started_at: str = ""
    finished_at: str = ""
    build_ok: Optional[bool] = None


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class DeployPipeline:
    """Orchestrate the content-manager toolchain for a full deploy."""

    def __init__(
        self,
        repo_root: Optional[Path] = None,
        git_sync: Optional[GitSync] = None,
        *,
        skip_og: bool = False,
        skip_push: bool = False,
        run_build_check: bool = False,
        logger_instance: Optional[logging.Logger] = None,
    ):
        self.repo_root = repo_root or Path.cwd()
        self.git = git_sync or GitSync(repo_root=self.repo_root)
        self.skip_og = skip_og
        self.skip_push = skip_push
        self.run_build_check = run_build_check
        self.logger = logger_instance or logger

        self._cancel_event = threading.Event()
        self._running = False

    def cancel(self) -> None:
        """Signal the pipeline to abort."""
        self._cancel_event.set()

    @property
    def is_running(self) -> bool:
        return self._running

    # ------------------------------------------------------------------
    #  Pipeline steps
    # ------------------------------------------------------------------

    def _run_npm(
        self, script: str, *, timeout: int = 120, env: Optional[Dict[str, str]] = None
    ) -> subprocess.CompletedProcess:
        """Run an npm script with shared environment."""
        try:
            return subprocess.run(
                ["npm", "run", script],
                cwd=str(self.repo_root),
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
                env={**os.environ, **(env or {})},
            )
        except FileNotFoundError:
            raise DeployError(
                "npm no está disponible. Asegúrate de que Node.js esté instalado."
            ) from None

    def _sync_categories(self) -> None:
        """Run category registry sync."""
        self.logger.info("Sincronizando categorías...")
        result = self._run_npm("categories:sync", timeout=60)
        if result.returncode != 0:
            detail = result.stderr or result.stdout or "Código de salida: " + str(result.returncode)
            raise DeployError(f"Error al sincronizar categorías: {detail.strip()}")

    def _generate_og_images(self) -> None:
        """Run OpenGraph image generation for categories."""
        if self.skip_og:
            self.logger.info("Generación de imágenes OG omitida (skip_og=True)")
            return
        self.logger.info("Generando imágenes OpenGraph...")
        result = self._run_npm("images:og:categories", timeout=180)
        if result.returncode != 0:
            detail = result.stderr or result.stdout or "Código de salida: " + str(result.returncode)
            self.logger.warning("Generación OG tuvo advertencias: %s", detail.strip())

    def _run_build_verification(self) -> bool:
        """Run a build to verify catalog integrity. Returns True if build passes."""
        self.logger.info("Verificando build...")
        try:
            result = self._run_npm("build:fast", timeout=300)
            if result.returncode == 0:
                return True
            detail = result.stderr or result.stdout or "Código de salida: " + str(result.returncode)
            self.logger.error("Build falló: %s", detail.strip())
            return False
        except DeployError as exc:
            self.logger.error("Build falló: %s", exc)
            return False

    # ------------------------------------------------------------------
    #  Full pipeline
    # ------------------------------------------------------------------

    def run(
        self,
        *,
        message: Optional[str] = None,
        product_count: int = 0,
        category_count: int = 0,
        summary: str = "",
        on_progress: Optional[Callable[[DeployProgress], None]] = None,
    ) -> DeployResult:
        """Execute the full deploy pipeline synchronously.

        Steps: category_sync → og_images → stage → commit → push → (optional) build_check
        """
        if self._running:
            raise DeployError("Ya hay un despliegue en curso.")

        self._running = True
        self._cancel_event.clear()
        result = DeployResult(started_at=_utc_now_iso())

        total_steps = 4
        if self.run_build_check:
            total_steps += 1

        def _progress(step: DeployStep, detail: str = "", pct: Optional[float] = None):
            if pct is None:
                idx = list(DeployStep).index(step) - 1
                pct = (idx / total_steps) * 100 if idx > 0 else 0
            if on_progress:
                on_progress(
                    DeployProgress(
                        step=step,
                        message=STEP_LABELS.get(step, ""),
                        percent=pct,
                        detail=detail,
                    )
                )

        try:
            if self._cancel_event.is_set():
                result.errors.append("Despliegue cancelado por el usuario.")
                return result

            _progress(DeployStep.CATEGORY_SYNC)
            self._sync_categories()
            self.logger.info("Sincronización de categorías completada.")

            _progress(DeployStep.OG_IMAGES)
            self._generate_og_images()

            _progress(DeployStep.STAGE)
            self.git.stage_all_data()

            _progress(DeployStep.COMMIT)
            msg = message or self.git.build_commit_message(
                product_count=product_count,
                category_count=category_count,
                summary=summary,
            )
            commit_hash = self.git.commit(msg)
            result.committed = True
            result.commit_hash = commit_hash
            result.message = msg

            if not self.skip_push:
                _progress(DeployStep.PUSH)
                try:
                    result.pushed = self.git.push()
                except GitSyncError as exc:
                    result.warnings.append(f"Push fallido: {exc}")

            if self.run_build_check:
                _progress(DeployStep.BUILD_CHECK)
                result.build_ok = self._run_build_verification()
                if not result.build_ok:
                    result.warnings.append(
                        "El build de verificación falló. Revise los logs antes de desplegar."
                    )

            _progress(DeployStep.DONE, pct=100.0)
            result.success = True
            result.finished_at = _utc_now_iso()

        except DeployError as exc:
            result.errors.append(str(exc))
            result.finished_at = _utc_now_iso()
        except Exception as exc:  # pylint: disable=broad-exception-caught
            result.errors.append(f"Error inesperado: {exc}")
            result.finished_at = _utc_now_iso()
        finally:
            self._running = False

        return result

    def run_async(
        self,
        *,
        message: Optional[str] = None,
        product_count: int = 0,
        category_count: int = 0,
        summary: str = "",
        on_progress: Optional[Callable[[DeployProgress], None]] = None,
        on_complete: Optional[Callable[[DeployResult], None]] = None,
    ) -> threading.Thread:
        """Execute the deploy pipeline in a background thread."""

        def _runner():
            try:
                result = self.run(
                    message=message,
                    product_count=product_count,
                    category_count=category_count,
                    summary=summary,
                    on_progress=on_progress,
                )
            except Exception as exc:  # pylint: disable=broad-exception-caught
                result = DeployResult(
                    errors=[str(exc)],
                    finished_at=_utc_now_iso(),
                )
            if on_complete:
                on_complete(result)

        thread = threading.Thread(target=_runner, name="DeployPipeline", daemon=True)
        thread.start()
        return thread

    # ------------------------------------------------------------------
    #  Status / helpers
    # ------------------------------------------------------------------

    def quick_status(self) -> Dict[str, Any]:
        """Return a lightweight status summary for the UI status bar."""
        git_status = self.git.get_status()
        return {
            "git_available": self.git.is_available(),
            "branch": git_status.branch,
            "dirty": git_status.dirty,
            "change_count": git_status.change_count,
            "untracked_count": git_status.untracked_count,
            "ahead": git_status.ahead,
            "behind": git_status.behind,
            "has_conflicts": git_status.has_conflicts,
            "can_deploy": git_status.dirty and git_status.branch,
        }


def create_deploy_pipeline(
    repo_root: Optional[Path] = None,
    **kwargs: Any,
) -> DeployPipeline:
    """Factory for creating a DeployPipeline with standard defaults."""
    return DeployPipeline(repo_root=repo_root, **kwargs)
